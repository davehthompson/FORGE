// Logo.dev API utility
// Publishable token (pk_*) — safe to ship in the client bundle.
// Injected at build time via Vite from VITE_LOGO_DEV_KEY (set in CI / .env.local).
const LOGO_DEV_KEY = import.meta.env.VITE_LOGO_DEV_KEY ?? '';

interface LogoOptions {
  size?: number;
  format?: 'jpg' | 'png' | 'webp';
  greyscale?: boolean;
  theme?: 'auto' | 'light' | 'dark';
  retina?: boolean;
  fallback?: 'monogram' | '404';
}

/**
 * Generate a logo.dev URL for a given domain
 */
export function getLogoUrl(domain: string, options: LogoOptions = {}): string {
  const {
    size = 128,
    format = 'png',
    greyscale = false,
    theme = 'auto',
    retina = true,
    fallback = 'monogram',
  } = options;

  // Clean the domain (remove protocol and www)
  const cleanDomain = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  const params = new URLSearchParams({
    token: LOGO_DEV_KEY,
    size: size.toString(),
    format,
    fallback,
  });

  if (greyscale) {
    params.set('greyscale', 'true');
  }

  if (theme !== 'auto') {
    params.set('theme', theme);
  }

  if (retina) {
    params.set('retina', 'true');
  }

  return `https://img.logo.dev/${cleanDomain}?${params.toString()}`;
}

/**
 * Get a small logo for inline display (e.g., in lists)
 */
export function getSmallLogo(domain: string): string {
  return getLogoUrl(domain, { size: 32, format: 'png' });
}

/**
 * Get a medium logo for cards and headers
 */
export function getMediumLogo(domain: string): string {
  return getLogoUrl(domain, { size: 64, format: 'png' });
}

/**
 * Get a large logo for detailed views
 */
export function getLargeLogo(domain: string): string {
  return getLogoUrl(domain, { size: 128, format: 'png' });
}
