import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { flagsFromFamily, sampleCanvas, type TextStyle } from './invoiceStyle';

GlobalWorkerOptions.workerSrc = workerSrc;

export interface TextSpan {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: TextStyle;
}

export interface LoadedPage {
  page: number;
  previewUrl: string;
  /** Pixel size of previewUrl. */
  width: number;
  height: number;
  /** PDF page height in points, or preview height in pixels for a scan. */
  drawHeight: number;
  spans: TextSpan[];
  /** JPEG base64 (no data-url prefix) sent only when the text layer is thin. */
  imageBase64?: string;
}

export interface LoadedInvoice {
  kind: 'pdf' | 'image';
  pdfBytes?: ArrayBuffer;
  pages: LoadedPage[];
}

const MAX_PAGES = 6;
const THIN_TEXT = 12;

function canvasToJpegBase64(source: HTMLCanvasElement, maxWidth: number): string {
  const scale = Math.min(1, maxWidth / source.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.65);
  return url.split(',')[1] || '';
}

async function pageFromPdf(pdf: PDFDocumentProxy, pageNumber: number): Promise<LoadedPage> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 1100 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read the invoice page');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const text = await page.getTextContent();
  const sample = sampleCanvas(ctx);
  const spans: TextSpan[] = [];
  let spanIndex = 0;
  for (const item of text.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const tx = item.transform;
    const height = item.height || Math.hypot(tx[2], tx[3]) || 8;
    const rect = viewport.convertToViewportRectangle([
      tx[4],
      tx[5],
      tx[4] + item.width,
      tx[5] + height,
    ]);
    const x1 = Math.min(rect[0], rect[2]);
    const y1 = Math.min(rect[1], rect[3]);
    const x2 = Math.max(rect[0], rect[2]);
    const y2 = Math.max(rect[1], rect[3]);
    const w = (x2 - x1) / viewport.width;
    const h = (y2 - y1) / viewport.height;
    if (w < 0.002 || h < 0.003) continue;
    const fontFamily = text.styles?.[item.fontName]?.fontFamily || 'Helvetica';
    const flags = flagsFromFamily(fontFamily);
    const ink = sample(x1, y1, x2 - x1, y2 - y1);
    spans.push({
      id: `p${pageNumber - 1}-s${spanIndex++}`,
      text: item.str,
      x: x1 / viewport.width,
      y: y1 / viewport.height,
      w,
      h,
      style: {
        fontFamily,
        fontSize: Math.hypot(tx[2] || 0, tx[3] || 0) || height,
        bold: flags.bold,
        italic: flags.italic,
        color: ink.color,
        background: ink.background,
      },
    });
    if (spans.length >= 400) break;
  }

  const thin = spans.length < THIN_TEXT;
  return {
    page: pageNumber - 1,
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    width: canvas.width,
    height: canvas.height,
    drawHeight: base.height,
    spans,
    imageBase64: thin ? canvasToJpegBase64(canvas, 1000) : undefined,
  };
}

async function pageFromImage(file: File): Promise<LoadedPage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image'));
      el.src = url;
    });
    const maxW = 1400;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read that image');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      page: 0,
      previewUrl: canvas.toDataURL('image/jpeg', 0.85),
      width: canvas.width,
      height: canvas.height,
      drawHeight: canvas.height,
      spans: [],
      imageBase64: canvasToJpegBase64(canvas, 1000),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readInvoiceFile(file: File): Promise<LoadedInvoice> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const pdfBytes = await file.arrayBuffer();
    const pdf = await getDocument({ data: pdfBytes.slice(0) }).promise;
    const count = Math.min(pdf.numPages, MAX_PAGES);
    const pages: LoadedPage[] = [];
    for (let i = 1; i <= count; i++) {
      pages.push(await pageFromPdf(pdf, i));
    }
    return { kind: 'pdf', pdfBytes, pages };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Upload a PDF, PNG, or JPG invoice');
  }
  return { kind: 'image', pages: [await pageFromImage(file)] };
}
