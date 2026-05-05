import { CompanyProfile } from '../types.js';
import { enrichCompanyProfile, ClaudeError } from './claude.js';

// ---------------------------------------------------------------------------
// Domain enrichment via Claude + web_search.
// Replaces the previous People Data Labs lookup + standalone OpenAI categories
// call. A single Claude call (with the hosted web_search tool) returns the
// company profile and likely B2B spending categories in one round trip.
// ---------------------------------------------------------------------------

const LOGO_DEV_KEY = process.env.LOGO_DEV_KEY ?? '';

export async function enrichCompanyFromDomain(domain: string): Promise<CompanyProfile> {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();

  let enriched;
  try {
    enriched = await enrichCompanyProfile(cleanDomain);
  } catch (err) {
    // Re-throw ClaudeError as-is so route layer can map error codes to UX.
    if (err instanceof ClaudeError) throw err;
    throw err;
  }

  return {
    name: toTitleCase(enriched.name) || cleanDomain,
    domain: cleanDomain,
    description: capitalizeSentences(enriched.description) || `Company operating at ${cleanDomain}`,
    employeeCount: enriched.employeeCount || 'Unknown',
    industry: toTitleCase(enriched.industry) || 'General Business',
    location: enriched.location || 'Unknown',
    logo: getLogoUrl(cleanDomain),
    spendingCategories: Array.isArray(enriched.spendingCategories) && enriched.spendingCategories.length > 0
      ? enriched.spendingCategories
      : getDefaultCategories(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTitleCase(str: string): string {
  if (!str) return str;
  const lowercaseWords = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index === 0 || !lowercaseWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

function capitalizeSentences(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
}

function getLogoUrl(domain: string, size: number = 128): string {
  const cleanDomain = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  const params = new URLSearchParams({
    token: LOGO_DEV_KEY,
    size: size.toString(),
    format: 'png',
    retina: 'true',
    fallback: 'monogram',
  });

  return `https://img.logo.dev/${cleanDomain}?${params.toString()}`;
}

function getDefaultCategories(): string[] {
  return [
    'Office supplies',
    'Software subscriptions',
    'Professional services',
    'Travel & entertainment',
    'Marketing & advertising',
  ];
}
