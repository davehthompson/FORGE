/**
 * Client-side capture pipeline.
 *
 * Replaces the old server-side Puppeteer + chromium-min PDF/JPG renderer.
 * The same React templates that power the editor preview are rendered
 * off-screen at full size, screenshot via html-to-image at 2x DPI, and
 * either embedded into a single-page PDF (via pdf-lib) or written out as
 * a JPEG blob with EXIF metadata (via piexifjs) — matching the metadata
 * block the server used to produce.
 */

import { toPng, toJpeg } from 'html-to-image';
import { PDFDocument } from 'pdf-lib';
import piexif from 'piexifjs';

// ---------------------------------------------------------------------------
// Metadata constants — port of server/src/services/pdf.ts AI_METADATA so the
// final files keep the same provenance markers callers were used to seeing.
// ---------------------------------------------------------------------------

const AI_METADATA = {
  author: 'FORGE - AI Generated Demo Asset',
  creator: 'FORGE (File Output for Ramp Generated Examples)',
  producer: 'FORGE by Ramp - AI Generated Content',
  keywords: ['AI Generated', 'Demo Asset', 'FORGE', 'Synthetic Data', 'Not Real'],
  subject: 'AI-generated demo document for testing purposes. This is not a real document.',
};

const PIXEL_RATIO = 2;
const A4_WIDTH_PT = 595.28;

// ---------------------------------------------------------------------------
// Asset readiness — fonts + images must be settled before capture or the PNG
// will show fallback fonts and/or empty <img> placeholders.
// ---------------------------------------------------------------------------

/**
 * Wait for fonts to load and every <img> inside `node` to either decode or
 * give up. Logo fetches in particular need a beat to finish before we
 * rasterize, otherwise the captured image renders without the brand mark.
 */
export async function waitForReady(node: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // Font loading errors are non-fatal — capture with whatever's available.
    }
  }

  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          if (img.complete) return resolve(); // already failed; nothing to wait on
          const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
          };
          img.addEventListener('load', done);
          img.addEventListener('error', done);
          // Hard cap so a stuck image can't block the export forever.
          setTimeout(done, 4000);
        }),
    ),
  );

  // One animation frame to let any layout caused by late image loads settle.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface PdfMetadata {
  /** Document identifier (invoice number, receipt number, …) used in title. */
  docId: string;
  /** Human-readable asset type ("Invoice", "Hotel Folio", …). */
  typeName: string;
}

/**
 * Capture `node` as a high-DPI PNG and embed it into a single-page PDF whose
 * width matches A4 and height is derived from the captured image's aspect
 * ratio (so the entire template is visible without manual paging). All AI
 * provenance metadata is stamped onto the document.
 */
export async function exportToPdf(node: HTMLElement, meta: PdfMetadata): Promise<Blob> {
  await waitForReady(node);

  const pngDataUrl = await toPng(node, {
    pixelRatio: PIXEL_RATIO,
    cacheBust: true,
    backgroundColor: '#ffffff',
  });

  const pngBytes = dataUrlToUint8Array(pngDataUrl);

  const pdfDoc = await PDFDocument.create();
  const png = await pdfDoc.embedPng(pngBytes);

  // Fit the captured image to A4 width; let height follow naturally so we
  // avoid clipping or stretching templates that grow vertically (contracts,
  // long line-item lists). The result is a single-page, variable-height PDF
  // that mirrors what the user sees on screen.
  const scale = A4_WIDTH_PT / png.width;
  const pageWidth = A4_WIDTH_PT;
  const pageHeight = png.height * scale;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  pdfDoc.setTitle(`${meta.typeName} - ${meta.docId} (AI Generated Demo)`);
  pdfDoc.setAuthor(AI_METADATA.author);
  pdfDoc.setSubject(AI_METADATA.subject);
  pdfDoc.setKeywords(AI_METADATA.keywords);
  pdfDoc.setCreator(AI_METADATA.creator);
  pdfDoc.setProducer(AI_METADATA.producer);
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  const pdfBytes = await pdfDoc.save();
  // pdf-lib returns Uint8Array<ArrayBufferLike>; copy into a fresh ArrayBuffer-backed
  // view so the Blob constructor's BlobPart type narrows correctly under strict TS.
  return new Blob([toArrayBuffer(pdfBytes)], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// JPG
// ---------------------------------------------------------------------------

export interface JpegMetadata {
  docId: string;
  typeName: string;
}

/**
 * Capture `node` as a high-DPI JPEG and stamp EXIF tags identifying it as an
 * AI-generated demo asset (Copyright / ImageDescription / Software / Artist /
 * Make / Model). Mirrors the sharp `withExifMerge` block the server used.
 */
export async function exportToJpeg(node: HTMLElement, meta: JpegMetadata): Promise<Blob> {
  await waitForReady(node);

  const jpegDataUrl = await toJpeg(node, {
    pixelRatio: PIXEL_RATIO,
    cacheBust: true,
    quality: 0.95,
    backgroundColor: '#ffffff',
  });

  const description = `${meta.typeName} ${meta.docId} - AI Generated Demo Asset. This is synthetic data created by FORGE for testing purposes. NOT A REAL DOCUMENT.`;

  let finalDataUrl = jpegDataUrl;
  try {
    const zeroth: Record<number, string> = {
      [piexif.ImageIFD.Copyright]: 'AI Generated Demo Asset - FORGE by Ramp - Not a real document',
      [piexif.ImageIFD.ImageDescription]: description,
      [piexif.ImageIFD.Artist]: AI_METADATA.author,
      [piexif.ImageIFD.Software]: AI_METADATA.creator,
      [piexif.ImageIFD.Make]: 'FORGE',
      [piexif.ImageIFD.Model]: 'AI Generated',
    };
    const exifBytes = piexif.dump({ '0th': zeroth });
    finalDataUrl = piexif.insert(exifBytes, jpegDataUrl);
  } catch (err) {
    // EXIF insertion is best-effort. The visible image is identical with or
    // without it; surface a console warning rather than failing the export.
    console.warn('[capture] EXIF insertion failed; exporting without metadata', err);
  }

  const bytes = dataUrlToUint8Array(finalDataUrl);
  return new Blob([toArrayBuffer(bytes)], { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// Download helper (moved from services/api.ts to keep capture self-contained).
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Invalid data URL — no comma separator');
  }
  const base64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}
