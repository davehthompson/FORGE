import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { EditField } from './invoiceEditApi';
import type { LoadedInvoice } from './invoiceFile';

function changed(fields: EditField[]): EditField[] {
  return fields.filter((field) => field.value !== field.original || field.group === 'custom');
}

function winAnsi(value: string): string {
  return value.replace(/[^\u0020-\u00FF]/g, '?');
}

function fitSize(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, boxWidth: number, boxHeight: number): number {
  let size = Math.max(6, Math.min(16, boxHeight * 0.72));
  const maxWidth = Math.max(4, boxWidth - 2);
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.4;
  return size;
}

async function overlayPdf(pdfBytes: ArrayBuffer, fields: EditField[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const field of changed(fields)) {
    const page = pdf.getPage(field.page);
    if (!page) continue;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const width = field.w * pageWidth;
    const height = field.h * pageHeight;
    const x = field.x * pageWidth;
    const y = pageHeight - (field.y + field.h) * pageHeight;
    page.drawRectangle({
      x: x - 1,
      y: y - 1,
      width: width + 2,
      height: height + 2,
      color: rgb(1, 1, 1),
    });
    const text = winAnsi(field.value);
    if (!text) continue;
    const size = fitSize(text, font, width, height);
    page.drawText(text, {
      x: x + 1,
      y: y + Math.max(0, (height - size) / 2),
      size,
      font,
      color: rgb(0.05, 0.05, 0.05),
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
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      const size = Math.max(8, Math.min(22, h * 0.72));
      ctx.fillStyle = '#111111';
      ctx.font = `${size}px Helvetica, Arial, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(field.value, x + 2, y + h / 2, Math.max(4, w - 4));
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
