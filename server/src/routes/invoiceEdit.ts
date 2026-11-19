import { Router, Request, Response } from 'express';
import { formatErrorResponse } from '../services/claude.js';
import { extractInvoiceFields, InvoicePageInput } from '../services/invoiceEdit.js';
import { openSSE } from '../utils/sse.js';

export const invoiceEditRouter = Router();

interface ExtractRequest {
  pages: InvoicePageInput[];
}

const MAX_PAGES = 6;
const MAX_SPANS = 400;

invoiceEditRouter.post('/extract', async (req: Request<{}, {}, ExtractRequest>, res: Response) => {
  const pages = Array.isArray(req.body?.pages) ? req.body.pages : [];
  if (!pages.length) {
    return res.status(400).json({ success: false, error: 'At least one page is required', code: 'API_ERROR' });
  }
  if (pages.length > MAX_PAGES) {
    return res.status(400).json({
      success: false,
      error: `Upload a single invoice of at most ${MAX_PAGES} pages`,
      code: 'API_ERROR',
    });
  }

  const trimmed: InvoicePageInput[] = pages.slice(0, MAX_PAGES).map((page, index) => ({
    page: Number.isFinite(page.page) ? page.page : index,
    spans: (page.spans || []).slice(0, MAX_SPANS).map((span) => ({
      id: String(span.id || ''),
      text: String(span.text || '').slice(0, 200),
      x: Number(span.x) || 0,
      y: Number(span.y) || 0,
      w: Number(span.w) || 0,
      h: Number(span.h) || 0,
    })).filter((span) => span.id && span.text.trim()),
    imageBase64: typeof page.imageBase64 === 'string' ? page.imageBase64 : undefined,
    imageMediaType: page.imageMediaType === 'image/png' ? 'image/png' : 'image/jpeg',
  }));

  const stream = openSSE(res);
  const tag = `[invoice-edit ${stream.id}]`;
  console.log(
    `${tag} start pages=${trimmed.length} spans=${trimmed.reduce((n, p) => n + p.spans.length, 0)} images=${trimmed.filter((p) => p.imageBase64).length}`,
  );

  try {
    stream.send('status', { status: 'Reading the invoice...' });
    const fields = await extractInvoiceFields(trimmed, (status) => {
      stream.send('status', { status });
    });
    console.log(`${tag} complete fields=${fields.length}`);
    stream.send('complete', { success: true, fields });
    stream.close();
  } catch (error) {
    const { body } = formatErrorResponse(error);
    console.error(`${tag} failed code=${body.code} error=${JSON.stringify(body.error)}`);
    stream.send('error', { error: body.error, code: body.code });
    stream.close();
  }
});
