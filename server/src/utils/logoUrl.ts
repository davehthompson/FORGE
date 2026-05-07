/**
 * Single source of truth for building Logo.dev image URLs server-side.
 *
 * Previously this lived as a private helper inside
 * [enrichment.ts](../services/enrichment.ts), used only for the company
 * profile returned by domain lookup. Lifted here so generated assets
 * (invoices, receipts, quotes, contracts, etc.) can stamp the same URL
 * onto their vendor / provider / airline / hotel objects, removing the
 * client-side dependency on `VITE_LOGO_DEV_KEY` for those flows.
 *
 * Reads `process.env.LOGO_DEV_KEY` lazily on every call instead of
 * caching at module-load time. dotenv loading order has burned us before
 * (see [loadEnv.ts](../loadEnv.ts)) — lazy reads make the helper safe
 * to import from anywhere without forcing a particular import sequence.
 */

export function buildLogoUrl(domain: string, size: number = 128): string {
  const token = process.env.LOGO_DEV_KEY ?? '';
  // Skip building a URL when no token is configured — Logo.dev's image
  // endpoint returns 401 for any request without a token, so it's better
  // to ship an empty string and let the client render its icon fallback
  // than to ship a guaranteed-broken URL.
  if (!token) return '';
  if (!domain) return '';

  const cleanDomain = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  if (!cleanDomain) return '';

  const params = new URLSearchParams({
    token,
    size: size.toString(),
    format: 'png',
    retina: 'true',
    fallback: 'monogram',
  });

  return `https://img.logo.dev/${cleanDomain}?${params.toString()}`;
}
