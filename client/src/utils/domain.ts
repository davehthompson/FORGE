/**
 * Domain helpers shared across templates and previews.
 *
 * AI-generated assets often have a complete `vendor.email` (e.g.
 * `ar.lithium@albemarle.com`) but a missing or placeholder `vendor.domain`.
 * Falling back to the email's host gives us a reliable signal for logo
 * lookups, color extraction, and anything else keyed off the company.
 */

/** Strip protocol/www and any path so we have a bare host like `albemarle.com`. */
export function normalizeDomain(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0];
  return cleaned || undefined;
}

/** Extract the host part of an email address. Returns undefined if it doesn't parse. */
export function domainFromEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf('@');
  if (at < 0 || at === email.length - 1) return undefined;
  return normalizeDomain(email.slice(at + 1));
}

/**
 * Resolve a usable domain for a company entity. Tries the explicit `domain`
 * field first, then derives one from `email` (the most common backup).
 */
export function resolveCompanyDomain(input: {
  domain?: string | null;
  email?: string | null;
}): string | undefined {
  return normalizeDomain(input.domain) ?? domainFromEmail(input.email);
}
