import axios, { AxiosError } from 'axios';
import type { CompanyProfile, AssetType, AssetData, RelatedAssetContext, QuoteData, ContractData, InvoiceData } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Structured error helpers
//
// Every server response (and SSE error event) carries a `code` alongside the
// human-readable `error` string. We attach that code onto the thrown Error so
// downstream consumers (stores, components, the global Toast) can branch on
// failure mode without parsing the message.
// ---------------------------------------------------------------------------

export interface ApiError extends Error {
  code?: string;
}

export function createApiError(message: string, code?: string): ApiError {
  const err = new Error(message) as ApiError;
  if (code) err.code = code;
  return err;
}

interface ServerErrorBody {
  success?: boolean;
  error?: string;
  code?: string;
  message?: string;
}

function errorFromAxios(err: unknown, fallbackMessage: string): ApiError {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ServerErrorBody | undefined;
    return createApiError(
      body?.error || body?.message || err.message || fallbackMessage,
      body?.code,
    );
  }
  if (err instanceof Error) return createApiError(err.message || fallbackMessage);
  return createApiError(fallbackMessage);
}

async function errorFromFetchResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  let body: ServerErrorBody | undefined;
  try {
    body = (await response.json()) as ServerErrorBody;
  } catch {
    // response not JSON
  }
  return createApiError(
    body?.error || body?.message || `${fallbackMessage} (HTTP ${response.status})`,
    body?.code,
  );
}

// Company enrichment
export async function enrichCompany(domain: string): Promise<CompanyProfile> {
  try {
    const response = await api.post<{ success: boolean; data: CompanyProfile; error?: string; code?: string }>(
      '/enrich',
      { domain },
    );
    if (!response.data.success) {
      throw createApiError(response.data.error || 'Failed to enrich company data', response.data.code);
    }
    return response.data.data;
  } catch (err) {
    if ((err as ApiError).code) throw err;
    throw errorFromAxios(err, 'Failed to enrich company data');
  }
}

