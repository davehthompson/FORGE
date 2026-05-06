import { CompanyProfile } from '../types.js';
import {
  enrichCompanyProfile,
  enrichCompanyProfileStreaming,
  ClaudeError,
} from './claude.js';

// ---------------------------------------------------------------------------
// Domain enrichment via Claude + web_search.
// Replaces the previous People Data Labs lookup + standalone OpenAI categories
// call. A single Claude call (with the hosted web_search tool) returns the
// company profile and likely B2B spending categories in one round trip.
// ---------------------------------------------------------------------------

const LOGO_DEV_KEY = process.env.LOGO_DEV_KEY ?? '';

function cleanDomainInput(domain: string): string {
  return domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
}

function buildCompanyProfile(
  cleanDomain: string,
  enriched: Awaited<ReturnType<typeof enrichCompanyProfile>>,
): CompanyProfile {
  return {
    name: toTitleCase(enriched.name) || cleanDomain,
    domain: cleanDomain,
    description: capitalizeSentences(enriched.description) || `Company operating at ${cleanDomain}`,
    employeeCount: enriched.employeeCount || 'Unknown',
    industry: toTitleCase(enriched.industry) || 'General Business',
    location: enriched.location || 'Unknown',
    logo: getLogoUrl(cleanDomain),
    spendingCategories: Array.isArray(enriched.spendingCategories) && enriched.spendingCategories.length > 0
      ? enriched.spendingCategories
      : getDefaultCategories(),
  };
}

export async function enrichCompanyFromDomain(domain: string): Promise<CompanyProfile> {
  const cleanDomain = cleanDomainInput(domain);

  let enriched;
  try {
    enriched = await enrichCompanyProfile(cleanDomain);
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    throw err;
  }

  return buildCompanyProfile(cleanDomain, enriched);
}

export async function enrichCompanyFromDomainStreaming(
  domain: string,
  onStatus: (status: string) => void,
  reqId?: string,
): Promise<CompanyProfile> {
  const cleanDomain = cleanDomainInput(domain);

  let enriched;
  try {
    enriched = await enrichCompanyProfileStreaming(cleanDomain, onStatus, reqId);
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    throw err;
  }

  return buildCompanyProfile(cleanDomain, enriched);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTitleCase(str: string): string {
  if (!str) return str;
  const lowercaseWords = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index === 0 || !lowercaseWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

function capitalizeSentences(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
}

function getLogoUrl(domain: string, size: number = 128): string {
  // Skip building a URL when no token is configured — Logo.dev's image
  // endpoint returns 401 for any request without a token, so it's better
  // to ship an empty `logo` field and let the client render its icon
  // fallback than to ship a guaranteed-broken URL.
  if (!LOGO_DEV_KEY) return '';

  const cleanDomain = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  const params = new URLSearchParams({
    token: LOGO_DEV_KEY,
    size: size.toString(),
    format: 'png',
    retina: 'true',
    fallback: 'monogram',
  });

  return `https://img.logo.dev/${cleanDomain}?${params.toString()}`;
}

function getDefaultCategories(): string[] {
  return [
    'Office supplies',
    'Software subscriptions',
    'Professional services',
    'Travel & entertainment',
    'Marketing & advertising',
  ];
}
