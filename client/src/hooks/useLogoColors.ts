import { useState, useEffect } from 'react';
import ColorThief from 'colorthief';

export interface LogoColors {
  primary: string;
  primaryRgb: [number, number, number];
  isDark: boolean;
}

const colorThief = new ColorThief();

// Cache for extracted colors to avoid re-processing
const colorCache = new Map<string, LogoColors>();

/**
 * Calculate relative luminance to determine if color is dark or light
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Convert RGB to hex color string
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract dominant color from an image URL
 */
async function extractDominantColor(imageUrl: string): Promise<LogoColors | null> {
  // Check cache first
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      try {
        const rgb = colorThief.getColor(img) as [number, number, number];
        const [r, g, b] = rgb;
        const luminance = getLuminance(r, g, b);
        
        const colors: LogoColors = {
          primary: rgbToHex(r, g, b),
          primaryRgb: rgb,
          isDark: luminance < 0.5,
        };
        
        // Cache the result
        colorCache.set(imageUrl, colors);
        resolve(colors);
      } catch (error) {
        console.warn('Failed to extract color from logo:', error);
        resolve(null);
      }
    };
    
    img.onerror = () => {
      console.warn('Failed to load logo image for color extraction');
      resolve(null);
    };
    
    img.src = imageUrl;
  });
}

/**
 * Hook to extract dominant colors from a logo URL
 */
export function useLogoColors(logoUrl: string | undefined | null): LogoColors | null {
  const [colors, setColors] = useState<LogoColors | null>(null);

  useEffect(() => {
    if (!logoUrl) {
      setColors(null);
      return;
    }

    // Check cache synchronously
    if (colorCache.has(logoUrl)) {
      setColors(colorCache.get(logoUrl)!);
      return;
    }

    // Extract colors asynchronously
    extractDominantColor(logoUrl).then(setColors);
  }, [logoUrl]);

  return colors;
}

/**
 * Get a cached logo color for a given URL (synchronous, returns null if not cached)
 */
export function getCachedLogoColor(logoUrl: string): LogoColors | null {
  return colorCache.get(logoUrl) || null;
}

/**
 * Get a lighter version of the color for backgrounds
 */
export function getLighterColor(rgb: [number, number, number], amount: number = 0.9): string {
  const [r, g, b] = rgb;
  const lighten = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex(lighten(r), lighten(g), lighten(b));
}

/**
 * Get color with specific opacity
 */
export function getColorWithOpacity(rgb: [number, number, number], opacity: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}
