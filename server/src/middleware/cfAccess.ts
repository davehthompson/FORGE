import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * Email of the Cloudflare Access-authenticated user, set by
       * cfAccessAuth on every request. Always defined after the middleware
       * runs — falls back to FALLBACK_EMAIL if the header is missing or
       * malformed (local dev, x-api-key callers, anything not behind CF).
       */
      userEmail?: string;
    }
  }
}

const FALLBACK_EMAIL = 'local-dev@ramp.com';

/**
 * Best-effort decode of a Cloudflare Access JWT's `email` claim.
 *
 * Cloudflare Access is the trust boundary — by the time the request reaches
 * us, signature validation has already happened upstream. We only parse the
 * middle (payload) segment, which is base64url-encoded JSON. Any malformed
 * token, missing segment, missing email claim, or non-string email value
 * returns null and the caller falls back to FALLBACK_EMAIL.
 *
 * No JWT library needed — Buffer's built-in base64url decoder handles the
 * URL-safe alphabet (RFC 7515) directly.
 */
function decodeJwtEmail(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export function cfAccessAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.get('cf-access-jwt-assertion');
  req.userEmail = (token && decodeJwtEmail(token)) || FALLBACK_EMAIL;
  next();
}