// Company enrichment with streaming status updates (Claude + web_search)
export async function enrichCompanyStreaming(
  domain: string,
  onStatus: (status: string) => void,
): Promise<CompanyProfile> {
  const response = await fetch('/api/enrich/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });

  if (!response.ok) {
    throw await errorFromFetchResponse(response, 'Failed to enrich company data');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw createApiError('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: CompanyProfile | null = null;
  // currentEvent MUST persist across reader.read() iterations. SSE frames are
  // `event: <name>\ndata: <json>\n\n` and the two lines can land in different
  // chunks (TCP segmentation, proxy flush boundaries, our 2-call res.write()
  // on the server). If currentEvent resets every chunk, the data line on the
  // far side of the boundary arrives tagged as '' and gets silently dropped —
  // which manifests as a "succeeded server-side, threw NO_RESULT client-side"
  // bug that bumps the user back to the previous step.
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line === '') {
        // Blank line terminates an SSE message — reset event tag for the next.
        currentEvent = '';
        continue;
      }
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);

          if (currentEvent === 'status' && parsed.status) {
            onStatus(parsed.status);
          } else if (currentEvent === 'complete' && parsed.data) {
            result = parsed.data as CompanyProfile;
          } else if (currentEvent === 'error' && parsed.error) {
            throw createApiError(parsed.error, parsed.code);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }

  if (!result) {
    throw createApiError('No company profile received from enrichment');
  }

  return result;
}

// Asset generation (non-streaming)
export async function generateAsset(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  currency: string = 'USD'
): Promise<AssetData> {
  try {
    const response = await api.post<{ success: boolean; data: AssetData; error?: string; code?: string }>(
      '/generate',
      { type, company, spendingCategory, currency },
    );
    if (!response.data.success) {
      throw createApiError(response.data.error || 'Failed to generate asset', response.data.code);
    }
    return response.data.data;
  } catch (err) {
    if ((err as ApiError).code) throw err;
    throw errorFromAxios(err, 'Failed to generate asset');
  }
}

// Asset generation with streaming status updates
export async function generateAssetStreaming(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  onStatus: (status: string) => void,
  relatedAssets?: RelatedAssetContext,
  currency: string = 'USD',
  lineItemCount?: number
): Promise<AssetData> {
  const response = await fetch('/api/generate/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, company, spendingCategory, relatedAssets, currency, lineItemCount }),
  });

  if (!response.ok) {
    throw await errorFromFetchResponse(response, 'Failed to generate asset');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw createApiError('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: AssetData | null = null;
  // Track terminal-event arrival so we can discriminate three failure modes
  // when result is still null at the end of the read loop:
  //   - never saw any data → server never wrote anything (route 4xx, instant
  //     hangup, or our SSE write failed to flush)
  //   - saw status events but no `complete`/`error` → upstream stream was cut
  //     mid-flight (Ramplify/CloudFront L7 gateway timeout — silent socket
  //     severance, no terminal event ever sent)
  //   - saw `complete` → result is set, this branch isn't reached
  let sawAnyStatus = false;
  let sawTerminalEvent = false;
  // currentEvent MUST persist across reader.read() iterations — see the
  // matching note in enrichCompanyStreaming. The bug it guards against:
  // server emits `event: complete\n` then `data: {...}\n\n` as two writes;
  // when those land in different reader chunks, a per-iteration reset would
  // drop the data line silently and surface as NO_RESULT/GATEWAY_DROPPED.
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line === '') {
        currentEvent = '';
        continue;
      }
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);

          if (currentEvent === 'status' && parsed.status) {
            sawAnyStatus = true;
            onStatus(parsed.status);
          } else if (currentEvent === 'complete' && parsed.success && parsed.data) {
            sawTerminalEvent = true;
            result = parsed.data;
          } else if (currentEvent === 'error' && parsed.error) {
            sawTerminalEvent = true;
            throw createApiError(parsed.error, parsed.code);
          }
        } catch (e) {
          // Ignore JSON parse errors for incomplete data
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }

  if (!result) {
    if (sawAnyStatus && !sawTerminalEvent) {
      throw createApiError(
        'The connection to our AI service was cut before generation finished. ' +
          'This usually means the request took longer than the proxy allows. ' +
          'Try again with a smaller asset or simpler company.',
        'GATEWAY_DROPPED',
      );
    }
    throw createApiError('No result received from streaming generation', 'NO_RESULT');
  }

  return result;
}

// Check if the selected assets should use connected generation flow
export function shouldUseConnectedFlow(selectedAssets: AssetType[]): boolean {
  const hasQuote = selectedAssets.includes('quote');
  const hasContract = selectedAssets.includes('contract');
  const hasInvoice = selectedAssets.includes('invoice');
  
  // Connected flow when: quote+invoice, quote+contract, contract+invoice, or any combination of 3
  return (hasQuote && hasContract) || (hasQuote && hasInvoice) || (hasContract && hasInvoice);
}

// Get the correct order for connected generation
export function getConnectedGenerationOrder(selectedAssets: AssetType[]): AssetType[] {
  const hasQuote = selectedAssets.includes('quote');
  const hasContract = selectedAssets.includes('contract');
  const hasInvoice = selectedAssets.includes('invoice');
  const hasReceipt = selectedAssets.includes('receipt');
  
  // Order: Quote -> Contract -> Invoice (Receipt is independent)
  const orderedAssets: AssetType[] = [];
  
  if (hasQuote) orderedAssets.push('quote');
  if (hasContract) orderedAssets.push('contract');
  if (hasInvoice) orderedAssets.push('invoice');
  if (hasReceipt) orderedAssets.push('receipt');
  
  return orderedAssets;
}

/**
 * Generate random percentage splits for invoices.
 * Produces natural-looking splits that avoid perfectly equal divisions.
 * The percentages always sum to exactly 100 and subtotals sum to exactly totalAmount.
 */
