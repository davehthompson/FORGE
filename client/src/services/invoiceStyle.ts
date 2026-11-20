import { StandardFonts } from 'pdf-lib';

/** Style copied from the printed invoice. fontSize is PDF points, or preview pixels for a scan. */
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  background: string;
}

export interface StyledSpan {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style: TextStyle;
}

export interface StylePage {
  page: number;
  previewUrl: string;
  /** PDF page height in points, or the preview height in pixels for a scan. */
  drawHeight: number;
  width: number;
  height: number;
  spans: StyledSpan[];
}

export const FALLBACK_STYLE: TextStyle = {
  fontFamily: 'Helvetica',
  fontSize: 10,
  bold: false,
  italic: false,
  color: '#111111',
  background: '#ffffff',
};

export function flagsFromFamily(family: string): { bold: boolean; italic: boolean } {
  return {
    bold: /bold|black|semibold|demi|heavy/i.test(family),
    italic: /italic|oblique|slant/i.test(family),
  };
}

export function mapFace(family: string): 'Helvetica' | 'Times' | 'Courier' {
  const name = family.toLowerCase();
  if (/times|roman|georgia|garamond|cambria|minion|palatino|liberation serif|nimbusrom/.test(name)) return 'Times';
  if (/courier|consolas|menlo|mono|ocr|liberation mono|nimbusmon/.test(name)) return 'Courier';
  return 'Helvetica';
}

