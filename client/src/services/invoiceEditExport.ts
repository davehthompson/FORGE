import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import type { EditField } from './invoiceEditApi';
import type { LoadedInvoice } from './invoiceFile';
import {
  cssFontFamily,
  FALLBACK_STYLE,
  hexToRgb,
  isRightAligned,
  standardFontName,
  type TextStyle,
} from './invoiceStyle';

function changed(fields: EditField[]): EditField[] {
  return fields.filter((field) => field.value !== field.original || field.group === 'custom');
}

function winAnsi(value: string): string {
  return value.replace(/[^\u0020-\u00FF]/g, '?');
}

function fieldStyle(field: EditField): TextStyle {
  return field.style ?? FALLBACK_STYLE;
}

function fitSize(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, boxWidth: number, preferred: number): number {
  let size = Math.max(4, preferred);
  const maxWidth = Math.max(4, boxWidth - 2);
  while (size > 4 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return size;
}

async function overlayPdf(pdfBytes: ArrayBuffer, fields: EditField[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const fonts = new Map<string, PDFFont>();
  for (const field of changed(fields)) {
    const page = pdf.getPage(field.page);
    if (!page) continue;
    const style = fieldStyle(field);
    const fontKey = standardFontName(style);
    let font = fonts.get(fontKey);
    if (!font) {
      font = await pdf.embedFont(fontKey);
      fonts.set(fontKey, font);
    }
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const width = field.w * pageWidth;
    const height = field.h * pageHeight;
    const x = field.x * pageWidth;
    const y = pageHeight - (field.y + field.h) * pageHeight;
    const paper = hexToRgb(style.background);
    const ink = hexToRgb(style.color);
    page.drawRectangle({
      x: x - 1,
      y: y - 1,
      width: width + 2,
      height: height + 2,
      color: rgb(paper.r, paper.g, paper.b),
    });
    const text = winAnsi(field.value);
    if (!text) continue;
    const preferred = style.fontSize > 0 ? style.fontSize : height * 0.72;
    const size = fitSize(text, font, width, preferred);
    const textWidth = font.widthOfTextAtSize(text, size);
    const textX = isRightAligned(field.id) ? Math.max(x, x + width - textWidth - 1) : x + 1;
    page.drawText(text, {
      x: textX,
      y: y + Math.max(0, (height - size) / 2),
      size,
      font,
      color: rgb(ink.r, ink.g, ink.b),
    });
  }
  pdf.setTitle('FORGE edited invoice for OCR testing');
  pdf.setAuthor('FORGE');
  pdf.setSubject('Prospect invoice edited for OCR testing. Not a live bill.');
  return pdf.save();
}

async function rasterPdf(invoice: LoadedInvoice, fields: EditField[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const edits = changed(fields);
  for (const page of invoice.pages) {
    const img = await loadImage(page.previewUrl);
    const canvas = document.createElement('canvas');
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw the edited invoice');
    ctx.drawImage(img, 0, 0, page.width, page.height);
    for (const field of edits.filter((item) => item.page === page.page)) {
      const x = field.x * page.width;
      const y = field.y * page.height;
      const w = field.w * page.width;
      const h = field.h * page.height;
      const style = fieldStyle(field);
      ctx.fillStyle = style.background;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      let size = style.fontSize > 0 ? style.fontSize : h * 0.72;
      const family = cssFontFamily(style);
      const fontOf = (px: number) => `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${px}px ${family}`;
      ctx.font = fontOf(size);
      while (size > 6 && ctx.measureText(field.value).width > Math.max(4, w - 4)) {
        size -= 0.5;
        ctx.font = fontOf(size);
      }
      ctx.fillStyle = style.color;
      ctx.textBaseline = 'middle';
      const right = isRightAligned(field.id);
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillText(field.value, right ? x + w - 2 : x + 2, y + h / 2);
    }
    const png = canvas.toDataURL('image/png');
    const bytes = dataUrlToBytes(png);
    const embedded = await pdf.embedPng(bytes);
    const pdfPage = pdf.addPage([page.width, page.height]);
    pdfPage.drawImage(embedded, { x: 0, y: 0, width: page.width, height: page.height });
  }
  pdf.setTitle('FORGE edited invoice for OCR testing');
  pdf.setAuthor('FORGE');
  return pdf.save();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not redraw the invoice page'));
    img.src = url;
  });
}

function dataUrlToBytes(url: string): Uint8Array {
  const base64 = url.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function groundTruth(fields: EditField[]): Record<string, unknown> {
  const value = (id: string) => fields.find((field) => field.id === id)?.value ?? '';
  const lineIndexes = [...new Set(fields.filter((f) => f.lineIndex !== undefined).map((f) => f.lineIndex as number))].sort((a, b) => a - b);
  const lineItems = lineIndexes.map((index) => {
    const pick = (key: string) => fields.find((f) => f.id === `${key}-${index}`)?.value ?? '';
    return {
      description: pick('description'),
      quantity: pick('quantity'),
      uom: pick('uom'),
      unitPrice: pick('unitPrice'),
      amount: pick('amount'),
    };
  });
  return {
    invoiceNumber: value('invoiceNumber'),
    invoiceDate: value('invoiceDate'),
    dueDate: value('dueDate'),
    currency: value('currency'),
    vendorName: value('vendorName'),
    billTo: value('billTo'),
    poNumber: value('poNumber'),
    lineItems,
    subtotal: value('subtotal'),
    tax: value('tax'),
    total: value('total'),
    custom: fields
      .filter((field) => field.group === 'custom')
      .map((field) => ({ label: field.label, value: field.value })),
  };
}

export async function exportEditedInvoice(
  invoice: LoadedInvoice,
  fields: EditField[],
): Promise<{ pdf: Blob; json: Blob }> {
  const bytes = invoice.kind === 'pdf' && invoice.pdfBytes
    ? await overlayPdf(invoice.pdfBytes, fields)
    : await rasterPdf(invoice, fields);
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  const pdf = new Blob([pdfBuffer], { type: 'application/pdf' });
  const json = new Blob([JSON.stringify(groundTruth(fields), null, 2)], { type: 'application/json' });
  return { pdf, json };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