export function generateInvoiceSplits(count: number, totalAmount: number): { percentage: number; subtotal: number }[] {
  if (count === 1) {
    return [{ percentage: 100, subtotal: Math.round(totalAmount * 100) / 100 }];
  }

  // Generate random weights with a minimum floor so no invoice is trivially small
  const minWeight = 15; // Each invoice is at least ~15% of the total
  const weights: number[] = [];

  for (let i = 0; i < count; i++) {
    weights.push(minWeight + Math.random() * (100 - minWeight * count));
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Convert weights to rounded percentages that sum to 100
  const rawPercentages = weights.map(w => (w / weightSum) * 100);
  const percentages = rawPercentages.map(p => Math.round(p));

  // Adjust rounding so they sum to exactly 100
  let diff = 100 - percentages.reduce((a, b) => a + b, 0);
  // Distribute the rounding remainder to the largest invoice
  const maxIdx = percentages.indexOf(Math.max(...percentages));
  percentages[maxIdx] += diff;

  // Convert percentages to exact subtotals
  const splits: { percentage: number; subtotal: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      // Final invoice gets the exact remainder to avoid floating-point drift
      splits.push({
        percentage: percentages[i],
        subtotal: Math.round((totalAmount - allocated) * 100) / 100,
      });
    } else {
      const subtotal = Math.round(totalAmount * (percentages[i] / 100) * 100) / 100;
      splits.push({ percentage: percentages[i], subtotal });
      allocated += subtotal;
    }
  }

  return splits;
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface QuantityInvoiceSplit {
  percentage: number;
  subtotal: number;
  lineItems: { description: string; id: string; quantity: number; unitPrice: number; total: number }[];
}

/**
 * Split quote line-item quantities across invoices for 3-way matching.
 * Each invoice gets a random share of each item's quantity (whole numbers, min ~15%).
 * Unit prices stay constant; subtotal = sum of qty * unitPrice per item.
 */
export function computeQuantitySplits(quoteItems: QuoteItem[], invoiceCount: number): QuantityInvoiceSplit[] {
  if (invoiceCount === 1) {
    const lineItems = quoteItems.map(item => ({
      description: item.description,
      id: item.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: Math.round(item.quantity * item.unitPrice * 100) / 100,
    }));
    const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.total, 0) * 100) / 100;
    return [{ percentage: 100, subtotal, lineItems }];
  }

  // For each quote item, split its quantity across invoices
  const allAllocations: number[][] = []; // allAllocations[itemIdx][invoiceIdx]

  for (const item of quoteItems) {
    const qty = item.quantity;
    const allocations: number[] = [];

    if (qty <= invoiceCount) {
      // Not enough units to split meaningfully — give 1 to first N invoices, 0 to the rest
      // Then give remainder to last invoice
      let remaining = qty;
      for (let i = 0; i < invoiceCount; i++) {
        if (remaining > 0) {
          allocations.push(1);
          remaining--;
        } else {
          allocations.push(0);
        }
      }
    } else {
      // Random split with minimum floor
      const minPerInvoice = Math.max(1, Math.floor(qty * 0.15 / invoiceCount));
      const weights: number[] = [];
      for (let i = 0; i < invoiceCount; i++) {
        weights.push(minPerInvoice + Math.random() * (qty - minPerInvoice * invoiceCount));
      }
      const weightSum = weights.reduce((a, b) => a + b, 0);

      let allocated = 0;
      for (let i = 0; i < invoiceCount; i++) {
        if (i === invoiceCount - 1) {
          allocations.push(qty - allocated);
        } else {
          const share = Math.max(1, Math.round((weights[i] / weightSum) * qty));
          const capped = Math.min(share, qty - allocated - (invoiceCount - i - 1));
          allocations.push(capped);
          allocated += capped;
        }
      }
    }

    allAllocations.push(allocations);
  }

  // Build the result per invoice
  const totalQuoteAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
  const results: QuantityInvoiceSplit[] = [];

  for (let inv = 0; inv < invoiceCount; inv++) {
    const lineItems = quoteItems.map((item, itemIdx) => {
      const qty = allAllocations[itemIdx][inv];
      return {
        description: item.description,
        id: item.id,
        quantity: qty,
        unitPrice: item.unitPrice,
        total: Math.round(qty * item.unitPrice * 100) / 100,
      };
    });
    const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.total, 0) * 100) / 100;
    const percentage = Math.round((subtotal / totalQuoteAmount) * 100);
    results.push({ percentage, subtotal, lineItems });
  }

  return results;
}

