import {
  completeRouterMessage,
  extractJSON,
  ClaudeError,
} from './claude.js';

export interface InvoiceSpan {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InvoicePageInput {
  page: number;
  spans: InvoiceSpan[];
  imageBase64?: string;
  imageMediaType?: 'image/jpeg' | 'image/png';
}

export interface ExtractedField {
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
  spanIds?: string[];
}

interface Bound {
  value?: string;
  spanIds?: string[];
  box?: { page?: number; x: number; y: number; w: number; h: number };
}

interface RawExtraction {
  invoiceNumber?: Bound | string;
  invoiceDate?: Bound | string;
  dueDate?: Bound | string;
  currency?: Bound | string;
  vendorName?: Bound | string;
  billTo?: Bound | string;
  poNumber?: Bound | string;
  subtotal?: Bound | string;
  tax?: Bound | string;
  total?: Bound | string;
  lineItems?: Array<{
    description?: Bound | string;
    quantity?: Bound | string;
    uom?: Bound | string;
    unitPrice?: Bound | string;
    amount?: Bound | string;
  }>;
}

const SYSTEM = `You label fields on a prospect invoice so a person can edit the printed text for OCR testing.

You receive text spans from the PDF (id, text, and a top-left normalized box) and sometimes a page image.

Return ONLY JSON with this shape. Each field is either null or { "value": string, "spanIds": string[] }.
For a scan with no useful spans, return { "value": string, "box": { "page": number, "x": number, "y": number, "w": number, "h": number } } using 0-1 top-left normalized coordinates.

{
  "invoiceNumber": null,
  "invoiceDate": null,
  "dueDate": null,
  "currency": null,
  "vendorName": null,
  "billTo": null,
  "poNumber": null,
  "subtotal": null,
  "tax": null,
  "total": null,
  "lineItems": [
    { "description": null, "quantity": null, "uom": null, "unitPrice": null, "amount": null }
  ]
}

Rules:
- value is the text as printed, not a cleaned interpretation.
- spanIds must be ids you were given. Prefer the smallest set of spans that contain the value.
- lineItems are the printed rows only. Do not invent rows that are not on the page.
- uom is the unit of measure (EA, CS, HR, gal) when printed.
- If a field is absent, use null.
- Do not include markdown.`;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function asBound(raw: Bound | string | null | undefined): Bound | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const value = raw.trim();
    return value ? { value } : null;
  }
  const value = (raw.value ?? '').trim();
  if (!value) return null;
  return raw;
}

function unionBox(
  spans: Array<InvoiceSpan & { page: number }>,
): { page: number; x: number; y: number; w: number; h: number } | null {
  if (!spans.length) return null;
  const page = spans[0].page;
  const same = spans.filter((s) => s.page === page);
  const x1 = Math.min(...same.map((s) => s.x));
  const y1 = Math.min(...same.map((s) => s.y));
  const x2 = Math.max(...same.map((s) => s.x + s.w));
  const y2 = Math.max(...same.map((s) => s.y + s.h));
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return null;
  return { page, x: clamp01(x1), y: clamp01(y1), w: clamp01(w), h: clamp01(h) };
}

export async function extractInvoiceFields(
  pages: InvoicePageInput[],
  onStatus?: (status: string) => void,
): Promise<ExtractedField[]> {
  if (!pages.length) {
    throw new ClaudeError('API_ERROR', 'No invoice pages were provided');
  }

  const spanById = new Map<string, InvoiceSpan & { page: number }>();
  for (const page of pages) {
    for (const span of page.spans || []) {
      spanById.set(span.id, { ...span, page: page.page });
    }
  }

  onStatus?.('Identifying invoice fields...');

  const content: Array<
    | { type: 'text'; text: string }
    | {
        type: 'image';
        source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png'; data: string };
      }
  > = [];

  const spanLines: string[] = [];
  for (const page of pages) {
    spanLines.push(`# page ${page.page}`);
    for (const span of page.spans || []) {
      const text = span.text.replace(/\s+/g, ' ').slice(0, 180);
      spanLines.push(
        `${span.id}|${text}|${span.x.toFixed(3)},${span.y.toFixed(3)},${span.w.toFixed(3)},${span.h.toFixed(3)}`,
      );
    }
    if (page.imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: page.imageMediaType === 'image/png' ? 'image/png' : 'image/jpeg',
          data: page.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
      content.push({ type: 'text', text: `Image above is page ${page.page}.` });
    }
  }

  content.push({
    type: 'text',
    text: `Text spans (id|text|x,y,w,h):\n${spanLines.join('\n') || '(no text layer — use the images)'}`,
  });

  const text = await completeRouterMessage({
    system: SYSTEM,
    content,
    maxTokens: 8000,
    timeoutMs: 90_000,
  });

  const parsed = extractJSON<RawExtraction>(text);
  return fieldsFromRaw(parsed, spanById);
}

function fieldsFromRaw(
  raw: RawExtraction,
  spanById: Map<string, InvoiceSpan & { page: number }>,
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  const push = (
    key: string,
    label: string,
    group: ExtractedField['group'],
    bound: Bound | string | null | undefined,
    lineIndex?: number,
  ) => {
    const b = asBound(bound);
    if (!b?.value) return;
    let spans = (b.spanIds || [])
      .map((id) => spanById.get(id))
      .filter((s): s is InvoiceSpan & { page: number } => Boolean(s));
    if (!spans.length) {
      const hit = [...spanById.values()].find(
        (s) => s.text.trim() === b.value || s.text.includes(b.value!),
      );
      if (hit) spans = [hit];
    }
    let box = unionBox(spans);
    if (!box && b.box && Number.isFinite(b.box.x)) {
      box = {
        page: b.box.page ?? 0,
        x: clamp01(b.box.x),
        y: clamp01(b.box.y),
        w: clamp01(b.box.w),
        h: clamp01(b.box.h),
      };
    }
    if (!box || box.w < 0.002 || box.h < 0.002) return;
    fields.push({
      id: lineIndex === undefined ? key : `${key}-${lineIndex}`,
      group,
      label,
      original: b.value,
      value: b.value,
      page: box.page,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      spanIds: spans.map((span) => span.id),
      ...(lineIndex === undefined ? {} : { lineIndex }),
    });
  };

  push('invoiceNumber', 'Invoice number', 'header', raw.invoiceNumber);
  push('invoiceDate', 'Invoice date', 'header', raw.invoiceDate);
  push('dueDate', 'Due date', 'header', raw.dueDate);
  push('currency', 'Currency', 'header', raw.currency);
  push('poNumber', 'PO number', 'header', raw.poNumber);
  push('vendorName', 'Vendor name', 'party', raw.vendorName);
  push('billTo', 'Bill to', 'party', raw.billTo);
  push('subtotal', 'Subtotal', 'totals', raw.subtotal);
  push('tax', 'Tax', 'totals', raw.tax);
  push('total', 'Total', 'totals', raw.total);

  (raw.lineItems || []).forEach((item, index) => {
    const n = index + 1;
    push('description', `Line ${n} description`, 'line', item.description, index);
    push('quantity', `Line ${n} qty`, 'line', item.quantity, index);
    push('uom', `Line ${n} UOM`, 'line', item.uom, index);
    push('unitPrice', `Line ${n} unit price`, 'line', item.unitPrice, index);
    push('amount', `Line ${n} amount`, 'line', item.amount, index);
  });

  return fields;
}
