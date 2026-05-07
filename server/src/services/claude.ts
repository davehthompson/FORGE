import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { jsonrepair } from 'jsonrepair';
import {
  CompanyProfile,
  AssetType,
  AssetData,
  RelatedAssetContext,
  QuoteData,
  ContractData,
  InvoiceConfig,
  InvoiceData,
  ReceiptData,
  PaperReceiptData,
  HotelFolioData,
  AirlineReceiptData,
} from '../types.js';
import { buildLogoUrl } from '../utils/logoUrl.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL = 'claude-opus-4-7';
const TIMEOUT_MS = 60_000;

// Per-call-site token budgets. Tuned for Claude Opus 4.7's 128k output ceiling
// but kept tight to control cost. See plan: claude_opus_4.7_migration.
const TOKEN_BUDGETS = {
  asset: 8000,
  receipt: 6000,
  enrichment: 4000,
} as const;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ClaudeErrorCode =
  | 'TRUNCATED'
  | 'PARSE_ERROR'
  | 'API_ERROR'
  | 'AUTH_ERROR'
  | 'TIMEOUT';

export class ClaudeError extends Error {
  constructor(
    public code: ClaudeErrorCode,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'ClaudeError';
  }
}

const USER_FACING_MESSAGES: Record<ClaudeErrorCode, string> = {
  TRUNCATED:
    'The AI response was too long for this request. Try fewer line items or a shorter description and try again.',
  PARSE_ERROR: 'The AI returned an unexpected format. Please try again.',
  API_ERROR: 'AI service is temporarily unavailable. Please try again in a moment.',
  AUTH_ERROR: 'AI service is misconfigured. Please contact support.',
  TIMEOUT: 'AI service took too long to respond. Please try again.',
};

export function getUserFacingMessage(code: ClaudeErrorCode): string {
  return USER_FACING_MESSAGES[code];
}

/**
 * Map any thrown error into the standard route response shape:
 *   { status, body: { success: false, error, code } }
 *
 * For ClaudeError, surfaces the per-code user message and HTTP status that
 * makes sense for the failure mode. For unknown errors, falls back to a
 * generic 500 + INTERNAL code so the client can always rely on `code`.
 */
export function formatErrorResponse(err: unknown): {
  status: number;
  body: { success: false; error: string; code: string };
} {
  if (err instanceof ClaudeError) {
    const status =
      err.code === 'AUTH_ERROR'
        ? 500
        : err.code === 'API_ERROR'
          ? 503
          : err.code === 'TIMEOUT'
            ? 504
            : err.code === 'TRUNCATED' || err.code === 'PARSE_ERROR'
              ? 502
              : 500;
    return {
      status,
      body: { success: false, error: getUserFacingMessage(err.code), code: err.code },
    };
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  return {
    status: 500,
    body: { success: false, error: message, code: 'INTERNAL' },
  };
}

/**
 * Run `op` and silently retry once on PARSE_ERROR. Used to insulate user-
 * visible flows (enrichment) from the inevitable ~1% rate of LLM JSON
 * malformations that even `jsonrepair` can't recover. The caller never sees
 * the first failure; both attempts are logged for diagnostics so we can spot
 * systemic issues in server logs.
 *
 * Only PARSE_ERROR is retried — TRUNCATED, AUTH_ERROR, TIMEOUT, and
 * API_ERROR represent real, persistent problems where a retry would just
 * compound the failure.
 */
async function withParseRetry<T>(
  label: string,
  op: (attempt: number) => Promise<T>,
): Promise<T> {
  try {
    return await op(1);
  } catch (firstErr) {
    if (firstErr instanceof ClaudeError && firstErr.code === 'PARSE_ERROR') {
      console.warn(
        `[${label}] PARSE_ERROR on attempt 1 — retrying once. cause:`,
        firstErr.cause instanceof Error ? firstErr.cause.message : firstErr.cause,
      );
      try {
        return await op(2);
      } catch (secondErr) {
        if (secondErr instanceof ClaudeError && secondErr.code === 'PARSE_ERROR') {
          console.error(
            `[${label}] PARSE_ERROR on attempt 2 — giving up. cause:`,
            secondErr.cause instanceof Error ? secondErr.cause.message : secondErr.cause,
          );
        }
        throw secondErr;
      }
    }
    throw firstErr;
  }
}

function mapClaudeError(err: unknown): ClaudeError {
  if (err instanceof ClaudeError) return err;
  const e = err as {
    status?: number;
    name?: string;
    code?: string;
    message?: string;
  };
  if (e?.status === 401 || e?.status === 403) {
    return new ClaudeError('AUTH_ERROR', 'Anthropic API authentication failed', err);
  }
  if (e?.status === 429) {
    return new ClaudeError('API_ERROR', 'Anthropic API rate limit hit', err);
  }
  if (typeof e?.status === 'number' && e.status >= 500 && e.status < 600) {
    return new ClaudeError('API_ERROR', `Anthropic API server error (${e.status})`, err);
  }
  if (
    e?.name === 'AbortError' ||
    e?.code === 'ETIMEDOUT' ||
    (typeof e?.message === 'string' && /timeout|timed out/i.test(e.message))
  ) {
    return new ClaudeError('TIMEOUT', 'Request to Anthropic timed out', err);
  }
  return new ClaudeError('API_ERROR', e?.message || 'Anthropic API request failed', err);
}

// ---------------------------------------------------------------------------
// Client + low-level call helpers
// ---------------------------------------------------------------------------

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new ClaudeError(
      'AUTH_ERROR',
      'ANTHROPIC_API_KEY is not configured. Please add your Anthropic API key to the environment.',
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

function extractTextFromContent(blocks: Anthropic.ContentBlock[]): string {
  return blocks
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function extractJSON<T = unknown>(
  text: string,
  pattern: RegExp = /\{[\s\S]*\}/,
): T {
  const match = text.match(pattern);
  if (!match) throw new ClaudeError('PARSE_ERROR', 'No JSON found in response');
  const raw = match[0];

  // Fast path — if Claude returned strict JSON, parse and return.
  try {
    return JSON.parse(raw) as T;
  } catch (firstErr) {
    // Slow path — common LLM mistakes (unescaped quotes/newlines inside
    // string values, smart quotes from web_search results, trailing commas,
    // single-quoted strings, code-fence wrappers). jsonrepair handles all of
    // these without losing data. We swallow the first error and retry; if
    // the repaired text still won't parse, throw with the ORIGINAL error so
    // the cause stack points at the real syntax issue, not the repair attempt.
    try {
      const repaired = jsonrepair(raw);
      return JSON.parse(repaired) as T;
    } catch {
      throw new ClaudeError(
        'PARSE_ERROR',
        'Failed to parse JSON from response (after repair attempt)',
        firstErr,
      );
    }
  }
}

interface CallOpts {
  system: string;
  user: string;
  maxTokens: number;
  tools?: Anthropic.Messages.ToolUnion[];
}

// NOTE: Opus 4.7 rejects `temperature` (returns 400 invalid_request_error
// "`temperature` is deprecated for this model."). We deliberately omit it.

async function callClaude(opts: CallOpts): Promise<{
  text: string;
  raw: Anthropic.Message;
}> {
  const client = getClient();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
        ...(opts.tools ? { tools: opts.tools } : {}),
      },
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    throw mapClaudeError(err);
  }

  if (response.stop_reason === 'max_tokens') {
    throw new ClaudeError(
      'TRUNCATED',
      'Response was truncated due to max_tokens limit',
    );
  }

  return { text: extractTextFromContent(response.content), raw: response };
}

interface StreamCallOpts extends CallOpts {
  onDelta?: (text: string) => void;
  /**
   * Optional log tag (e.g. `[generate a3f2]`). When provided, the helper
   * emits structured `<tag> claude_request_sent / text_delta_first /
   * stop_reason / claude_threw / truncated` lines with `elapsed_ms`.
   * Mirrors the manual logging in `attemptEnrichCompanyProfileStreaming`
   * so any caller that threads a reqId through gets the same Ramplify
   * gateway-drop diagnostics for free.
   */
  tag?: string;
}

async function callClaudeStream(opts: StreamCallOpts): Promise<{
  text: string;
  stopReason: Anthropic.Message['stop_reason'];
}> {
  const client = getClient();
  let text = '';
  let stopReason: Anthropic.Message['stop_reason'] = null;
  const tag = opts.tag;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  let firstTextDeltaSeen = false;

  if (tag) console.log(`${tag} claude_request_sent elapsed_ms=${elapsed()} max_tokens=${opts.maxTokens}`);

  try {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
        ...(opts.tools ? { tools: opts.tools } : {}),
      },
      { timeout: TIMEOUT_MS },
    );

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        if (tag && !firstTextDeltaSeen) {
          firstTextDeltaSeen = true;
          console.log(`${tag} text_delta_first elapsed_ms=${elapsed()}`);
        }
        const chunk = event.delta.text;
        text += chunk;
        opts.onDelta?.(chunk);
      } else if (event.type === 'message_delta' && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason;
        if (tag) console.log(`${tag} stop_reason reason=${stopReason} elapsed_ms=${elapsed()} text_len=${text.length}`);
      }
    }
  } catch (err) {
    if (tag) console.error(`${tag} claude_threw elapsed_ms=${elapsed()} text_len=${text.length}`);
    throw mapClaudeError(err);
  }

  if (stopReason === 'max_tokens') {
    if (tag) console.warn(`${tag} truncated elapsed_ms=${elapsed()} text_len=${text.length} max_tokens=${opts.maxTokens}`);
    throw new ClaudeError(
      'TRUNCATED',
      'Response was truncated due to max_tokens limit',
    );
  }

  return { text, stopReason };
}

// ---------------------------------------------------------------------------
// Domain helpers (ported from openai.ts; behavior unchanged)
// ---------------------------------------------------------------------------

/**
 * Pull a usable domain off Claude's output. Claude is asked for `domain`
 * directly, but occasionally fills only `email` ("billing@example.com").
 * Mirrors client/src/utils/domain.ts so server- and client-side fallback
 * behavior stays consistent.
 */
function resolveAssetDomain(opts: { domain?: string; email?: string }): string {
  if (opts.domain && opts.domain.trim()) return opts.domain.trim();
  if (opts.email && opts.email.includes('@')) {
    return opts.email.split('@')[1].trim();
  }
  return '';
}

/**
 * Stamp a server-built Logo.dev URL onto the relevant entity in an asset
 * payload (vendor / store / provider / airline / hotel). Mutates `data`
 * in place and returns it.
 *
 * Mirrors what enrichment.ts already does for CompanyProfile.logo. Lets the
 * client render logos without needing VITE_LOGO_DEV_KEY baked into the
 * bundle — a single env var (LOGO_DEV_KEY, server-side) covers everything.
 */
export function stampAssetLogos(type: AssetType, data: AssetData): AssetData {
  switch (type) {
    case 'invoice':
    case 'quote': {
      const d = data as InvoiceData | QuoteData;
      if (d.vendor) {
        d.vendor.logoUrl = buildLogoUrl(
          resolveAssetDomain({ domain: d.vendor.domain, email: d.vendor.email }),
        );
      }
      break;
    }
    case 'receipt': {
      const d = data as ReceiptData;
      if (d.vendor) {
        d.vendor.logoUrl = buildLogoUrl(resolveAssetDomain({ domain: d.vendor.domain }));
      }
      break;
    }
    case 'paper_receipt': {
      const d = data as PaperReceiptData;
      if (d.store) {
        d.store.logoUrl = buildLogoUrl(resolveAssetDomain({ domain: d.store.domain }));
      }
      break;
    }
    case 'hotel_folio': {
      const d = data as HotelFolioData;
      if (d.hotel) {
        d.hotel.logoUrl = buildLogoUrl(
          resolveAssetDomain({ domain: d.hotel.domain, email: d.hotel.email }),
        );
      }
      break;
    }
    case 'airline_receipt': {
      const d = data as AirlineReceiptData;
      if (d.airline) {
        d.airline.logoUrl = buildLogoUrl(resolveAssetDomain({ domain: d.airline.domain }));
      }
      break;
    }
    case 'contract': {
      const d = data as ContractData;
      if (d.parties?.provider) {
        d.parties.provider.logoUrl = buildLogoUrl(
          resolveAssetDomain({ domain: d.parties.provider.domain }),
        );
      }
      break;
    }
  }
  return data;
}