// Result type for connected generation (includes multiple invoices)
export interface ConnectedGenerationResult {
  assets: Partial<Record<AssetType, AssetData>>;
  invoices: InvoiceData[];
}

// Generate connected assets in the proper order with multiple invoices
export async function generateConnectedAssetsStreaming(
  types: AssetType[],
  company: CompanyProfile,
  spendingCategory: string,
  onStatus: (type: AssetType, status: string, invoiceIndex?: number) => void,
  invoiceCount: number = 2,
  currency: string = 'USD',
  lineItemCount?: number,
  matchingMode: '2way' | '3way' = '2way'
): Promise<ConnectedGenerationResult> {
  const results: Partial<Record<AssetType, AssetData>> = {};
  const invoices: InvoiceData[] = [];
  const orderedTypes = getConnectedGenerationOrder(types);
  
  let quoteData: QuoteData | undefined;
  let contractData: ContractData | undefined;
  
  for (const type of orderedTypes) {
    // Build related assets context based on what's been generated
    let relatedAssets: RelatedAssetContext | undefined;
    
    if (type === 'contract' && quoteData) {
      relatedAssets = { quote: quoteData };
      onStatus(type, 'Linking to quote...');
    } else if (type === 'invoice') {
      // For invoices in connected flow, generate multiple
      if (quoteData || contractData) {
        const totalAmount = quoteData?.total || contractData?.totalValue || 10000;

        // For 3-way mode with a quote, compute quantity-based splits; otherwise use dollar splits
        const use3WayQty = matchingMode === '3way' && quoteData;
        const qtySplits = use3WayQty ? computeQuantitySplits(quoteData!.items, invoiceCount) : null;
        const dollarSplits = qtySplits ? null : generateInvoiceSplits(invoiceCount, totalAmount);

        let previousInvoicedAmount = 0;
        
        for (let i = 0; i < invoiceCount; i++) {
          const isLast = i === invoiceCount - 1;
          const invoiceNumber = i + 1;

          let targetSubtotal: number;
          let splitPercentage: number;
          let quantitySplitsForInvoice: typeof qtySplits extends null ? undefined : NonNullable<typeof qtySplits>[number]['lineItems'] | undefined;

          if (qtySplits) {
            targetSubtotal = qtySplits[i].subtotal;
            splitPercentage = qtySplits[i].percentage;
            quantitySplitsForInvoice = qtySplits[i].lineItems;
          } else {
            const split = dollarSplits![i];
            splitPercentage = split.percentage;
            targetSubtotal = isLast
              ? Math.round((totalAmount - previousInvoicedAmount) * 100) / 100
              : split.subtotal;
            quantitySplitsForInvoice = undefined;
          }
          
          onStatus('invoice', `Generating invoice ${i + 1} of ${invoiceCount} (${splitPercentage}%)...`, i);
          
          const invoiceRelatedAssets: RelatedAssetContext = {
            quote: quoteData,
            contract: contractData,
          };
          
          const response = await fetch('/api/generate/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'invoice',
              company,
              spendingCategory,
              relatedAssets: invoiceRelatedAssets,
              currency,
              lineItemCount,
              invoiceConfig: {
                invoiceNumber,
                totalInvoices: invoiceCount,
                totalAmount,
                targetSubtotal,
                splitPercentage,
                isLast,
                previousInvoicedAmount,
                matchingMode,
                ...(quantitySplitsForInvoice ? { quantitySplits: quantitySplitsForInvoice } : {}),
              },
            }),
          });

          if (!response.ok) {
            throw await errorFromFetchResponse(response, 'Failed to generate invoice');
          }

          const reader = response.body?.getReader();
          if (!reader) throw createApiError('No response body');

          const decoder = new TextDecoder();
          let buffer = '';
          let invoiceData: InvoiceData | null = null;
          // currentEvent persists across reads — see enrichCompanyStreaming.
          let currentEvent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line === '') {
                currentEvent = '';
                continue;
              }
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7);
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6);
                try {
                  const parsed = JSON.parse(data);
                  if (currentEvent === 'status' && parsed.status) {
                    onStatus('invoice', parsed.status, i);
                  } else if (currentEvent === 'complete' && parsed.success && parsed.data) {
                    invoiceData = parsed.data as InvoiceData;
                  } else if (currentEvent === 'error' && parsed.error) {
                    throw createApiError(parsed.error, parsed.code);
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }

          if (!invoiceData) throw createApiError('No invoice data received');
          invoices.push(invoiceData);
          
          // Add this invoice's subtotal to the cumulative amount for the next invoice
          previousInvoicedAmount += invoiceData.subtotal || 0;
        }
        
        // Store first invoice in results for backward compatibility
        if (invoices.length > 0) {
          results['invoice'] = invoices[0];
        }
        continue; // Skip the normal generation since we handled invoices specially
      }
    }
    
    // Normal generation for non-invoice types (or invoice without connected flow)
    const data = await generateAssetStreaming(
      type,
      company,
      spendingCategory,
      (status) => onStatus(type, status),
      relatedAssets,
      currency,
      lineItemCount
    );
    
    results[type] = data;
    
    // Store for subsequent connected generation
    if (type === 'quote') {
      quoteData = data as QuoteData;
    } else if (type === 'contract') {
      contractData = data as ContractData;
    }
  }
  
  return { assets: results, invoices };
}