export function standardFontName(style: TextStyle): StandardFonts {
  const face = mapFace(style.fontFamily);
  if (face === 'Times') {
    if (style.bold && style.italic) return StandardFonts.TimesRomanBoldItalic;
    if (style.bold) return StandardFonts.TimesRomanBold;
    if (style.italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (face === 'Courier') {
    if (style.bold && style.italic) return StandardFonts.CourierBoldOblique;
    if (style.bold) return StandardFonts.CourierBold;
    if (style.italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (style.bold && style.italic) return StandardFonts.HelveticaBoldOblique;
  if (style.bold) return StandardFonts.HelveticaBold;
  if (style.italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/** CSS stack for the same face the PDF export embeds. */
export function cssFontFamily(style: TextStyle): string {
  const face = mapFace(style.fontFamily);
  if (face === 'Times') return 'Times, "Times New Roman", serif';
  if (face === 'Courier') return '"Courier New", Courier, monospace';
  return 'Helvetica, Arial, sans-serif';
}

export function isRightAligned(id: string): boolean {
  return /^(quantity|unitPrice|amount|subtotal|tax|total)(-\d+)?$/.test(id);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 0.07, g: 0.07, b: 0.07 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

interface Sample {
  color: string;
  background: string;
}

function toHex(r: number, g: number, b: number): string {
  const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Ink is the smaller luminance cluster; paper is the larger one. Dark text on light paper is the usual result. */
export function sampleRegion(
  data: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
): Sample {
  const fallback: Sample = { color: '#111111', background: '#ffffff' };
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(data.width, Math.ceil(x + Math.max(1, w)));
  const y1 = Math.min(data.height, Math.ceil(y + Math.max(1, h)));
  if (x1 <= x0 || y1 <= y0) return fallback;

  const pixels: Array<{ r: number; g: number; b: number; l: number }> = [];
  const sw = x1 - x0;
  const sh = y1 - y0;
  const step = Math.max(1, Math.floor(Math.sqrt((sw * sh) / 250)));
  for (let py = y0; py < y1; py += step) {
    for (let px = x0; px < x1; px += step) {
      const i = (py * data.width + px) * 4;
      const r = data.data[i];
      const g = data.data[i + 1];
      const b = data.data[i + 2];
      pixels.push({ r, g, b, l: 0.2126 * r + 0.7152 * g + 0.0722 * b });
    }
  }
  if (!pixels.length) return fallback;
  pixels.sort((a, b) => a.l - b.l);
  const minL = pixels[0].l;
  const maxL = pixels[pixels.length - 1].l;
  const average = (group: typeof pixels) => {
    const n = group.length || 1;
    const sum = group.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
    return toHex(sum.r / n, sum.g / n, sum.b / n);
  };
  if (maxL - minL < 28) {
    const paper = pixels.slice(Math.floor(pixels.length * 0.7));
    return { color: '#111111', background: average(paper.length ? paper : pixels) };
  }
  const mid = (minL + maxL) / 2;
  const dark = pixels.filter((p) => p.l <= mid);
  const light = pixels.filter((p) => p.l > mid);
  if (!dark.length || !light.length) return fallback;
  const inkIsDark = dark.length <= light.length;
  return {
    color: average(inkIsDark ? dark : light),
    background: average(inkIsDark ? light : dark),
  };
}

export function sampleCanvas(ctx: CanvasRenderingContext2D): (x: number, y: number, w: number, h: number) => Sample {
  const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  return (x, y, w, h) => sampleRegion(data, x, y, w, h);
}

function styleFromIds(spans: StyledSpan[], ids: string[]): TextStyle | null {
  const matched = ids
    .map((id) => spans.find((span) => span.id === id))
    .filter((span): span is StyledSpan => Boolean(span));
  if (!matched.length) return null;
  return matched.reduce((best, span) => (span.text.length > best.text.length ? span : best)).style;
}

function nearestSpan(spans: StyledSpan[], box: { x: number; y: number; w: number; h: number }): StyledSpan | null {
  let best: StyledSpan | null = null;
  let bestD = Infinity;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  for (const span of spans) {
    const d = Math.hypot(span.x + span.w / 2 - cx, span.y + span.h / 2 - cy);
    if (d < bestD) {
      bestD = d;
      best = span;
    }
  }
  if (best && bestD <= 0.35) return best;
  return null;
}

function modalStyle(spans: StyledSpan[]): TextStyle | null {
  if (!spans.length) return null;
  const groups = new Map<string, StyledSpan[]>();
  for (const span of spans) {
    const key = `${mapFace(span.style.fontFamily)}|${span.style.bold}|${span.style.italic}`;
    const list = groups.get(key) ?? [];
    list.push(span);
    groups.set(key, list);
  }
  let best: StyledSpan[] = [];
  for (const list of groups.values()) {
    if (list.length > best.length) best = list;
  }
  const sizes = best.map((span) => span.style.fontSize).sort((a, b) => a - b);
  const mid = best[Math.floor(best.length / 2)];
  return { ...mid.style, fontSize: sizes[Math.floor(sizes.length / 2)] ?? mid.style.fontSize };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not sample the invoice'));
    img.src = url;
  });
}

async function previewContext(url: string): Promise<CanvasRenderingContext2D | null> {
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return ctx;
  } catch {
    return null;
  }
}

async function sampleBox(
  page: StylePage,
  box: { x: number; y: number; w: number; h: number },
  sampler: (page: StylePage) => Promise<CanvasRenderingContext2D | null>,
): Promise<Sample | null> {
  const ctx = await sampler(page);
  if (!ctx) return null;
  return sampleRegion(
    ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height),
    box.x * ctx.canvas.width,
    box.y * ctx.canvas.height,
    box.w * ctx.canvas.width,
    box.h * ctx.canvas.height,
  );
}

export async function styleForField(
  page: StylePage,
  field: { x: number; y: number; w: number; h: number; spanIds?: string[] },
  sampler?: (page: StylePage) => Promise<CanvasRenderingContext2D | null>,
): Promise<TextStyle> {
  const fromSource = styleFromIds(page.spans, field.spanIds ?? []);
  if (fromSource) return fromSource;
  const near = nearestSpan(page.spans, field);
  if (near) return near.style;
  const common = modalStyle(page.spans);
  if (common) return common;

  const fontSize = Math.max(8, field.h * page.drawHeight * 0.72);
  const sampled = await sampleBox(page, field, sampler ?? ((p) => previewContext(p.previewUrl)));
  return {
    fontFamily: 'Helvetica',
    fontSize,
    bold: false,
    italic: false,
    color: sampled?.color ?? FALLBACK_STYLE.color,
    background: sampled?.background ?? FALLBACK_STYLE.background,
  };
}

export async function applyFieldStyles<T extends { page: number; x: number; y: number; w: number; h: number; spanIds?: string[] }>(
  pages: StylePage[],
  fields: T[],
): Promise<Array<T & { style: TextStyle }>> {
  const byPage = new Map(pages.map((page) => [page.page, page]));
  const contexts = new Map<number, Promise<CanvasRenderingContext2D | null>>();
  const sampler = (page: StylePage) => {
    let pending = contexts.get(page.page);
    if (!pending) {
      pending = previewContext(page.previewUrl);
      contexts.set(page.page, pending);
    }
    return pending;
  };
  const styled: Array<T & { style: TextStyle }> = [];
  for (const field of fields) {
    const page = byPage.get(field.page) ?? pages[0];
    const style = page ? await styleForField(page, field, sampler) : { ...FALLBACK_STYLE };
    styled.push({ ...field, style });
  }
  return styled;
}
