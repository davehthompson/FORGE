import axios from 'axios';
import type { CompanyProfile, AssetType, AssetData, RelatedAssetContext, QuoteData, ContractData, InvoiceData } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Company enrichment
export async function enrichCompany(domain: string): Promise<CompanyProfile> {
  const response = await api.post<{ success: boolean; data: CompanyProfile; error?: string }>(
    '/enrich',
    { domain }
  );
  
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to enrich company data');
  }
  
  return response.data.data;
}

// Asset generation (non-streaming)
export async function generateAsset(
  type: AssetType,
  company: CompanyProfile,
  spendingCategory: string,
  currency: string = 'USD'
): Promise<AssetData> {
  const response = await api.post<{ success: boolean; data: AssetData; error?: string }>(
    '/generate',
    { type, company, spendingCategory, currency }
  );
  
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to generate asset');
  }
  
  return response.data.data;
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
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to generate asset');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: AssetData | null = null;

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    let currentEvent = '';
    for (const line of lines) {
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
            throw new Error(parsed.error);
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
    throw new Error('No result received from streaming generation');
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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate invoice');
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let buffer = '';
          let invoiceData: InvoiceData | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            let currentEvent = '';
            for (const line of lines) {
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
                    throw new Error(parsed.error);
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }

          if (!invoiceData) throw new Error('No invoice data received');
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

// Export as PDF
export async function exportPdf(
  type: AssetType,
  data: AssetData,
  currency: string = 'USD',
  primaryColor?: string
): Promise<Blob> {
  const response = await api.post(
    '/export/pdf',
    { type, data, currency, primaryColor },
    { responseType: 'blob' }
  );
  
  return response.data;
}

// Export as JPG
export async function exportJpg(
  type: AssetType,
  data: AssetData,
  currency: string = 'USD',
  primaryColor?: string
): Promise<Blob> {
  const response = await api.post(
    '/export/jpg',
    { type, data, currency, primaryColor },
    { responseType: 'blob' }
  );
  
  return response.data;
}

// Download helper
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to generate receipt image');
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
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to generate receipt');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: AssetData | null = null;

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    let currentEvent = '';
    for (const line of lines) {
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
            throw new Error(parsed.error);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }

  if (!result) {
    throw new Error('No result received from generation');
  }

  return result;
}