// Generate multiple assets with streaming
export async function generateAssetsStreaming(
  types: AssetType[],
  company: CompanyProfile,
  spendingCategory: string,
  onStatus: (type: AssetType, status: string) => void
): Promise<Record<AssetType, AssetData>> {
  const results: Partial<Record<AssetType, AssetData>> = {};
  
  // Generate assets sequentially to show progress for each
  for (const type of types) {
    const data = await generateAssetStreaming(
      type,
      company,
      spendingCategory,
      (status) => onStatus(type, status)
    );
    results[type] = data;
  }
  
  return results as Record<AssetType, AssetData>;
}

// Generate multiple assets (non-streaming, parallel)
export async function generateAssets(
  types: AssetType[],
  company: CompanyProfile,
  spendingCategory: string
): Promise<Record<AssetType, AssetData>> {
  const results: Partial<Record<AssetType, AssetData>> = {};
  
  // Generate assets in parallel
  const promises = types.map(async (type) => {
    const data = await generateAsset(type, company, spendingCategory);
    results[type] = data;
  });
  
  await Promise.all(promises);
  
  return results as Record<AssetType, AssetData>;
}

// PDF/JPG export now happens entirely client-side — see services/capture.ts.
// The previous server-rendered Puppeteer pipeline was removed along with the
// chromium download to keep the deploy lean.

// Gemini receipt image generation (Nano Banana)
export async function generateReceiptImage(
  prompt: string,
  scene: string = 'restaurant_table'
): Promise<Blob> {
  const response = await fetch('/api/generate/receipt-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, scene }),
  });

  if (!response.ok) {
    throw await errorFromFetchResponse(response, 'Failed to generate receipt image');
  }

  return response.blob();
}

// Quick receipt generation from prompt
export async function generateQuickReceipt(
  prompt: string,
  receiptType: 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt',
  currency: string,
  onStatus: (status: string) => void
): Promise<AssetData> {
  const response = await fetch('/api/generate/quick-receipt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, receiptType, currency }),
  });

  if (!response.ok) {
    throw await errorFromFetchResponse(response, 'Failed to generate receipt');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw createApiError('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: AssetData | null = null;
  // currentEvent persists across reads — see enrichCompanyStreaming.
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line === '') {
        currentEvent = '';
        continue;
      }
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);

          if (currentEvent === 'status' && parsed.status) {
            onStatus(parsed.status);
          } else if (currentEvent === 'complete' && parsed.success && parsed.data) {
            result = parsed.data;
          } else if (currentEvent === 'error' && parsed.error) {
            throw createApiError(parsed.error, parsed.code);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }

  if (!result) {
    throw createApiError('No result received from generation');
  }

  return result;
}