function ensureLineItemIds(type: AssetType, data: AssetData): AssetData {
  if (type === 'invoice') {
    const d = data as InvoiceData;
    if (d.lineItems?.length) {
      d.lineItems = d.lineItems.map((item) => ({
        ...item,
        id: item.id || crypto.randomUUID(),
      }));
    }
  } else if (type === 'quote') {
    const d = data as QuoteData;
    if (d.items?.length) {
      d.items = d.items.map((item) => ({
        ...item,
        id: item.id || crypto.randomUUID(),
      }));
    }
  }
  return data;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const VENDOR_EXAMPLES: Record<string, string[]> = {
  'office supplies|office equipment': ['Staples', 'Office Depot', 'W.B. Mason', 'Uline'],
  'technology|hardware|IT equipment|computers': ['Dell', 'CDW', 'Insight Enterprises', 'SHI International', 'Lenovo', 'HP Inc.'],
  'software|SaaS|subscriptions': ['Microsoft', 'Salesforce', 'Adobe', 'Atlassian', 'ServiceNow', 'Oracle'],
  'equipment purchase|equipment maintenance|machinery|industrial equipment': ['Grainger', 'Fastenal', 'MSC Industrial Direct', 'Applied Industrial Technologies', 'Motion Industries', 'Trane Technologies'],
  'utilities|facilities management|building services': ['ABM Industries', 'CBRE', 'JLL (Jones Lang LaSalle)', 'Cushman & Wakefield', 'Cintas', 'Ecolab', 'Waste Management'],
  'logistics|shipping|freight|supply chain|process and logistics': ['FedEx', 'UPS', 'DHL Supply Chain', 'XPO Logistics', 'C.H. Robinson', 'Kuehne+Nagel', 'Maersk'],
  'manufacturing|production|raw materials': ['3M', 'Honeywell', 'Emerson Electric', 'Parker Hannifin', 'Illinois Tool Works', 'Dow Inc.'],
  'marketing|advertising|media': ['WPP', 'Omnicom Group', 'Publicis Groupe', 'HubSpot', 'Hootsuite', 'Sprinklr'],
  'legal|compliance': ['Baker McKenzie', 'DLA Piper', 'Latham & Watkins', 'Skadden Arps', 'Kirkland & Ellis'],
  'consulting|advisory|professional services|audit': ['Deloitte', 'KPMG', 'Accenture', 'McKinsey', 'Booz Allen Hamilton', 'PwC'],
  'travel|entertainment': ['Marriott', 'Hilton', 'United Airlines', 'Enterprise Rent-A-Car', 'Concur (SAP)'],
  'recruiting|staffing|HR|human resources': ['Robert Half', 'Kforce', 'Randstad', 'ADP', 'Insperity', 'Paychex'],
  'security|cybersecurity': ['Securitas', 'Allied Universal', 'CrowdStrike', 'Palo Alto Networks', 'Fortinet', 'Garda World'],
  'telecom|communications|internet': ['AT&T Business', 'Verizon Business', 'Comcast Business', 'Lumen Technologies', 'T-Mobile Business'],
  'cloud|hosting|infrastructure': ['Amazon Web Services (AWS)', 'Microsoft Azure', 'Google Cloud', 'Rackspace', 'DigitalOcean'],
  'construction|building|renovation': ['Turner Construction', 'Bechtel', 'Skanska', 'AECOM', 'Jacobs Engineering'],
  'printing|signage|promotional': ['Vistaprint', 'FedEx Office', 'Minuteman Press', '4imprint', 'Cimpress'],
  'food|catering|cafeteria|dining': ['Aramark', 'Sodexo', 'Compass Group', 'ezCater', 'US Foods'],
  'insurance|risk': ['Marsh McLennan', 'Aon', 'Willis Towers Watson', 'The Hartford', 'Zurich Insurance'],
  'medical|healthcare|lab supplies': ['McKesson', 'Henry Schein', 'Cardinal Health', 'Medline Industries', 'Stryker'],
  'automotive|fleet|vehicles': ['Enterprise Fleet Management', 'LeasePlan', 'Penske', 'Ryder', 'Element Fleet'],
  'janitorial|cleaning|sanitation': ['Cintas', 'ServiceMaster', 'ABM Industries', 'Kärcher', 'Ecolab'],
  'research|laboratory|scientific': ['Thermo Fisher Scientific', 'Agilent Technologies', 'MilliporeSigma', 'Bio-Rad Laboratories'],
  'training|education|professional development': ['Coursera for Business', 'LinkedIn Learning', 'Udemy Business', 'Skillsoft', 'Dale Carnegie'],
  'energy|power|fuel': ['Enel', 'Duke Energy', 'Shell Commercial', 'BP Business', 'Schneider Electric'],
};

function getVendorExamples(spendingCategory: string): string {
  const category = spendingCategory.toLowerCase();
  const matched: string[] = [];
  for (const [pattern, vendors] of Object.entries(VENDOR_EXAMPLES)) {
    const keywords = pattern.split('|');
    if (keywords.some((kw) => category.includes(kw))) {
      matched.push(...vendors);
    }
  }
  const unique = [...new Set(matched)];
  if (unique.length > 0) {
    return `Suggested real vendors for "${spendingCategory}": ${unique.join(', ')}`;
  }
  return `Find real, well-known vendors that specialize in "${spendingCategory}". Do NOT default to consulting firms.`;
}

const TAX_CONFIG: Record<string, string> = {
  USD: `US Sales Tax. Tax name: "Sales Tax". Rate varies by state (typically 4-10% combined state+local). 5 states have no sales tax (AK, DE, MT, NH, OR). Determine state from company location and use the typical combined rate for that state.
Category-specific rules: Grocery food (unprepared) is exempt in most states. Prepared food and restaurant meals are taxable. Candy and soft drinks are taxable in most states. Prescription medicine is exempt in all states. Clothing is exempt in some states (PA, NJ, MN, NY under $110). Professional services are often exempt but varies by state.`,

  CAD: `Canadian GST/HST/PST. Determine the province from company location and use the correct tax structure:
- Alberta: GST 5% only (single line: "GST")
- British Columbia: GST 5% + PST 7% (two separate lines: "GST" and "PST")
- Manitoba: GST 5% + RST 7% (two separate lines: "GST" and "RST")
- New Brunswick: HST 15% (single line: "HST")
- Newfoundland & Labrador: HST 15% (single line: "HST")
- Northwest Territories / Nunavut / Yukon: GST 5% only (single line: "GST")
- Nova Scotia: HST 14% (single line: "HST")
- Ontario: HST 13% (single line: "HST")
- Prince Edward Island: HST 15% (single line: "HST")
- Quebec: GST 5% + QST 9.975% (two separate lines: "GST" and "QST")
- Saskatchewan: GST 5% + PST 6% (two separate lines: "GST" and "PST")
Category-specific rules: Basic groceries (meat, vegetables, dairy, eggs, bread, canned goods) are zero-rated (0%). Prepared food and hot food are fully taxed. Bakery items (1-5 units) are taxed; 6+ units are zero-rated. Alcohol is fully taxed. Prescription drugs are zero-rated.`,

  GBP: `UK VAT. Tax name: "VAT". Three tiers: 20% standard, 5% reduced, 0% zero-rated.
Category-specific rules: Most goods and services: 20%. Cold unprepared food: 0%. Hot takeaway food, restaurant meals: 20%. Alcohol, soft drinks, ice cream, confectionery, crisps: 20%. Children's clothing and footwear: 0%. Books, newspapers, magazines: 0%. Prescription medicines: 0%. Domestic fuel and power: 5%. Children's car seats: 5%.
For most business invoices (services, equipment, supplies), use 20%. Show as a single "VAT" line.`,

  EUR: `EU VAT. The tax name and rates depend on the country. Determine the country from company location.
- Germany: 19% standard, 7% reduced. Tax name: "MwSt". Food, books, flowers, public transport: 7%. Restaurant/catering: 7%. Most goods/services: 19%.
- France: 20% standard, 10% reduced, 5.5% reduced, 2.1% super-reduced. Tax name: "TVA". Restaurants/prepared food: 10%. Grocery food, water, books: 5.5%. Medicine, newspapers: 2.1%. Most goods/services: 20%.
- Italy: 22% standard, 10% reduced, 5%, 4% super-reduced. Tax name: "IVA". Hotels, restaurants, some food: 10%. Basic food, books, newspapers: 4%. Most goods/services: 22%.
- Spain: 21% standard, 10% reduced, 4% super-reduced. Tax name: "IVA". Food, hotels, restaurants: 10%. Bread, milk, eggs, fruit, vegetables, books, medicine: 4%. Most goods/services: 21%.
- Netherlands: 21% standard, 9% reduced. Tax name: "BTW". Food, water, medicines, books, hotels, restaurants: 9%. Most goods/services: 21%.
For other EU countries, use the standard rate (typically 19-25%) and "VAT" as the tax name. Show as a single line with the correct local tax name.`,

  JPY: `Japanese Consumption Tax. Tax name: "Consumption Tax". Two tiers: 10% standard, 8% reduced.
Category-specific rules: Most goods and services: 10%. Food and non-alcoholic beverages (takeout/grocery purchase): 8%. Restaurant/dine-in meals: 10%. Alcohol: 10%. Newspapers (subscription, 2+ issues/week): 8%.
Show as a single "Consumption Tax" line at the applicable rate.`,

  AUD: `Australian GST. Tax name: "GST". Rate: 10% standard, 0% GST-free.
Category-specific rules: Most goods and services: 10%. Basic food (fresh meat, fruit, vegetables, bread, dairy, eggs, canned goods): GST-free (0%). Prepared meals, restaurant food, confectionery, ice cream, snack food: 10%. Health services and PBS-listed medicine: GST-free. Education: GST-free.
For most business invoices, use 10%. Show as a single "GST" line.`,

  CHF: `Swiss VAT. Tax name: "MwSt" (German-speaking), "TVA" (French-speaking), "IVA" (Italian-speaking). Use "MwSt" by default. Three tiers: 8.1% standard, 3.8% accommodation, 2.6% reduced.
Category-specific rules: Most goods and services: 8.1%. Food and non-alcoholic beverages (retail/grocery): 2.6%. Restaurant meals and alcohol: 8.1%. Books, newspapers, medicines: 2.6%. Hotel accommodation: 3.8%.
Show as a single "MwSt" line at the applicable rate.`,

  CNY: `Chinese VAT. Tax name: "VAT". Four tiers: 13%, 9%, 6%, 0%.
Category-specific rules: Sale of goods, imports, repairs: 13%. Agricultural products, water, gas, transport, postal, basic telecom, construction, media/publications: 9%. Modern services (consulting, IT, finance, insurance, R&D, tech transfer): 6%. Exports: 0%.
Show as a single "VAT" line at the applicable rate based on what is being sold/provided.`,

  INR: `Indian GST. For intra-state transactions, show TWO separate tax lines: "CGST" and "SGST" (each at half the total GST rate). For inter-state transactions, show a single "IGST" line at the full rate. Determine from vendor and client locations.
Rate tiers: 0%, 5%, 12%, 18%, 28%.
Category-specific rules: Fresh food (fruits, vegetables, milk, bread): 0%. Edible oils, tea, sugar, spices, basic clothing: 5%. Processed food, computers, standard machinery: 12%. Most goods, professional services, electronics, IT services: 18%. Luxury goods, automobiles, tobacco: 28%. Aerated drinks: 40%.
For most business invoices, use 18% (shown as CGST 9% + SGST 9% for intra-state, or IGST 18% for inter-state).`,

  MXN: `Mexican IVA. Tax name: "IVA". Standard rate: 16%. Border zone rate: 8%. Zero-rated basic necessities.
Category-specific rules: Most goods and services: 16%. Border regions (within 20km of border): 8%. Unprocessed food (meat, dairy, grains, fruits, vegetables): 0%. Medicine: 0% or exempt. Education and healthcare: Exempt.
For most business invoices, use 16%. Show as a single "IVA" line.`,

  BRL: `Brazilian taxes. For goods: tax name "ICMS" (state tax, typically 17-18% depending on state). For services: tax name "ISS" (municipal tax, 2-5%). Brazil is transitioning to IBS+CBS from 2026.
Category-specific rules: Basic food basket (cesta basica): reduced ICMS (0-7% depending on state). Medicine: reduced or exempt in some states. Industrial goods: 12-18%. Services: ISS 2-5% instead of ICMS.
For simplicity, show as a single tax line ("ICMS" for goods or "ISS" for services) at the appropriate rate.`,

  KRW: `South Korean VAT. Tax name: "VAT". Rate: 10% flat. No reduced rates.
Exempt categories: Financial services, medical services, education, unprocessed food, cultural items. All other goods and services: 10%.
Show as a single "VAT" line at 10%.`,

  SGD: `Singapore GST. Tax name: "GST". Rate: 9% flat.
Exempt categories: Financial services, residential property, investment precious metals. Most goods and services: 9%.
Show as a single "GST" line at 9%.`,

  HKD: `Hong Kong has NO sales tax, VAT, or GST. Do NOT include any tax lines. The taxes array must be empty and taxTotal must be 0. The total equals the subtotal.`,

  SEK: `Swedish Moms. Tax name: "Moms". Three tiers: 25% standard, 6% reduced (food from April 2026), 6% reduced (books/transport).
Category-specific rules: Most goods and services: 25%. Food and non-alcoholic beverages: 6%. Restaurant meals: 6%. Alcohol in stores: 25%. Books, newspapers, public transport: 6%. Cultural events, sports: 6%.
Show as a single "Moms" line at the applicable rate. For most business invoices, use 25%.`,

  NOK: `Norwegian MVA (Moms). Tax name: "MVA". Four tiers: 25% standard, 15% food, 12% accommodation/transport, 0% exports.
Category-specific rules: Most goods and services: 25%. Food and non-alcoholic beverages: 15%. Passenger transport, hotel accommodation, cinema, museums: 12%. Exports: 0%.
Show as a single "MVA" line at the applicable rate. For most business invoices, use 25%.`,

  DKK: `Danish Moms. Tax name: "Moms". Rate: 25% flat. Denmark has NO reduced rates for food -- one of the few EU countries to tax food at the full standard rate. Books are zero-rated from 2026.
Category-specific: Nearly everything is taxed at 25%. Financial services, insurance, medical services, education are exempt.
Show as a single "Moms" line at 25%.`,

  NZD: `New Zealand GST. Tax name: "GST". Rate: 15% flat. Very few exemptions (financial services, residential rent). Almost everything is taxed at 15% including food.
Show as a single "GST" line at 15%.`,

  ZAR: `South African VAT. Tax name: "VAT". Standard rate: 15%.
21 zero-rated basic foodstuffs: brown bread, maize meal, samp, dried beans, lentils, tinned pilchards/sardines, milk powder, rice, vegetables, fruit, vegetable oil, milk, cultured milk, eggs, brown wheaten meal, white bread, white flour, cake flour, canned vegetables, dairy liquid blends, edible offal.
All other goods and services: 15%. Show as a single "VAT" line.`,

  AED: `UAE VAT. Tax name: "VAT". Standard rate: 5%.
Zero-rated: Exports, international transport, education (government/recognized), healthcare, new residential buildings. Exempt: Financial services, residential rent, bare land.
Most goods and services: 5%. Show as a single "VAT" line at 5%.`,

  SAR: `Saudi VAT. Tax name: "VAT". Standard rate: 15%.
Zero-rated: Exports, international transport, qualifying medicines, investment precious metals. Exempt: Healthcare, education, financial services, residential rent, life insurance.
Most goods and services: 15%. Show as a single "VAT" line at 15%.`,

  ILS: `Israeli VAT. Tax name: "VAT". Standard rate: 18%.
Zero-rated: Exports, tourism services, fruit and vegetables.
Most goods and services: 18%. Show as a single "VAT" line at 18%.`,

  PLN: `Polish VAT. Tax name: "VAT". Four tiers: 23% standard, 8% reduced, 5% reduced, 0% basic food.
Category-specific rules: Most goods and services: 23%. Catering, building materials, medical devices: 8%. Food products (general), baby items, books: 5%. Basic food (meat, fish, dairy, bread, vegetables, fruits): 0%. Alcohol: 23%.
Show as a single "VAT" line at the applicable rate. For most business invoices, use 23%.`,

  THB: `Thai VAT. Tax name: "VAT". Rate: 7% (temporarily reduced from statutory 10%, extended through September 2026).
Exempt categories: Basic groceries, education, healthcare, real estate. Most goods and services: 7%.
Show as a single "VAT" line at 7%.`,

  PHP: `Philippine VAT. Tax name: "VAT". Rate: 12%.
Exempt categories: Agricultural products in original state (rice, corn, raw sugar, salt), specific prescription medicines, education, medical/hospital services.
Most goods and services: 12%. Show as a single "VAT" line at 12%.`,
};

function getTaxGuidance(currency: string): string {
  const guidance = TAX_CONFIG[currency];
  if (guidance) {
    return `TAX RULES FOR ${currency} REGION:\n${guidance}`;
  }
  return 'Apply a reasonable local tax rate for the region. Label the tax appropriately (e.g., "VAT", "GST", "Sales Tax").';
}

const B2B_TAX_RULES = `
B2B CROSS-BORDER TAX RULES (apply these BEFORE the standard tax rules):

Determine the vendor's country and the client's country. Then apply the correct rule:

SAME COUNTRY:
- Apply normal domestic tax rules from the TAX RULES section above.

EU TO EU (intra-community supply):
- Vendor invoices at 0% VAT with note "Reverse Charge - Article 196 EU VAT Directive"
- Include vendor's VAT registration number (format: CC-XXXXXXXXX)
- Include client's VAT registration number
- Buyer self-assesses VAT in their country (not shown on invoice)
- taxes array: [{ name: "VAT (Reverse Charge)", rate: 0, amount: 0 }]

EU/UK TO NON-EU (export):
- Zero-rated export. No VAT charged.
- Note on invoice: "Zero-rated export supply"
- taxes array: [{ name: "VAT (Export - Zero Rated)", rate: 0, amount: 0 }]

NON-EU TO EU:
- Seller typically does not charge VAT
- Buyer may owe import VAT (not shown on seller's invoice)
- taxes array should be empty or show 0

US DOMESTIC:
- Normal sales tax based on state/location (nexus rules)

US TO INTERNATIONAL (export):
- No US sales tax on exports
- taxes array: [{ name: "Sales Tax (Export Exempt)", rate: 0, amount: 0 }]

CANADA DOMESTIC:
- Normal GST/HST/PST based on province

CANADA TO INTERNATIONAL (export):
- Zero-rated for GST/HST purposes
- taxes array: [{ name: "GST (Export - Zero Rated)", rate: 0, amount: 0 }]

UK TO EU (post-Brexit):
- Zero-rated export from UK perspective
- Buyer may owe import VAT in their EU country

GCC COUNTRIES (UAE, Saudi, etc.):
- VAT applies on domestic B2B supplies
- Exports are zero-rated

GENERAL RULE:
- If vendor and client are in different countries, check if an export exemption applies
- Always show the tax treatment clearly on the invoice with appropriate notes
`;

function recalculateTotals(type: AssetType, data: AssetData): AssetData {
  switch (type) {
    case 'invoice': {
      const d = data as InvoiceData;
      if (!d.lineItems?.length) return data;
      d.lineItems.forEach((item) => {
        item.total = round2(item.quantity * item.unitPrice);
      });
      d.subtotal = round2(d.lineItems.reduce((sum, item) => sum + item.total, 0));
      if (d.taxes?.length) {
        d.taxes.forEach((t) => {
          t.amount = round2(d.subtotal * t.rate);
        });
        d.taxTotal = round2(d.taxes.reduce((sum, t) => sum + t.amount, 0));
      } else if (d.tax) {
        d.taxes = [{ name: 'Tax', rate: d.subtotal > 0 ? round2(d.tax / d.subtotal) : 0, amount: round2(d.tax) }];
        d.taxTotal = round2(d.tax);
      } else {
        d.taxes = [{ name: 'Tax', rate: 0.08, amount: round2(d.subtotal * 0.08) }];
        d.taxTotal = d.taxes[0].amount;
      }
      d.tax = d.taxTotal!;
      d.total = round2(d.subtotal + d.taxTotal!);
      return d;
    }
    case 'receipt': {
      const d = data as ReceiptData;
      if (!d.items?.length) return data;
      d.subtotal = round2(d.items.reduce((sum, item) => sum + round2(item.quantity * item.price), 0));
      if (d.taxes?.length) {
        d.taxes.forEach((t) => {
          t.amount = round2(d.subtotal * t.rate);
        });
        d.taxTotal = round2(d.taxes.reduce((sum, t) => sum + t.amount, 0));
      } else if (d.tax) {
        d.taxes = [{ name: 'Tax', rate: d.subtotal > 0 ? round2(d.tax / d.subtotal) : 0, amount: round2(d.tax) }];
        d.taxTotal = round2(d.tax);
      } else {
        d.taxes = [{ name: 'Tax', rate: 0.08, amount: round2(d.subtotal * 0.08) }];
        d.taxTotal = d.taxes[0].amount;
      }
      d.tax = d.taxTotal!;
      const tip = d.tip ? round2(d.tip) : 0;
      d.total = round2(d.subtotal + d.taxTotal! + tip);
      return d;
    }
    case 'paper_receipt': {
      const d = data as PaperReceiptData;
      if (!d.items?.length) return data;
      d.items.forEach((item) => {
        item.total = round2(item.quantity * item.unitPrice);
      });
      d.subtotal = round2(d.items.reduce((sum, item) => sum + item.total, 0));
      if (d.taxes?.length) {
        d.taxes.forEach((t) => {
          t.amount = round2(d.subtotal * t.rate);
        });
        d.taxTotal = round2(d.taxes.reduce((sum, t) => sum + t.amount, 0));
      } else {
        const rate = d.taxRate || 0.0825;
        d.taxes = [{ name: 'Tax', rate, amount: round2(d.subtotal * rate) }];
        d.taxTotal = d.taxes[0].amount;
      }
      d.taxAmount = d.taxTotal!;
      d.taxRate = d.taxes[0]?.rate || 0;
      const tip = d.tip ? round2(d.tip) : 0;
      d.total = round2(d.subtotal + d.taxTotal! + tip);
      return d;
    }
    case 'quote': {
      const d = data as QuoteData;
      if (!d.items?.length) return data;
      d.items.forEach((item) => {
        item.total = round2(item.quantity * item.unitPrice);
      });
      d.subtotal = round2(d.items.reduce((sum, item) => sum + item.total, 0));
      d.total = round2(d.subtotal - (d.discount || 0));
      return d;
    }
    case 'contract': {
      const d = data as ContractData;
      if (d.expirationDate && d.renewalNoticeDays) {
        const exp = new Date(d.expirationDate);
        exp.setDate(exp.getDate() - d.renewalNoticeDays);
        d.lastDateToAction = exp.toISOString().split('T')[0];
      }
      return d;
    }
    case 'hotel_folio': {
      const d = data as HotelFolioData;
      if (!d.charges?.length) return data;
      d.roomTotal = round2(d.charges.filter((c) => c.category === 'Room').reduce((sum, c) => sum + round2(c.amount), 0));
      d.incidentalsTotal = round2(d.charges.filter((c) => c.category !== 'Room').reduce((sum, c) => sum + round2(c.amount), 0));
      d.taxTotal = d.taxes?.length ? round2(d.taxes.reduce((sum, t) => sum + round2(t.amount), 0)) : 0;
      d.total = round2(d.roomTotal + d.incidentalsTotal + d.taxTotal);
      return d;
    }
    case 'airline_receipt': {
      const d = data as AirlineReceiptData;
      if (!d.fareBreakdown) return data;
      const fb = d.fareBreakdown;
      d.total = round2(fb.baseFare + fb.taxes + fb.fees + (fb.seatSelection || 0) + (fb.baggage || 0) + (fb.other || 0));
      return d;
    }
    default:
      return data;
  }
}

const STATUS_TRIGGERS: Record<AssetType, Array<{ field: string; message: string }>> = {
  invoice: [
    { field: '"invoiceNumber"', message: 'Creating invoice header...' },
    { field: '"vendor"', message: 'Generating vendor information...' },
    { field: '"client"', message: 'Setting up client details...' },
    { field: '"lineItems"', message: 'Creating line items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"notes"', message: 'Finalizing invoice...' },
  ],
  receipt: [
    { field: '"receiptNumber"', message: 'Creating receipt header...' },
    { field: '"vendor"', message: 'Identifying store details...' },
    { field: '"items"', message: 'Adding purchased items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"paymentMethod"', message: 'Finalizing receipt...' },
  ],
  quote: [
    { field: '"quoteNumber"', message: 'Creating quote header...' },
    { field: '"vendor"', message: 'Preparing quote from vendor...' },
    { field: '"client"', message: 'Setting up client details...' },
    { field: '"items"', message: 'Building service items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"terms"', message: 'Adding terms and conditions...' },
  ],
  contract: [
    { field: '"contractNumber"', message: 'Creating contract header...' },
    { field: '"parties"', message: 'Setting up contract parties...' },
    { field: '"provider"', message: 'Configuring service provider...' },
    { field: '"services"', message: 'Defining contract services...' },
    { field: '"terms"', message: 'Adding legal terms...' },
    { field: '"signatures"', message: 'Preparing signature fields...' },
  ],
  paper_receipt: [
    { field: '"receiptNumber"', message: 'Generating receipt ID...' },
    { field: '"store"', message: 'Setting up store information...' },
    { field: '"items"', message: 'Adding purchased items...' },
    { field: '"subtotal"', message: 'Calculating totals...' },
    { field: '"payment"', message: 'Processing payment details...' },
    { field: '"barcode"', message: 'Generating barcode...' },
  ],
  hotel_folio: [
    { field: '"folioNumber"', message: 'Creating folio header...' },
    { field: '"hotel"', message: 'Setting up hotel details...' },
    { field: '"guest"', message: 'Adding guest information...' },
    { field: '"charges"', message: 'Itemizing room and charges...' },
    { field: '"taxes"', message: 'Calculating taxes...' },
    { field: '"payment"', message: 'Processing payment...' },
  ],
  airline_receipt: [
    { field: '"confirmationCode"', message: 'Creating booking confirmation...' },
    { field: '"airline"', message: 'Setting airline details...' },
    { field: '"passenger"', message: 'Adding passenger info...' },
    { field: '"flights"', message: 'Building flight itinerary...' },
    { field: '"fareBreakdown"', message: 'Calculating fare breakdown...' },
    { field: '"payment"', message: 'Finalizing payment details...' },
  ],
};

const CURRENCY_INFO: Record<string, { symbol: string; name: string; locale: string }> = {
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso', locale: 'es-MX' },
  BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR' },
  KRW: { symbol: '₩', name: 'South Korean Won', locale: 'ko-KR' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', locale: 'zh-HK' },
  SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE' },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', locale: 'nb-NO' },
  DKK: { symbol: 'kr', name: 'Danish Krone', locale: 'da-DK' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ' },
  ZAR: { symbol: 'R', name: 'South African Rand', locale: 'en-ZA' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA' },
  ILS: { symbol: '₪', name: 'Israeli Shekel', locale: 'he-IL' },
  PLN: { symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL' },
  THB: { symbol: '฿', name: 'Thai Baht', locale: 'th-TH' },
  PHP: { symbol: '₱', name: 'Philippine Peso', locale: 'en-PH' },
};

const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  flight: `This is an AIRLINE/FLIGHT receipt. Include these specific details:
- Airline name (e.g., United, Delta, American, Southwest, JetBlue)
- Flight number (e.g., UA1234, DL567)
- Route (origin → destination with airport codes)
- Passenger name
- Seat/class (economy, business, first)
- Confirmation/PNR code
- Breakdown: base fare, taxes & fees, baggage fees if any
- Date of travel`,

  hotel: `This is a HOTEL FOLIO/RECEIPT. Include these specific details:
- Hotel brand and property name
- Address of the property
- Guest name
- Confirmation number
- Check-in and check-out dates
- Room number and room type
- Nightly rate breakdown
- Incidentals (parking, room service, minibar, etc.)
- Resort fees and taxes
- Total nights stayed`,

  car_rental: `This is a CAR RENTAL receipt. Include these specific details:
- Rental company (Hertz, Enterprise, Avis, Budget, National)
- Pickup and return locations
- Vehicle type/class (compact, midsize, SUV, etc.)
- Rental agreement number
- Rental dates and duration
- Daily/weekly rate
- Insurance/coverage options
- Fuel charges if applicable
- Mileage (unlimited or per-mile)
- Taxes and fees breakdown`,

  rideshare: `This is a RIDESHARE/TAXI receipt. Include these specific details:
- Service provider (Uber, Lyft, taxi company)
- Trip ID/receipt number
- Pickup location (address or landmark)
- Dropoff location
- Date and time of ride
- Distance and duration
- Fare breakdown (base, distance, time, surge if any)
- Tip amount
- Driver name (first name only)
- Vehicle type if rideshare`,

  meals: `This is a RESTAURANT/MEAL receipt. Include these specific details:
- Restaurant name (real establishment)
- Address and phone
- Server name
- Table number or order number
- Itemized food and beverages with prices
- Number of guests if mentioned
- Subtotal, tax, tip/gratuity
- Tip line or included gratuity percentage
- Business meal context if mentioned`,

  coffee: `This is a COFFEE SHOP receipt. Include these specific details:
- Coffee shop name (Starbucks, Peet's, Dunkin', local shop)
- Store number/location
- Itemized drinks and food items
- Size specifications (grande, large, etc.)
- Customizations if any
- Rewards/points earned if applicable
- Order type (mobile, in-store)`,

  parking: `This is a PARKING receipt. Include these specific details:
- Parking facility name
- Address/location
- Entry and exit date/time
- Duration of stay
- Space/level number if applicable
- Rate type (hourly, daily, event)
- Rate breakdown
- Ticket/transaction number
- Validation if applicable`,

  fuel: `This is a GAS/FUEL receipt. Include these specific details:
- Gas station brand (Shell, Chevron, BP, Exxon, etc.)
- Station address
- Pump number
- Fuel type (regular, premium, diesel)
- Price per gallon/liter
- Gallons/liters purchased
- Total fuel cost
- Car wash if added
- Date and time`,

  transit: `This is a TRANSIT/RAIL receipt. Include these specific details:
- Transit provider (Amtrak, airline shuttle, metro, bus company)
- Route or line
- Ticket/confirmation number
- Departure and arrival stations
- Class of service if applicable
- Seat assignment if applicable
- Date and time of travel
- Fare type (one-way, round-trip, pass)`,

  conference: `This is a CONFERENCE/EVENT receipt. Include these specific details:
- Event/conference name
- Organizer name
- Event dates and location/venue
- Registration type (full, day pass, virtual, workshop)
- Attendee name
- Registration/confirmation number
- Early bird or promotional discounts if applicable
- Any add-ons (workshops, meals, networking events)`,

  supplies: `This is an OFFICE SUPPLIES receipt. Include these specific details:
- Store name (Staples, Office Depot, Amazon Business)
- Store number/location if physical store
- Order number
- Itemized products with SKUs
- Quantities and unit prices
- Any business discounts applied
- Shipping charges if applicable
- Rewards earned if applicable`,
};

// ---------------------------------------------------------------------------
// Public API: asset generation
// ---------------------------------------------------------------------------

function buildAssetSystemMessage(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  currency: string,
  relatedAssets?: RelatedAssetContext,
): string {
  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];

  let systemMessage = `You are a helpful assistant that generates realistic business document data. Generate JSON data for ${type} documents based on the company profile and spending category provided.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and region
- All numbers should be raw numbers (not strings), the symbol will be added during display

CRITICAL REQUIREMENTS:
1. All vendors MUST be REAL companies that actually exist - do NOT invent fictional company names
2. Prioritize vendors that operate in or near: ${company.location}
3. Use well-known national brands OR real regional businesses that specialize in "${spendingCategory}"
4. Include real addresses (use the vendor's actual headquarters or a real location near the client)
5. All line items, products, and services MUST be directly related to: "${spendingCategory}"

${getVendorExamples(spendingCategory)}

IMPORTANT: Do NOT use consulting firms (Deloitte, PwC, EY, KPMG, Accenture, McKinsey, BCG) as vendors UNLESS the spending category explicitly involves consulting, advisory, audit, or professional services. For categories like equipment, logistics, utilities, facilities, manufacturing, etc., use vendors that specialize in that specific industry.

The data should have realistic prices and quantities appropriate for the company's size and industry.`;

  if (relatedAssets?.quote) {
    systemMessage += `

CONNECTED DOCUMENT CONTEXT:
This ${type} is part of a connected document flow. A Quote has already been created and you MUST maintain consistency:
- Use the EXACT SAME vendor name, domain, address, email, and phone from the quote
- Reference the quote number in your document
- Ensure services/line items align with what was quoted`;
  }

  if (relatedAssets?.contract) {
    systemMessage += `
- A Contract has been created based on the quote - reference the contract number as well
- The invoice should be for work performed under this contract`;
  }

  systemMessage += `

Return ONLY valid JSON, no markdown or explanation.`;

  return systemMessage;
}

export async function generateAssetContentStreaming(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  onStatus: (status: string) => void,
  relatedAssets?: RelatedAssetContext,
  invoiceConfig?: InvoiceConfig,
  currency: string = 'USD',
  lineItemCount?: number,
  reqId?: string,
): Promise<AssetData> {
  const prompt = relatedAssets
    ? buildConnectedPrompt(type, company, spendingCategory, relatedAssets, invoiceConfig, currency, lineItemCount)
    : buildPrompt(type, company, spendingCategory, currency, lineItemCount);

  const triggers = STATUS_TRIGGERS[type];
  const triggeredFields = new Set<string>();

  const isConnected = relatedAssets && (relatedAssets.quote || relatedAssets.contract);
  onStatus(isConnected ? 'Linking to related documents...' : 'Initializing generation...');

  const systemMessage = buildAssetSystemMessage(type, company, spendingCategory, currency, relatedAssets);

  const tag = reqId ? `[generate ${reqId}]` : undefined;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  let aggregated = '';
  const { text } = await callClaudeStream({
    system: systemMessage,
    user: prompt,
    maxTokens: TOKEN_BUDGETS.asset,
    tag,
    onDelta: (chunk) => {
      aggregated += chunk;
      for (const trigger of triggers) {
        if (!triggeredFields.has(trigger.field) && aggregated.includes(trigger.field)) {
          triggeredFields.add(trigger.field);
          onStatus(trigger.message);
        }
      }
    },
  });

  onStatus('Completing generation...');
  try {
    const parsed = extractJSON<AssetData>(text);
    if (tag) console.log(`${tag} json_parsed elapsed_ms=${elapsed()} text_len=${text.length}`);
    return stampAssetLogos(type, ensureLineItemIds(type, recalculateTotals(type, parsed)));
  } catch (err) {
    if (tag) console.error(`${tag} json_parse_failed elapsed_ms=${elapsed()} text_len=${text.length}`);
    throw err;
  }
}

export async function generateAssetContent(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  currency: string = 'USD',
  lineItemCount?: number,
): Promise<AssetData> {
  const prompt = buildPrompt(type, company, spendingCategory, currency, lineItemCount);
  const systemMessage = buildAssetSystemMessage(type, company, spendingCategory, currency);

  const { text } = await callClaude({
    system: systemMessage,
    user: prompt,
    maxTokens: TOKEN_BUDGETS.asset,
  });

  const parsed = extractJSON<AssetData>(text);
  return stampAssetLogos(type, ensureLineItemIds(type, recalculateTotals(type, parsed)));
}

// ---------------------------------------------------------------------------
// Public API: quick-receipt generation
// ---------------------------------------------------------------------------

export async function generateQuickReceiptContent(
  prompt: string,
  receiptType: 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt',
  currency: string,
  onStatus: (status: string) => void,
  reqId?: string,
): Promise<AssetData> {
  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const checkInDate = new Date(today);
  checkInDate.setDate(checkInDate.getDate() - 3);
  const checkInStr = checkInDate.toISOString().split('T')[0];

  const bookingDate = new Date(today);
  bookingDate.setDate(bookingDate.getDate() - 14);
  const bookingDateStr = bookingDate.toISOString().split('T')[0];

  const flightDate = new Date(today);
  flightDate.setDate(flightDate.getDate() + 7);
  const flightDateStr = flightDate.toISOString().split('T')[0];

  const categoryMatch = prompt.match(/\[Category:\s*(\w+)\]/i);
  const category = categoryMatch ? categoryMatch[1].toLowerCase() : null;
  const cleanPrompt = prompt.replace(/\[Category:\s*\w+\]\s*/i, '').trim();

  const categoryInstructions =
    category && CATEGORY_INSTRUCTIONS[category]
      ? `\n\nSPECIFIC RECEIPT TYPE:\n${CATEGORY_INSTRUCTIONS[category]}\n`
      : '';

  onStatus('Analyzing your description...');

  let systemMessage: string;
  let triggers: Array<{ field: string; message: string }>;

  if (receiptType === 'hotel_folio') {
    systemMessage = `You are a helpful assistant that generates realistic hotel folio/checkout receipt data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and hotel tier
- All numbers should be raw numbers (not strings)

Generate a realistic HOTEL FOLIO based on the user's description.
Extract all relevant details: hotel name, dates, room type, charges, incidentals, payment method, etc.
If details are not specified, make reasonable assumptions based on context.
Make the folio look AUTHENTIC with proper hotel formatting and details.

JSON Structure for hotel_folio:
{
  "folioNumber": "string (format: FOL-XXXXXXXX)",
  "hotel": {
    "name": "string (REAL hotel property name from description, e.g., 'Marriott Marquis San Francisco')",
    "brand": "string (optional - hotel chain name like 'Marriott' or 'Hilton')",
    "domain": "string (hotel's website domain, e.g., 'marriott.com')",
    "address": "string (hotel street address)",
    "city": "string",
    "state": "string (2-letter code)",
    "zip": "string",
    "phone": "string",
    "email": "string (optional)"
  },
  "guest": {
    "name": "string (full name from description or generate realistic name)",
    "email": "string (corporate email)",
    "loyaltyNumber": "string (optional)",
    "loyaltyTier": "string (optional, like 'Gold', 'Platinum')"
  },
  "confirmation": "string (confirmation number like ABC123456)",
  "checkIn": "string (YYYY-MM-DD - use from description or reasonable date like ${checkInStr})",
  "checkOut": "string (YYYY-MM-DD - use from description or ${todayStr})",
  "roomNumber": "string (like '1204')",
  "roomType": "string (like 'King Deluxe', 'Executive Suite')",
  "nights": number,
  "charges": [
    {
      "category": "Room" | "Parking" | "Food & Beverage" | "Minibar" | "Phone" | "Laundry" | "Business Center" | "Other",
      "description": "string (detailed charge description)",
      "date": "string (YYYY-MM-DD)",
      "amount": number
    }
  ],
  "roomTotal": number,
  "incidentalsTotal": number,
  "taxes": [
    { "name": "string (e.g., 'State Tax', 'City Occupancy Tax')", "rate": number (optional), "amount": number }
  ],
  "taxTotal": number,
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string",
    "date": "${todayStr}"
  },
  "pointsEarned": number (optional)
}

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"hotel"', message: 'Setting up hotel details...' },
      { field: '"guest"', message: 'Adding guest information...' },
      { field: '"charges"', message: 'Itemizing room and charges...' },
      { field: '"taxes"', message: 'Calculating taxes...' },
      { field: '"payment"', message: 'Processing payment...' },
    ];
  } else if (receiptType === 'airline_receipt') {
    systemMessage = `You are a helpful assistant that generates realistic airline email receipt/booking confirmation data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency and fare class
- All numbers should be raw numbers (not strings)

Generate a realistic AIRLINE EMAIL RECEIPT based on the user's description.
Extract all relevant details: airline, flight numbers, routes, dates, passenger name, fare, payment method, etc.
If details are not specified, make reasonable assumptions based on context.
Make the receipt look AUTHENTIC like a real airline booking confirmation email.

JSON Structure for airline_receipt:
{
  "confirmationCode": "string (6 character alphanumeric like 'ABC123' - use from description if given)",
  "ticketNumber": "string (optional, 13-digit ticket number)",
  "airline": {
    "name": "string (REAL airline name from description)",
    "domain": "string (airline website domain, e.g., 'united.com', 'delta.com')"
  },
  "passenger": {
    "name": "string (full name in LASTNAME/FIRSTNAME format)",
    "frequentFlyer": "string (optional)",
    "tierStatus": "string (optional, like 'Silver', 'Gold', '1K')"
  },
  "bookingDate": "${bookingDateStr}",
  "flights": [
    {
      "flightNumber": "string (like 'UA1234', 'DL567')",
      "date": "string (YYYY-MM-DD - flight date from description or ${flightDateStr})",
      "departure": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (HH:MM AM/PM)",
        "terminal": "string (optional)",
        "gate": "string (optional)"
      },
      "arrival": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (HH:MM AM/PM)",
        "terminal": "string (optional)"
      },
      "class": "string (Economy, Premium Economy, Business, First)",
      "seat": "string (optional, like '12A')",
      "aircraft": "string (optional, like 'Boeing 737-800')",
      "duration": "string (optional, like '5h 30m')"
    }
  ],
  "fareBreakdown": {
    "baseFare": number,
    "taxes": number,
    "fees": number,
    "baggage": number (optional - if checked bag mentioned),
    "seatSelection": number (optional),
    "other": number (optional)
  },
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string"
  },
  "milesEarned": number (optional)
}

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"confirmationCode"', message: 'Creating booking confirmation...' },
      { field: '"airline"', message: 'Setting airline details...' },
      { field: '"passenger"', message: 'Adding passenger info...' },
      { field: '"flights"', message: 'Building flight itinerary...' },
      { field: '"fareBreakdown"', message: 'Calculating fare breakdown...' },
      { field: '"payment"', message: 'Finalizing payment details...' },
    ];
  } else if (receiptType === 'paper_receipt') {
    systemMessage = `You are a helpful assistant that generates realistic thermal paper receipt data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency
- All numbers should be raw numbers (not strings)
${categoryInstructions}
Generate a realistic THERMAL PAPER RECEIPT (POS-style) based on the user's description.
Extract all relevant details from their description: store name, items, prices, payment method, location, etc.
If details are not specified, make reasonable assumptions based on context.
Make the receipt look AUTHENTIC for this type of expense with appropriate formatting and details.

JSON Structure for paper_receipt:
{
  "receiptNumber": "string (format: XXXXX-XXXXX-XXXXX or category-appropriate format)",
  "transactionId": "string (short ID like TXN12345 or confirmation code)",
  "date": "${todayStr}",
  "time": "${timeStr}",
  "store": {
    "name": "string (REAL company/store name from description or inferred)",
    "domain": "string (company's website domain)",
    "address": "string (street address - infer from location if given)",
    "city": "string",
    "state": "string (2-letter)",
    "zip": "string",
    "phone": "string",
    "storeNumber": "string (optional - store/location number)"
  },
  "cashier": "string (first name, employee ID, or agent name)",
  "register": "string (like 'REG 03', 'Terminal 1', 'Kiosk A')",
  "items": [
    {
      "name": "string (descriptive line item name)",
      "sku": "string (optional - SKU, flight number, confirmation, etc.)",
      "quantity": number,
      "unitPrice": number,
      "total": number,
      "discount": number (optional)
    }
  ],
  "subtotal": number,
  "taxes": [
    { "name": "string (tax name appropriate for ${currency} region - e.g. Sales Tax, VAT, GST, HST, Moms, MVA, IVA, etc.)", "rate": number (decimal), "amount": number }
  ],
  "taxTotal": number (sum of all tax amounts),
  "taxRate": number (primary tax rate as decimal for backward compat),
  "taxAmount": number (same as taxTotal for backward compat),
  "tip": number (optional - INCLUDE FOR RESTAURANT/MEAL/DINING receipts, calculate ~18-20% gratuity or use mentioned amount),
  "total": number (subtotal + taxTotal + tip if applicable),
  "payment": {
    "method": "credit" | "debit" | "cash" | "mobile",
    "cardType": "string (VISA, Mastercard, AMEX, etc. - only if card)",
    "cardLast4": "string (only if card - use from description or generate)",
    "approvalCode": "string (6 chars, only if card)",
    "amountTendered": number (only if cash),
    "change": number (only if cash)
  },
  "savings": number (optional - discounts applied),
  "loyaltyPoints": number (optional - points/miles earned),
  "barcode": "string (confirmation code or transaction ID)",
  "footer": ["array of 1-3 appropriate footer messages for this receipt type"]
}

${getTaxGuidance(currency)}
Apply the correct tax name(s) and rate(s) for the ${currency} region. Consider category-specific rates (e.g., food may be taxed differently).

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"store"', message: 'Setting up store information...' },
      { field: '"items"', message: 'Adding items...' },
      { field: '"subtotal"', message: 'Calculating totals...' },
      { field: '"payment"', message: 'Processing payment details...' },
      { field: '"barcode"', message: 'Generating barcode...' },
    ];
  } else {
    systemMessage = `You are a helpful assistant that generates realistic digital receipt data from user descriptions.

CURRENCY: All monetary values MUST be in ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- Use appropriate pricing for this currency
- All numbers should be raw numbers (not strings)
${categoryInstructions}
Generate a realistic DIGITAL RECEIPT based on the user's description.
Extract all relevant details: vendor/store name, items, prices, payment method, etc.
If details are not specified, make reasonable assumptions based on context.
Make the receipt look AUTHENTIC for this type of expense with appropriate formatting and details.

JSON Structure for receipt:
{
  "receiptNumber": "string (format varies by type: RCP-XXXXX, confirmation codes, PNR, etc.)",
  "date": "${todayStr}",
  "vendor": {
    "name": "string (REAL company/vendor name from description)",
    "domain": "string (vendor's website domain)",
    "address": "string (full address - headquarters or service location)"
  },
  "items": [
    {
      "description": "string (detailed line item - flight routes, room nights, services, products)",
      "quantity": number,
      "price": number (unit price)
    }
  ],
  "subtotal": number,
  "taxes": [
    { "name": "string (tax name appropriate for ${currency} region)", "rate": number (decimal), "amount": number }
  ],
  "taxTotal": number (sum of all tax amounts),
  "tax": number (same as taxTotal for backward compat),
  "tip": number (optional - INCLUDE FOR RESTAURANT/MEAL/DINING receipts, calculate ~18-20% gratuity or use mentioned amount),
  "total": number (subtotal + taxTotal + tip if applicable),
  "paymentMethod": "string (from description - 'Corporate Card', 'Visa', 'Amex', etc.)",
  "cardLast4": "string (if mentioned, otherwise generate 4 digits)"
}

${getTaxGuidance(currency)}
Apply the correct tax name(s) and rate(s) for the ${currency} region.

Return ONLY valid JSON, no markdown or explanation.`;
    triggers = [
      { field: '"vendor"', message: 'Identifying vendor...' },
      { field: '"items"', message: 'Adding items...' },
      { field: '"subtotal"', message: 'Calculating totals...' },
      { field: '"paymentMethod"', message: 'Finalizing receipt...' },
    ];
  }

  const triggeredFields = new Set<string>();
  let aggregated = '';

  const categoryLabel = category ? ` (${category.replace('_', ' ')})` : '';
  const receiptTypeLabel =
    receiptType === 'hotel_folio'
      ? 'hotel folio'
      : receiptType === 'airline_receipt'
        ? 'airline receipt'
        : receiptType === 'paper_receipt'
          ? 'thermal paper receipt'
          : 'digital receipt';

  const userMessage = `Generate a ${receiptTypeLabel}${categoryLabel} based on this description:\n\n${cleanPrompt}`;

  const tag = reqId ? `[quick-receipt ${reqId}]` : undefined;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const { text } = await callClaudeStream({
    system: systemMessage,
    user: userMessage,
    maxTokens: TOKEN_BUDGETS.receipt,
    tag,
    onDelta: (chunk) => {
      aggregated += chunk;
      for (const trigger of triggers) {
        if (!triggeredFields.has(trigger.field) && aggregated.includes(trigger.field)) {
          triggeredFields.add(trigger.field);
          onStatus(trigger.message);
        }
      }
    },
  });

  onStatus('Finalizing receipt...');
  const resolvedType: AssetType = receiptType || 'receipt';
  try {
    const parsed = extractJSON<AssetData>(text);
    if (tag) console.log(`${tag} json_parsed elapsed_ms=${elapsed()} text_len=${text.length}`);
    return stampAssetLogos(resolvedType, recalculateTotals(resolvedType, parsed));
  } catch (err) {
    if (tag) console.error(`${tag} json_parse_failed elapsed_ms=${elapsed()} text_len=${text.length}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API: company enrichment via web_search
// ---------------------------------------------------------------------------

export interface EnrichedCompanyData {
  name: string;
  description: string;
  employeeCount: string;
  industry: string;
  location: string;
  spendingCategories: string[];
}

const ENRICHMENT_SYSTEM = `You are a research assistant. Your job is to look up a company by its website domain and return a structured profile.

Use the web_search tool to find current, accurate information. Search for the company name, "about" page, "careers" or LinkedIn pages for employee count, headquarters address, and industry.

Return ONLY a single JSON object with this exact shape (no markdown, no explanation, no prose):

{
  "name": "string (proper company name, e.g. 'Acme Corporation')",
  "description": "string (2-3 sentence summary of what the company does)",
  "employeeCount": "string (formatted with commas, e.g. '1,200' or 'Unknown' if not found)",
  "industry": "string (e.g. 'Financial Technology', 'SaaS', 'E-commerce')",
  "location": "string (full HQ address: 'Street, City, STATE ZIP, Country' or just 'City, State, Country' if street unknown)",
  "spendingCategories": ["array of 5-7 likely B2B expense categories for this specific company based on its industry and size"]
}

If the company cannot be found via web search, generate a reasonable profile from your training knowledge of the domain. Always return valid JSON in the exact shape above.`;

function buildEnrichmentUserMessage(cleanDomain: string): string {
  return `Look up the company at the website domain "${cleanDomain}" and return their profile.

Search for:
1. Their company name and what they do (description)
2. Their headquarters address (full street address if available)
3. Their employee count (LinkedIn, Crunchbase, or annual report)
4. Their industry classification

Then identify the 5-7 most likely B2B spending categories this specific company would have based on their industry, size, and business model. Be specific to their actual operations - avoid generic categories unless they truly apply.

Return only the JSON profile.`;
}

const ENRICHMENT_TOOLS: Anthropic.Messages.ToolUnion[] = [
  {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 5,
  },
];

function validateEnriched(parsed: EnrichedCompanyData): EnrichedCompanyData {
  if (!parsed.name || !parsed.spendingCategories || !Array.isArray(parsed.spendingCategories)) {
    throw new ClaudeError(
      'PARSE_ERROR',
      'Enrichment response missing required fields (name, spendingCategories)',
    );
  }
  return parsed;
}

async function attemptEnrichCompanyProfile(
  cleanDomain: string,
): Promise<EnrichedCompanyData> {
  const { text } = await callClaude({
    system: ENRICHMENT_SYSTEM,
    user: buildEnrichmentUserMessage(cleanDomain),
    maxTokens: TOKEN_BUDGETS.enrichment,
    tools: ENRICHMENT_TOOLS,
  });
  return validateEnriched(extractJSON<EnrichedCompanyData>(text));
}

export async function enrichCompanyProfile(
  cleanDomain: string,
): Promise<EnrichedCompanyData> {
  return withParseRetry('enrichCompanyProfile', () =>
    attemptEnrichCompanyProfile(cleanDomain),
  );
}

/**
 * Streaming variant of `enrichCompanyProfile`. Reports progress via `onStatus`
 * by listening for `server_tool_use` (web search initiated) and
 * `web_search_tool_result` (search completed) content blocks, plus field-name
 * triggers in the streamed JSON output.
 *
 * On PARSE_ERROR (Claude returned text the repair pass couldn't fix) the call
 * is retried once silently — the user only sees a "still working..." status
 * blip, not an error. See `withParseRetry`.
 */
export async function enrichCompanyProfileStreaming(
  cleanDomain: string,
  onStatus: (status: string) => void,
  reqId?: string,
): Promise<EnrichedCompanyData> {
  // Mint a fallback id so logs always have a tag even when called outside an
  // Express request context (e.g. future scripts/tests).
  const id = reqId ?? Math.random().toString(16).slice(2, 6);
  return withParseRetry('enrichCompanyProfileStreaming', (attempt) =>
    attemptEnrichCompanyProfileStreaming(cleanDomain, onStatus, attempt, id),
  );
}

async function attemptEnrichCompanyProfileStreaming(
  cleanDomain: string,
  onStatus: (status: string) => void,
  attempt: number,
  reqId: string,
): Promise<EnrichedCompanyData> {
  const tag = `[enrich ${reqId}]`;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const client = getClient();

  // Surface the retry to the user so they don't think it's hung. The first
  // attempt's status messages will start streaming again right after this.
  if (attempt > 1) {
    console.log(`${tag} retry attempt=${attempt} elapsed_ms=${elapsed()}`);
    onStatus('Refining results...');
  }

  let text = '';
  let stopReason: Anthropic.Message['stop_reason'] = null;
  let searchCount = 0;
  let firstTextDeltaSeen = false;
  const searchStartTimes = new Map<number, number>();
  const triggeredFields = new Set<string>();
  const FIELD_TRIGGERS: Array<{ field: string; message: string }> = [
    { field: '"name"', message: 'Identifying company name...' },
    { field: '"description"', message: 'Summarizing what the company does...' },
    { field: '"industry"', message: 'Classifying industry...' },
    { field: '"employeeCount"', message: 'Looking up employee count...' },
    { field: '"location"', message: 'Locating headquarters...' },
    { field: '"spendingCategories"', message: 'Identifying spending categories...' },
  ];

  try {
    console.log(`${tag} claude_request_sent elapsed_ms=${elapsed()} attempt=${attempt}`);
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: TOKEN_BUDGETS.enrichment,
        system: ENRICHMENT_SYSTEM,
        messages: [{ role: 'user', content: buildEnrichmentUserMessage(cleanDomain) }],
        tools: ENRICHMENT_TOOLS,
      },
      { timeout: TIMEOUT_MS },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          searchCount += 1;
          searchStartTimes.set(searchCount, Date.now());
          console.log(`${tag} web_search_start n=${searchCount} elapsed_ms=${elapsed()}`);
          onStatus(
            searchCount === 1
              ? 'Searching the web for company info...'
              : `Searching the web (${searchCount}/5)...`,
          );
        } else if (block.type === 'web_search_tool_result') {
          const startedAtSearch = searchStartTimes.get(searchCount);
          const searchMs = startedAtSearch !== undefined ? Date.now() - startedAtSearch : null;
          console.log(
            `${tag} web_search_end n=${searchCount} elapsed_ms=${elapsed()}` +
              (searchMs !== null ? ` search_ms=${searchMs}` : ''),
          );
          onStatus('Reviewing search results...');
        }
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        if (!firstTextDeltaSeen) {
          firstTextDeltaSeen = true;
          console.log(`${tag} text_delta_first elapsed_ms=${elapsed()}`);
        }
        const chunk = event.delta.text;
        text += chunk;
        for (const trigger of FIELD_TRIGGERS) {
          if (!triggeredFields.has(trigger.field) && text.includes(trigger.field)) {
            triggeredFields.add(trigger.field);
            console.log(
              `${tag} field_seen field=${trigger.field.replaceAll('"', '')} elapsed_ms=${elapsed()}`,
            );
            onStatus(trigger.message);
          }
        }
      } else if (event.type === 'message_delta' && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason;
        console.log(`${tag} stop_reason reason=${stopReason} elapsed_ms=${elapsed()}`);
      }
    }
  } catch (err) {
    const mapped = mapClaudeError(err);
    console.error(
      `${tag} claude_threw elapsed_ms=${elapsed()} searches=${searchCount} text_len=${text.length} code=${mapped.code} message=${JSON.stringify(mapped.message)}`,
    );
    throw mapped;
  }

  if (stopReason === 'max_tokens') {
    console.warn(`${tag} truncated elapsed_ms=${elapsed()} text_len=${text.length}`);
    throw new ClaudeError(
      'TRUNCATED',
      'Enrichment response was truncated due to max_tokens limit',
    );
  }

  try {
    const parsed = validateEnriched(extractJSON<EnrichedCompanyData>(text));
    console.log(
      `${tag} json_parsed elapsed_ms=${elapsed()} text_len=${text.length} searches=${searchCount}`,
    );
    return parsed;
  } catch (err) {
    const code = err instanceof ClaudeError ? err.code : 'PARSE_ERROR';
    console.error(
      `${tag} json_parse_failed elapsed_ms=${elapsed()} text_len=${text.length} code=${code}`,
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Prompt builders (ported verbatim from openai.ts)
// ---------------------------------------------------------------------------

function buildPrompt(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  currency: string = 'USD',
  lineItemCount?: number,
): string {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const validUntilDate = new Date(today);
  validUntilDate.setDate(validUntilDate.getDate() + 30);
  const validUntilStr = validUntilDate.toISOString().split('T')[0];

  const effectiveDate = new Date(today);
  effectiveDate.setDate(effectiveDate.getDate() + 14);
  const effectiveDateStr = effectiveDate.toISOString().split('T')[0];

  const expirationDate = new Date(effectiveDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  const expirationDateStr = expirationDate.toISOString().split('T')[0];

  const currencyInfo = CURRENCY_INFO[currency] || CURRENCY_INFO['USD'];

  const baseInfo = `
IMPORTANT DATE CONTEXT:
- Today's actual date is: ${todayStr}
- Use this EXACT date for document dates, NOT dates from 2022 or 2023

CURRENCY: ${currency} (${currencyInfo.name}, symbol: ${currencyInfo.symbol})
- All monetary values should be appropriate for this currency
- Use pricing typical for the ${currency} region/market

COMPANY PROFILE:
- Company Name: ${company.name}
- Industry: ${company.industry}
- Employee Count: ${company.employeeCount}
- Location: ${company.location}

SELECTED SPENDING CATEGORY: ${spendingCategory}

VENDOR REQUIREMENTS:
- Use REAL companies that actually exist (no fictional names)
- Prioritize vendors with locations near ${company.location}
- Use well-known national brands or real regional businesses
- All generated content MUST be related to ${spendingCategory}
- IMPORTANT: Include the vendor's actual website domain (e.g., "dell.com", "staples.com") for logo display

${getTaxGuidance(currency)}
`;

  switch (type) {
    case 'invoice':
      return `${baseInfo}
Generate a realistic INVOICE that ${company.name} would receive from a vendor.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to make line items HIGHLY SPECIFIC to what this company would actually purchase

VENDOR INSTRUCTIONS:
- Use a REAL company that provides ${spendingCategory} products/services
- The vendor should operate in or near ${company.location} (use their real address near this location, or headquarters)
- ${getVendorExamples(spendingCategory)}
- Do NOT use consulting firms unless the category is specifically consulting or advisory

LINE ITEM REQUIREMENTS:
- Each line item description MUST be highly specific and detailed - NO generic descriptions
- Include product names, model numbers, SKUs, service periods, or specific deliverables
- Tailor items to what ${company.name} (a ${company.industry} company) would actually need
- BAD examples: "Consulting Services", "Equipment", "Supplies", "Software License"
- GOOD examples: "Dell PowerEdge R750 Server - 2x Intel Xeon Gold 6326", "Q1 2024 Network Security Monitoring - 250 endpoints", "Cisco Meraki MX84 Security Appliance w/ 3-yr License"
- Use realistic pricing for ${spendingCategory} industry

JSON Structure:
{
  "invoiceNumber": "string (format: INV-XXXXX)",
  "date": "${todayStr}",
  "dueDate": "${dueDateStr}",
  "vendor": {
    "name": "string (REAL company name that exists)",
    "domain": "string (the vendor's actual website domain, e.g., 'dell.com', 'cdw.com')",
    "address": "string (real address near ${company.location} or vendor headquarters)",
    "email": "string (realistic email for that company)",
    "phone": "string"
  },
  "client": {
    "name": "${company.name}",
    "address": "${company.location}",
    "email": "accounts@${company.domain}"
  },
  "lineItems": [
    { "id": "string (unique UUID v4)", "description": "string (DETAILED specific product/service with model numbers, specs, or deliverables)", "quantity": number, "unitPrice": number, "total": number }
  ],
  "subtotal": number,
  "taxes": [
    { "name": "string (tax name per rules above, e.g. VAT, GST, Sales Tax, HST, CGST, SGST, IVA, MwSt, Moms, MVA, etc.)", "rate": number (decimal, e.g. 0.13 for 13%), "amount": number }
  ],
  "taxTotal": number (sum of all tax amounts),
  "tax": number (same value as taxTotal for backward compatibility),
  "total": number,
  "paymentTerms": "Net 30",
  "remitTo": {
    "bankName": "string (a real major bank appropriate for the ${currency} region)",
    "accountName": "string (vendor company name)",
    "routingNumber": "string (9-digit valid format - use a realistic but fictional number)",
    "accountNumber": "string (10-12 digit account number - generate a realistic fictional number)"
  },
  "notes": "string (optional thank you note)"
}

${B2B_TAX_RULES}
The CLIENT is located at: ${company.location}
The VENDOR's location will be determined by you based on the vendor you select. Evaluate whether this is a domestic or cross-border transaction and apply the correct B2B tax treatment from the rules above. If cross-border, apply export exemptions or reverse charge as appropriate and include explanatory notes.

Apply the tax rules above for ${currency}. Use the correct tax name(s), rate(s), and number of tax lines for the region. If multiple tax components apply (e.g. GST + PST in Canada, or CGST + SGST in India), include each as a separate entry in the taxes array. Consider category-specific rates where applicable.
Generate exactly ${lineItemCount || 4} line items with realistic pricing for a ${company.employeeCount} employee company purchasing ${spendingCategory} related items/services.`;

    case 'receipt':
      return `${baseInfo}
Generate a realistic RECEIPT for a purchase that ${company.name} would make.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to select items this company would actually purchase

VENDOR INSTRUCTIONS:
- Use a REAL store or retailer that sells ${spendingCategory} items
- The store should have locations near ${company.location} (use a real store address in that area)
- Examples: For office supplies use Staples, Office Depot; for electronics use Best Buy, Micro Center; for general supplies use Costco Business, Amazon Business, etc.

ITEM REQUIREMENTS:
- Each item description MUST include the specific brand, product name, and model/SKU where applicable
- NO generic descriptions like "Printer Paper" or "USB Cable"
- GOOD examples: "HP LaserJet Pro M404n Printer", "Logitech MX Master 3S Wireless Mouse", "3M Post-it Super Sticky Notes 3x3 (12-pack)", "Hammermill Premium 24lb Copy Paper (500 sheets)"
- Use realistic retail pricing

JSON Structure:
{
  "receiptNumber": "string (format: RCP-XXXXX)",
  "date": "${todayStr}",
  "vendor": {
    "name": "string (REAL store/retailer name that exists)",
    "domain": "string (the vendor's actual website domain, e.g., 'staples.com', 'bestbuy.com')",
    "address": "string (real store address near ${company.location})"
  },
  "items": [
    { "description": "string (SPECIFIC brand + product name + model)", "quantity": number, "price": number (unit price) }
  ],
  "subtotal": number,
  "taxes": [
    { "name": "string (tax name per rules above)", "rate": number (decimal), "amount": number }
  ],
  "taxTotal": number (sum of all tax amounts),
  "tax": number (same value as taxTotal for backward compatibility),
  "total": number,
  "paymentMethod": "Corporate Card",
  "cardLast4": "string (4 digits)"
}

Apply the tax rules above for ${currency}. Use the correct tax name(s) and rate(s) for the region. Consider category-specific rates for the items being purchased.
Generate 2-4 items. Keep the total reasonable for a single ${spendingCategory} purchase (typically under $500).`;

    case 'paper_receipt':
      return `${baseInfo}
Generate a realistic THERMAL PAPER RECEIPT (POS-style) for a retail/store purchase that someone from ${company.name} would make.

RECEIPT STYLE:
- This is a thermal printer receipt like from a grocery store, retail store, restaurant, or gas station
- Keep formatting compact and appropriate for narrow thermal paper
- Include typical POS elements: transaction ID, cashier/register info, SKUs, tax calculation, barcode

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to select items this company would actually purchase

STORE INSTRUCTIONS:
- Use a REAL retail store, restaurant, or service provider
- Choose stores that sell ${spendingCategory} related items or would be relevant to an employee expense
- The store should have locations near ${company.location}
- Examples: Target, Walmart, Home Depot, CVS, Starbucks, McDonald's, Shell, Costco, etc.

ITEM REQUIREMENTS:
- Use realistic short product names (like on actual receipts)
- Include SKUs for some items (6-12 character alphanumeric)
- Realistic retail pricing
- Some items can have discounts

JSON Structure:
{
  "receiptNumber": "string (format: XXXXX-XXXXX-XXXXX)",
  "transactionId": "string (shorter ID like TXN12345)",
  "date": "${todayStr}",
  "time": "string (format: HH:MM AM/PM)",
  "store": {
    "name": "string (REAL store name - can be the store brand name)",
    "domain": "string (store's website domain, e.g., 'target.com', 'starbucks.com')",
    "address": "string (street address)",
    "city": "string",
    "state": "string (2-letter)",
    "zip": "string",
    "phone": "string (store phone number)",
    "storeNumber": "string (optional, like #1234)"
  },
  "cashier": "string (first name or employee ID)",
  "register": "string (like 'REG 03' or 'Lane 5')",
  "items": [
    {
      "name": "string (short product name as on receipt)",
      "sku": "string (optional SKU/UPC)",
      "quantity": number,
      "unitPrice": number,
      "total": number,
      "discount": number (optional, discount amount if any)
    }
  ],
  "subtotal": number,
  "taxes": [
    { "name": "string (tax name per rules above)", "rate": number (decimal), "amount": number }
  ],
  "taxTotal": number (sum of all tax amounts),
  "taxRate": number (primary tax rate as decimal for backward compat),
  "taxAmount": number (same as taxTotal for backward compat),
  "total": number,
  "payment": {
    "method": "credit" | "debit" | "cash" | "mobile",
    "cardType": "string (VISA, Mastercard, etc. - only if card payment)",
    "cardLast4": "string (only if card payment)",
    "approvalCode": "string (6 chars, only if card payment)",
    "amountTendered": number (only if cash),
    "change": number (only if cash)
  },
  "savings": number (optional, total savings from discounts),
  "loyaltyPoints": number (optional, points earned),
  "barcode": "string (unique barcode number for receipt)",
  "footer": ["string array of 1-3 typical receipt footer messages like 'Thank you!', 'Survey: www.survey.com', 'Return Policy: 30 days']"
}

Apply the tax rules above for ${currency}. Use the correct tax name(s) and rate(s) for the region. Consider category-specific rates for the items being purchased (e.g., food may be taxed differently than other goods).
Generate 3-6 items. Keep the total under $200 for a typical expense purchase.`;

    case 'quote':
      return `${baseInfo}
Generate a realistic QUOTE/PROPOSAL that ${company.name} would receive from a service provider.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to propose services this company would actually need

VENDOR INSTRUCTIONS:
- Use a REAL company that provides ${spendingCategory} products or services
- The vendor should serve the ${company.location} area (use their real office address or headquarters)
- ${getVendorExamples(spendingCategory)}
- Do NOT use consulting firms unless the category is specifically consulting or advisory

LINE ITEM REQUIREMENTS:
- Each line item description MUST be highly specific and detailed - NO generic descriptions
- Include specific deliverables, scope, phases, or service tiers
- BAD examples: "Consulting Services", "Project Management", "Implementation"
- GOOD examples: "Phase 1: Discovery & Requirements Analysis - 40 hours on-site", "AWS Infrastructure Migration - 15 EC2 instances, 3 RDS databases", "Q1 2024 Digital Marketing Campaign Management - Social + PPC", "SOC 2 Type II Compliance Audit & Remediation Support"
- Use realistic professional services pricing

JSON Structure:
{
  "quoteNumber": "string (format: QTE-XXXXX)",
  "date": "${todayStr}",
  "validUntil": "${validUntilStr}",
  "vendor": {
    "name": "string (REAL professional services company that exists)",
    "domain": "string (the vendor's actual website domain, e.g., 'accenture.com', 'deloitte.com')",
    "address": "string (real office address serving ${company.location})",
    "email": "string (realistic email for that company)",
    "phone": "string"
  },
  "client": {
    "name": "${company.name}",
    "address": "${company.location}",
    "email": "procurement@${company.domain}"
  },
  "items": [
    { "id": "string (unique UUID v4)", "description": "string (DETAILED service with scope, deliverables, or timeframe)", "quantity": number (hours or units), "unitPrice": number, "total": number }
  ],
  "subtotal": number,
  "discount": number (optional volume discount, can be 0),
  "total": number,
  "terms": "string (payment terms and conditions)",
  "notes": "string (scope notes or next steps)"
}

Generate exactly ${lineItemCount || 4} line items representing a ${spendingCategory} project or service engagement. Price appropriately for a ${company.employeeCount} employee ${company.industry} company.`;

    case 'contract':
      return `${baseInfo}
Generate a realistic SERVICE CONTRACT/AGREEMENT that ${company.name} would sign with a provider.

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- Company description: ${company.description}
- Use this context to propose services this company would actually need

VENDOR INSTRUCTIONS:
- Use a REAL service provider company that offers ${spendingCategory} products or services
- The provider should have operations in or serving ${company.location} (use their real office address)
- ${getVendorExamples(spendingCategory)}
- Do NOT use consulting firms unless the category is specifically consulting or advisory

SERVICE REQUIREMENTS:
- Each service listed MUST be highly specific and detailed - NO generic descriptions
- Include specific tiers, SLAs, quantities, or coverage details
- BAD examples: "IT Support", "Cloud Services", "Maintenance"
- GOOD examples: "24/7 Managed IT Support - Tier 2 Helpdesk for 250 users", "AWS Reserved Instances - 10x m5.xlarge EC2, 3-year term", "HVAC Preventive Maintenance - Quarterly inspections, 12 units", "Payroll Processing - Semi-monthly, up to 500 employees + direct deposit"
- Terms should be appropriate for a ${spendingCategory} service agreement

JSON Structure:
{
  "contractNumber": "string (format: CTR-XXXXX)",
  "date": "${todayStr}",
  "effectiveDate": "${effectiveDateStr}",
  "expirationDate": "${expirationDateStr}",
  "parties": {
    "provider": {
      "name": "string (REAL ${spendingCategory} service provider that exists)",
      "domain": "string (the provider's actual website domain, e.g., 'aws.amazon.com', 'adp.com')",
      "address": "string (real office address serving ${company.location})",
      "representative": "string (full name)"
    },
    "client": {
      "name": "${company.name}",
      "address": "${company.location}",
      "representative": "string (full name)"
    }
  },
  "services": ["string (DETAILED specific service with scope/SLA/quantities)", ...],
  "terms": ["string (contract term 1)", "string (contract term 2)", ...],
  "totalValue": number (annual contract value for ${spendingCategory} services),
  "paymentSchedule": "string (e.g., Monthly, Quarterly)",
  "autoRenewal": boolean (true if contract auto-renews),
  "renewalNoticeDays": number (days before expiration that written notice is required to cancel, e.g. 60),
  "lastDateToAction": "string (ISO date: expirationDate minus renewalNoticeDays — the deadline to provide cancellation notice)",
  "terminationNoticeDays": number (days of written notice required for termination for convenience, e.g. 30),
  "terminationClause": "string (full termination clause text, e.g. 'Either party may terminate this agreement with 30 days written notice...')",
  "billingFrequency": "string (e.g., Monthly, Quarterly, Annually)",
  "paymentDueDays": number (days after invoice date that payment is due, e.g. 30 for Net 30),
  "signatures": {
    "provider": { "name": "string", "title": "string" },
    "client": { "name": "string", "title": "string (appropriate for ${company.employeeCount} employee company)" }
  }
}

MANDATORY CONTRACT TERMS — the "terms" array MUST include ALL of the following as natural contract language:
1. An AUTO-RENEWAL clause: "This agreement shall automatically renew for successive one-year terms unless either party provides written notice of non-renewal at least [renewalNoticeDays] days prior to the expiration date."
2. A TERMINATION FOR CONVENIENCE clause: "Either party may terminate this agreement for convenience upon [terminationNoticeDays] days prior written notice to the other party."
3. A PAYMENT TERMS clause: "Invoices shall be issued [billingFrequency] and are due within [paymentDueDays] days of the invoice date."
4. Additional standard terms (confidentiality, liability, governing law, etc.)

Calculate lastDateToAction by subtracting renewalNoticeDays from the expirationDate (${expirationDateStr}). For example, if expirationDate is 2027-03-15 and renewalNoticeDays is 60, lastDateToAction would be 2027-01-14.

Generate exactly ${lineItemCount || 5} specific ${spendingCategory} services and 7-9 contract terms (including the 3 mandatory ones above). Set contract value appropriate for a ${company.employeeCount} employee company's ${spendingCategory} needs.`;

    case 'hotel_folio': {
      const checkInDate = new Date(today);
      checkInDate.setDate(checkInDate.getDate() - 3);
      const checkInStr = checkInDate.toISOString().split('T')[0];

      return `${baseInfo}
Generate a realistic HOTEL FOLIO (checkout receipt/invoice) for a business trip by someone from ${company.name}.

HOTEL FOLIO STYLE:
- This is a detailed checkout folio from a business hotel
- Include room charges, incidentals, and detailed tax breakdown
- Use a format typical of major hotel chains

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- An employee is traveling for business purposes

HOTEL INSTRUCTIONS:
- Use a REAL hotel chain (Marriott, Hilton, Hyatt, IHG, etc.) or a real independent hotel
- The hotel should be in a realistic business travel destination
- Include the hotel brand and property name (e.g., "Marriott Marquis New York", "Hilton Chicago O'Hare")
- Use realistic room rates for the hotel tier and location

CHARGE REQUIREMENTS:
- Include multiple nights of room charges
- Add realistic incidentals: parking, room service, minibar, phone, laundry, in-room movies
- Include detailed tax breakdown (occupancy tax, city tax, state tax, resort fee if applicable)
- All charges should be realistic for a business traveler

JSON Structure:
{
  "folioNumber": "string (format: FOL-XXXXXXXX)",
  "hotel": {
    "name": "string (REAL hotel property name, e.g., 'Marriott Marquis San Francisco')",
    "brand": "string (hotel chain name like 'Marriott' or 'Hilton' - optional for independents)",
    "domain": "string (hotel's website domain, e.g., 'marriott.com', 'hilton.com')",
    "address": "string (hotel street address)",
    "city": "string",
    "state": "string (2-letter code)",
    "zip": "string",
    "phone": "string",
    "email": "string (hotel email, optional)"
  },
  "guest": {
    "name": "string (full name of employee)",
    "email": "string (corporate email at ${company.domain})",
    "loyaltyNumber": "string (optional, loyalty program number)",
    "loyaltyTier": "string (optional, like 'Gold', 'Platinum', 'Diamond')"
  },
  "confirmation": "string (confirmation number like ABC123456)",
  "checkIn": "${checkInStr}",
  "checkOut": "${todayStr}",
  "roomNumber": "string (like '1204')",
  "roomType": "string (like 'King Deluxe', 'Executive Suite', 'Standard Double')",
  "nights": number,
  "charges": [
    {
      "category": "Room" | "Parking" | "Food & Beverage" | "Minibar" | "Phone" | "Laundry" | "Business Center" | "Other",
      "description": "string (detailed charge description)",
      "date": "string (date of charge YYYY-MM-DD)",
      "amount": number
    }
  ],
  "roomTotal": number (sum of room charges only),
  "incidentalsTotal": number (sum of non-room charges),
  "taxes": [
    { "name": "string (e.g., 'State Tax', 'City Occupancy Tax', 'Tourism Fee')", "rate": number (optional, like 0.085), "amount": number }
  ],
  "taxTotal": number,
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string",
    "date": "${todayStr}"
  },
  "pointsEarned": number (optional, loyalty points earned)
}

Generate a realistic 2-4 night stay with 8-15 charge line items including room, incidentals, and taxes.`;
    }

    case 'airline_receipt': {
      const bookingDate = new Date(today);
      bookingDate.setDate(bookingDate.getDate() - 14);
      const bookingDateStr = bookingDate.toISOString().split('T')[0];

      const flightDate = new Date(today);
      flightDate.setDate(flightDate.getDate() + 7);
      const flightDateStr = flightDate.toISOString().split('T')[0];

      return `${baseInfo}
Generate a realistic AIRLINE EMAIL RECEIPT for a business trip booked by someone from ${company.name}.

AIRLINE RECEIPT STYLE:
- This is an electronic booking confirmation/receipt like you'd receive via email
- Include all flight details, fare breakdown, and passenger information
- Format like a real airline booking confirmation

CLIENT COMPANY CONTEXT:
- ${company.name} is in the ${company.industry} industry
- They are located at ${company.location}
- An employee is booking business travel

AIRLINE INSTRUCTIONS:
- Use a REAL airline (United, Delta, American, Southwest, JetBlue, Alaska, etc.)
- Use realistic flight numbers for that airline
- Route should make sense for business travel from/to the company's region
- Use real airport codes and airport names

FLIGHT REQUIREMENTS:
- Can be one-way or round-trip
- Use realistic flight times and durations
- Include class of service (Economy, Premium Economy, Business, First)
- Seat assignments should be realistic for the class
- Aircraft type is optional but should be realistic if included

FARE REQUIREMENTS:
- Break down into base fare, taxes, carrier fees
- Include optional extras like baggage, seat selection if applicable
- Total should be realistic for the route and class

JSON Structure:
{
  "confirmationCode": "string (6 character alphanumeric like 'ABC123')",
  "ticketNumber": "string (optional, 13-digit ticket number like '0012345678901')",
  "airline": {
    "name": "string (REAL airline name)",
    "domain": "string (airline website domain, e.g., 'united.com', 'delta.com')"
  },
  "passenger": {
    "name": "string (full name in LASTNAME/FIRSTNAME format)",
    "frequentFlyer": "string (optional, frequent flyer number)",
    "tierStatus": "string (optional, like 'Silver', 'Gold', 'Platinum', '1K', 'Diamond')"
  },
  "bookingDate": "${bookingDateStr}",
  "flights": [
    {
      "flightNumber": "string (like 'UA1234', 'DL567')",
      "date": "${flightDateStr}",
      "departure": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (format: HH:MM AM/PM)",
        "terminal": "string (optional)",
        "gate": "string (optional)"
      },
      "arrival": {
        "airport": "string (full airport name)",
        "code": "string (3-letter IATA code)",
        "time": "string (format: HH:MM AM/PM)",
        "terminal": "string (optional)"
      },
      "class": "string (Economy, Premium Economy, Business, First)",
      "seat": "string (optional, like '12A')",
      "aircraft": "string (optional, like 'Boeing 737-800')",
      "duration": "string (optional, like '5h 30m')"
    }
  ],
  "fareBreakdown": {
    "baseFare": number,
    "taxes": number,
    "fees": number,
    "baggage": number (optional, if checked bag purchased),
    "seatSelection": number (optional, if preferred seat purchased),
    "other": number (optional, other fees)
  },
  "total": number,
  "payment": {
    "method": "Credit Card",
    "cardType": "string (VISA, Mastercard, Amex)",
    "cardLast4": "string"
  },
  "milesEarned": number (optional, frequent flyer miles to be earned)
}

Generate a realistic 1-2 flight itinerary (one-way or round-trip) with appropriate pricing for the route and class.`;
    }

    default:
      throw new Error(`Unknown asset type: ${type}`);
  }
}

function buildConnectedPrompt(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  relatedAssets: RelatedAssetContext,
  invoiceConfig?: InvoiceConfig,
  currency: string = 'USD',
  lineItemCount?: number,
): string {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const effectiveDate = new Date(today);
  effectiveDate.setDate(effectiveDate.getDate() + 14);
  const effectiveDateStr = effectiveDate.toISOString().split('T')[0];

  const expirationDate = new Date(effectiveDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  const expirationDateStr = expirationDate.toISOString().split('T')[0];

  const { quote, contract } = relatedAssets;

  if (type === 'contract' && quote) {
    return `
CONNECTED DOCUMENT GENERATION - CONTRACT FROM QUOTE

The client has accepted Quote ${quote.quoteNumber}. Generate a SERVICE CONTRACT that formalizes this agreement.

QUOTE DETAILS TO REFERENCE:
- Quote Number: ${quote.quoteNumber}
- Quote Date: ${quote.date}
- Quote Total: $${quote.total.toLocaleString()}
- Vendor: ${quote.vendor.name}
- Vendor Domain: ${quote.vendor.domain}
- Vendor Address: ${quote.vendor.address}
- Vendor Email: ${quote.vendor.email}
- Vendor Phone: ${quote.vendor.phone}

QUOTED LINE ITEMS:
${quote.items.map((item) => `- [ID: ${item.id || 'N/A'}] ${item.description}: ${item.quantity} x $${item.unitPrice} = $${item.total}`).join('\n')}

CLIENT INFORMATION:
- Client Name: ${quote.client.name}
- Client Address: ${quote.client.address}
- Client Email: ${quote.client.email}

CRITICAL REQUIREMENTS:
1. Use the EXACT SAME vendor information from the quote (name, domain, address, email, phone)
2. Services in the contract MUST align with the quoted line items
3. Contract totalValue should match or be close to the quote total: $${quote.total.toLocaleString()}
4. Include "quoteReference": "${quote.quoteNumber}" in your JSON output
5. The contract formalizes the services that were quoted

JSON Structure:
{
  "contractNumber": "string (format: CTR-XXXXX)",
  "date": "${todayStr}",
  "effectiveDate": "${effectiveDateStr}",
  "expirationDate": "${expirationDateStr}",
  "quoteReference": "${quote.quoteNumber}",
  "parties": {
    "provider": {
      "name": "${quote.vendor.name}",
      "domain": "${quote.vendor.domain}",
      "address": "${quote.vendor.address}",
      "representative": "string (full name)"
    },
    "client": {
      "name": "${company.name}",
      "address": "${company.location}",
      "representative": "string (full name)"
    }
  },
  "services": ["string (services derived from quoted line items)", ...],
  "terms": ["string (contract term)", ...],
  "totalValue": ${quote.total},
  "paymentSchedule": "string (e.g., Monthly, Quarterly, or as invoiced)",
  "autoRenewal": boolean (true if contract auto-renews),
  "renewalNoticeDays": number (days before expiration notice is required, e.g. 60),
  "lastDateToAction": "string (ISO date: expirationDate minus renewalNoticeDays)",
  "terminationNoticeDays": number (days of written notice for termination, e.g. 30),
  "terminationClause": "string (full termination clause text)",
  "billingFrequency": "string (e.g., Monthly, Quarterly, Annually)",
  "paymentDueDays": number (days after invoice date payment is due, e.g. 30),
  "signatures": {
    "provider": { "name": "string", "title": "string" },
    "client": { "name": "string", "title": "string" }
  }
}

MANDATORY CONTRACT TERMS — the "terms" array MUST include ALL of the following as natural contract language:
1. An AUTO-RENEWAL clause: "This agreement shall automatically renew for successive one-year terms unless either party provides written notice of non-renewal at least [renewalNoticeDays] days prior to the expiration date."
2. A TERMINATION FOR CONVENIENCE clause: "Either party may terminate this agreement for convenience upon [terminationNoticeDays] days prior written notice to the other party."
3. A PAYMENT TERMS clause: "Invoices shall be issued [billingFrequency] and are due within [paymentDueDays] days of the invoice date."
4. Additional standard terms (confidentiality, liability, governing law, etc.)

Calculate lastDateToAction by subtracting renewalNoticeDays from the expirationDate (${expirationDateStr}).

Transform the quoted line items into contract service descriptions. Include 7-9 contract terms (including the 3 mandatory ones above).`;
  }

  if (type === 'invoice' && (quote || contract)) {
    const vendorInfo = quote?.vendor || (contract
      ? {
          name: contract.parties.provider.name,
          domain: contract.parties.provider.domain,
          address: contract.parties.provider.address,
          email: `billing@${contract.parties.provider.domain}`,
          phone: '(800) 555-0100',
        }
      : null);

    const referenceSection: string[] = [];
    if (quote) referenceSection.push(`Quote Reference: ${quote.quoteNumber}`);
    if (contract) referenceSection.push(`Contract Reference: ${contract.contractNumber}`);

    const totalAmount = quote?.total || contract?.totalValue || 10000;

    let invoiceAmountInstructions = '';
    let invoiceNumberSuffix = '';

    if (invoiceConfig) {
      const {
        invoiceNumber,
        totalInvoices,
        isLast,
        previousInvoicedAmount,
        targetSubtotal,
        splitPercentage,
        matchingMode,
        quantitySplits,
      } = invoiceConfig;
      invoiceNumberSuffix = `-${invoiceNumber}`;

      const remainingBalance = totalAmount - previousInvoicedAmount;
      const label = `Payment ${invoiceNumber} of ${totalInvoices} (${splitPercentage}%)`;
      const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      let lineItemModeInstructions: string;

      if (matchingMode === '2way' && quote) {
        lineItemModeInstructions = `
PROPORTIONAL LINE ITEMS (2-Way Matching Mode):
- Use the EXACT SAME line item descriptions and IDs from the quote — do NOT rename or rephrase them
- Each line item's total = quoted total × ${splitPercentage}% (the split percentage for this invoice)
- Keep quantity at 1 for each item and set unitPrice = item total (these are license/subscription payments)
- Concrete targets for each line item:
${quote.items.map((item) => `  - "${item.description}" → $${fmt(Math.round((item.total * splitPercentage) / 100 * 100) / 100)}`).join('\n')}
- The sum of these amounts MUST equal exactly $${fmt(targetSubtotal)}`;
      } else if (matchingMode === '3way' && quantitySplits && quantitySplits.length > 0) {
        lineItemModeInstructions = `
QUANTITY-BASED LINE ITEMS (3-Way Matching Mode - Partial Delivery ${invoiceNumber} of ${totalInvoices}):
- Use the EXACT SAME line item descriptions and IDs from the quote — do NOT rename or rephrase them
- Use the EXACT SAME unit prices from the quote
- This invoice represents a PARTIAL DELIVERY with these specific quantities and amounts:
${quantitySplits.map((li) => `  - [ID: ${li.id}] "${li.description}": ${li.quantity} units × $${fmt(li.unitPrice)} = $${fmt(li.total)}`).join('\n')}
- The subtotal MUST equal exactly $${fmt(targetSubtotal)}
- Each line item's quantity, unitPrice, and total MUST match the values above exactly
- This represents a shipment/delivery of goods that will be received and matched against the original PO`;
      } else {
        lineItemModeInstructions = `
PHASE-BASED LINE ITEMS:
- Invoice line items should represent work completed or goods delivered in this phase/period
- Line item totals must add up to exactly $${fmt(targetSubtotal)}`;
      }

      invoiceAmountInstructions = `
PARTIAL INVOICE INSTRUCTIONS - CRITICAL AMOUNTS:
- This is Invoice ${invoiceNumber} of ${totalInvoices} for this agreement (${splitPercentage}% of total)
- Quote/Contract Total: $${fmt(totalAmount)}
- Previously Invoiced: $${fmt(previousInvoicedAmount)}
- Remaining Balance: $${fmt(remainingBalance)}
- **THIS INVOICE SUBTOTAL MUST BE EXACTLY: $${fmt(targetSubtotal)}**
- Label this invoice as: "${label}"
- ${isLast ? 'This is the FINAL invoice - the subtotal MUST equal the exact remaining balance above' : 'Ensure line items add up to the exact subtotal specified'}
${lineItemModeInstructions}

AMOUNT VERIFICATION:
- Your line item totals MUST add up to exactly $${fmt(targetSubtotal)}
- Tax is calculated separately on top of the subtotal
- After all ${totalInvoices} invoices, the combined subtotals must equal $${fmt(totalAmount)}

TAX CONSISTENCY: All ${totalInvoices} invoices in this series MUST use the same tax name and rate. Use the tax rate appropriate for the vendor's location. Do NOT vary the tax rate between invoices.`;
    }

    const lineItemsSource = quote
      ? `
QUOTED LINE ITEMS (MUST preserve exact quantities and unit prices from the quote):
${quote.items.map((item) => `- [ID: ${item.id || 'N/A'}] ${item.description}: ${item.quantity} x $${item.unitPrice} = $${item.total}`).join('\n')}

CRITICAL: Each invoice line item MUST use the SAME quantity and unit price as the quote above. Do NOT collapse quantities into 1 with a lump-sum unit price. For example, if the quote says "100 x $250.00 = $25,000.00", the invoice MUST also say quantity: 100, unitPrice: 250.00, total: 25000.00.
`
      : contract
        ? `
CONTRACT SERVICES (invoice for these services):
${contract.services.map((service) => `- ${service}`).join('\n')}
Contract Total Value: $${contract.totalValue.toLocaleString()}
`
        : '';

    return `
CONNECTED DOCUMENT GENERATION - INVOICE FROM ${quote && contract ? 'QUOTE & CONTRACT' : quote ? 'QUOTE' : 'CONTRACT'}

Generate an INVOICE for work performed under the existing agreement.
${invoiceAmountInstructions}

${referenceSection.length > 0 ? `DOCUMENT REFERENCES:\n${referenceSection.map((r) => `- ${r}`).join('\n')}` : ''}

${quote ? `QUOTE DETAILS:
- Quote Number: ${quote.quoteNumber}
- Quote Date: ${quote.date}
- Quote Total: $${quote.total.toLocaleString()}` : ''}

${contract ? `CONTRACT DETAILS:
- Contract Number: ${contract.contractNumber}
- Contract Date: ${contract.date}
- Contract Total Value: $${contract.totalValue.toLocaleString()}
- Payment Schedule: ${contract.paymentSchedule}` : ''}

VENDOR INFORMATION (MUST USE EXACTLY):
- Vendor Name: ${vendorInfo?.name}
- Vendor Domain: ${vendorInfo?.domain}
- Vendor Address: ${vendorInfo?.address}
- Vendor Email: ${vendorInfo?.email || `billing@${vendorInfo?.domain}`}
- Vendor Phone: ${vendorInfo?.phone || '(800) 555-0100'}

CLIENT INFORMATION:
- Client Name: ${company.name}
- Client Address: ${company.location}
${lineItemsSource}

CRITICAL REQUIREMENTS:
1. Use the EXACT SAME vendor information (name, domain, address, email, phone)
2. Invoice line items MUST relate to the quoted/contracted services
3. ${invoiceConfig ? `Follow the partial invoice instructions above for amount and labeling` : 'This invoice should cover the FULL quoted/contracted amount with the EXACT quantities and unit prices from the quote'}
4. Include reference fields in your JSON output

JSON Structure:
{
  "invoiceNumber": "string (format: INV-XXXXX${invoiceNumberSuffix})",
  "date": "${todayStr}",
  "dueDate": "${dueDateStr}",
  ${quote ? `"quoteReference": "${quote.quoteNumber}",` : ''}
  ${contract ? `"contractReference": "${contract.contractNumber}",` : ''}
  "vendor": {
    "name": "${vendorInfo?.name}",
    "domain": "${vendorInfo?.domain}",
    "address": "${vendorInfo?.address}",
    "email": "${vendorInfo?.email || `billing@${vendorInfo?.domain}`}",
    "phone": "${vendorInfo?.phone || '(800) 555-0100'}"
  },
  "client": {
    "name": "${company.name}",
    "address": "${company.location}",
    "email": "accounts@${company.domain}"
  },
  "lineItems": [
    { "id": "string (REUSE the quote item ID)", "description": "string (EXACT description from quote)", "quantity": number (MUST match quote quantity or partial delivery quantity), "unitPrice": number (MUST match quote unit price), "total": number (quantity × unitPrice) }
  ],
  "subtotal": number,
  "taxes": [
    { "name": "string (tax name appropriate for ${currency} region)", "rate": number (decimal), "amount": number }
  ],
  "taxTotal": number (sum of all tax amounts),
  "tax": number (same value as taxTotal for backward compatibility),
  "total": number,
  "paymentTerms": "Net 30",
  "remitTo": {
    "bankName": "string (a real major bank for the ${currency} region)",
    "accountName": "${vendorInfo?.name}",
    "routingNumber": "string (9-digit)",
    "accountNumber": "string (10-12 digit)"
  },
  "notes": "string (${invoiceConfig ? `mention this is invoice ${invoiceConfig.invoiceNumber} of ${invoiceConfig.totalInvoices} and reference the quote/contract` : 'reference the quote/contract in the note'})"
}

${getTaxGuidance(currency)}

${B2B_TAX_RULES}
The CLIENT is located at: ${company.location}
The VENDOR is: ${vendorInfo?.name} located at ${vendorInfo?.address}. Evaluate whether this is a domestic or cross-border transaction and apply the correct B2B tax treatment.

Generate exactly ${lineItemCount || 3} line items that represent billable work from the quoted/contracted services.`;
  }

  return buildPrompt(type, company, spendingCategory, currency);
}
