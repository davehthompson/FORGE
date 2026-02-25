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
  currency: string = 'USD'
): Promise<AssetData> {
  const response = await fetch('/api/generate/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, company, spendingCategory, relatedAssets, currency }),
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
  currency: string = 'USD'
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
        const splits = generateInvoiceSplits(invoiceCount, totalAmount);
        let previousInvoicedAmount = 0;
        
        for (let i = 0; i < invoiceCount; i++) {
          const split = splits[i];
          const isLast = i === invoiceCount - 1;
          const invoiceNumber = i + 1;

          // For the final invoice, use the exact remainder to absorb any drift from prior invoices
          const targetSubtotal = isLast
            ? Math.round((totalAmount - previousInvoicedAmount) * 100) / 100
            : split.subtotal;
          
          onStatus('invoice', `Generating invoice ${i + 1} of ${invoiceCount} (${split.percentage}%)...`, i);
          
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
              invoiceConfig: {
                invoiceNumber,
                totalInvoices: invoiceCount,
                totalAmount,
                targetSubtotal,
                splitPercentage: split.percentage,
                isLast,
                previousInvoicedAmount,
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
      currency
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
  currency: string = 'USD'
): Promise<Blob> {
  const response = await api.post(
    '/export/pdf',
    { type, data, currency },
    { responseType: 'blob' }
  );
  
  return response.data;
}

// Export as JPG
export async function exportJpg(
  type: AssetType,
  data: AssetData,
  currency: string = 'USD'
): Promise<Blob> {
  const response = await api.post(
    '/export/jpg',
    { type, data, currency },
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
