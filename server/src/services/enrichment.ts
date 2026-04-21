import OpenAI from 'openai';
import { CompanyProfile } from '../types.js';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY is not configured. Please add your OpenAI API key to the .env file.');
  }
  return new OpenAI({ apiKey });
}

// Text formatting utilities
function toTitleCase(str: string): string {
  if (!str) return str;
  
  // Words that should stay lowercase (unless first word)
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
  
  // Capitalize the first letter and letters after sentence-ending punctuation
  return str
    .toLowerCase()
    .replace(/(^|[.!?]\s+)([a-z])/g, (match, prefix, letter) => {
      return prefix + letter.toUpperCase();
    });
}

export async function enrichCompanyFromDomain(domain: string): Promise<CompanyProfile> {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  
  const pdlKey = process.env.PDL_API_KEY;
  
  if (!pdlKey || pdlKey === 'your_pdl_api_key_here') {
    throw new Error('PDL_API_KEY is not configured. Please add your People Data Labs API key to the .env file.');
  }
  
  const url = new URL('https://api.peopledatalabs.com/v5/company/enrich');
  url.searchParams.set('website', cleanDomain);
  
  const response = await fetch(url.toString(), {
    headers: {
      'X-Api-Key': pdlKey,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Company not found for domain: ${cleanDomain}`);
    }
    if (response.status === 401) {
      throw new Error('Invalid People Data Labs API key');
    }
    if (response.status === 402) {
      throw new Error('People Data Labs API quota exceeded');
    }
    throw new Error(`People Data Labs API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as PDLCompanyResponse;
  
  // Format the raw data with proper capitalization
  const companyName = toTitleCase(data.name || cleanDomain);
  const industry = toTitleCase(data.industry || 'General Business');
  const description = capitalizeSentences(data.summary || `Company operating at ${cleanDomain}`);
  const location = formatLocation(data.location);
  
  // Use GPT-4 to infer spending categories based on company data
  const spendingCategories = await inferSpendingCategories({
    name: companyName,
    description: description,
    industry: industry,
    tags: data.tags,
  });
  
  return {
    name: companyName,
    domain: cleanDomain,
    description: description,
    employeeCount: formatEmployeeCount(data.employee_count),
    industry: industry,
    location: location,
    logo: getLogoUrl(cleanDomain),
    spendingCategories,
  };
}

// Logo.dev API utility
const LOGO_DEV_KEY = process.env.LOGO_DEV_KEY || 'pk_AxloykzTSi-S1pEaFbM7Lg';

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

  const url = `https://img.logo.dev/${cleanDomain}?${params.toString()}`;
  console.log(`[Enrichment] Logo URL for "${domain}": ${url}`);
  return url;
}

interface PDLCompanyResponse {
  name?: string;
  summary?: string;
  employee_count?: number;
  industry?: string;
  location?: {
    name?: string;
    locality?: string;
    region?: string;
    country?: string;
    street_address?: string;
    postal_code?: string;
  };
  profiles?: string[];
  website?: string;
  founded?: number;
  size?: string;
  tags?: string[];
}

async function inferSpendingCategories(company: {
  name: string;
  description: string;
  industry: string;
  tags?: string[];
}): Promise<string[]> {
  const openai = getOpenAIClient();
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `You are a financial analyst specializing in business expense analysis. Based on the company profile provided, identify the 5-7 most likely spending categories where this specific company would incur significant business expenses. 

Be specific to the company's actual business model and operations - avoid generic categories unless they truly apply. Consider their industry, size, and business description.

Return ONLY a valid JSON array of strings, no explanation. Example: ["Category 1", "Category 2", "Category 3"]`,
      },
      {
        role: 'user',
        content: `Company: ${company.name}
Industry: ${company.industry}
Description: ${company.description}
Business Tags: ${company.tags?.join(', ') || 'N/A'}

What are the most likely expense categories for this specific company?`,
      },
    ],
    temperature: 0.5,
    max_tokens: 300,
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    return getDefaultCategories();
  }
  
  try {
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return getDefaultCategories();
    }
    
    const categories = JSON.parse(jsonMatch[0]) as string[];
    
    // Validate we got an array of strings
    if (Array.isArray(categories) && categories.every(c => typeof c === 'string')) {
      return categories;
    }
    
    return getDefaultCategories();
  } catch {
    return getDefaultCategories();
  }
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

function formatEmployeeCount(count: number | undefined): string {
  if (!count) return 'Unknown';
  // Return the actual number with comma formatting
  return count.toLocaleString();
}

function formatLocation(location: PDLCompanyResponse['location']): string {
  if (!location) return 'Unknown';
  
  // Build full address if street address is available
  if (location.street_address) {
    const addressParts = [
      toTitleCase(location.street_address),
      location.locality ? toTitleCase(location.locality) : null,
      location.region ? location.region.toUpperCase() : null, // State abbreviations stay uppercase
      location.postal_code,
      location.country ? toTitleCase(location.country) : null,
    ].filter(Boolean);
    
    // Format as: Street, City, STATE ZIP, Country
    if (addressParts.length >= 3) {
      const street = addressParts[0];
      const city = addressParts[1];
      const state = addressParts[2];
      const zip = location.postal_code || '';
      const country = location.country ? toTitleCase(location.country) : '';
      
      return `${street}, ${city}, ${state} ${zip}`.trim() + (country ? `, ${country}` : '');
    }
    
    return addressParts.join(', ');
  }
  
  // Fall back to city, state, country if no street address
  if (location.name) {
    return toTitleCase(location.name);
  }
  
  const parts = [location.locality, location.region, location.country]
    .filter(Boolean)
    .map(part => toTitleCase(part as string));
  
  return parts.join(', ') || 'Unknown';
}
