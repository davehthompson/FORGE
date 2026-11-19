import type { LoadedPage } from './invoiceFile';
import { createApiError } from './api';

export interface EditField {
  id: string;
  group: 'header' | 'party' | 'line' | 'totals' | 'custom';
  label: string;
  original: string;
  value: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lineIndex?: number;
}

export async function extractInvoiceFields(
  pages: LoadedPage[],
  onStatus: (status: string) => void,
): Promise<EditField[]> {
  const response = await fetch('/api/invoice-edit/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pages: pages.map((page) => ({
        page: page.page,
        spans: page.spans,
        imageBase64: page.imageBase64,
        imageMediaType: 'image/jpeg' as const,
      })),
    }),
  });

  if (!response.ok) {
    let message = `Could not read the invoice (HTTP ${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw createApiError(message);
  }

  const reader = response.body?.getReader();
  if (!reader) throw createApiError('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let fields: EditField[] | null = null;

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
        try {
          const parsed = JSON.parse(line.slice(6));
          if (currentEvent === 'status' && parsed.status) onStatus(parsed.status);
          else if (currentEvent === 'complete' && parsed.fields) fields = parsed.fields as EditField[];
          else if (currentEvent === 'error' && parsed.error) {
            throw createApiError(parsed.error, parsed.code);
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
  }

  if (!fields) throw createApiError('No fields were returned for this invoice');
  return fields;
}
