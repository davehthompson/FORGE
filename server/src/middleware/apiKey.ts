import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      serviceName?: string;
    }
  }
}

let keyMap: Map<string, string> | null = null;

function getKeyMap(): Map<string, string> | null {
  if (keyMap) return keyMap;

  const multiKeys = process.env.FORGE_API_KEYS;
  if (multiKeys) {
    keyMap = new Map();
    for (const entry of multiKeys.split(',')) {
      const sep = entry.indexOf(':');
      if (sep === -1) continue;
      const key = entry.slice(0, sep).trim();
      const name = entry.slice(sep + 1).trim();
      if (key && name) keyMap.set(key, name);
    }
    if (keyMap.size > 0) return keyMap;
  }

  const singleKey = process.env.FORGE_API_KEY;
  if (singleKey) {
    keyMap = new Map([[singleKey, 'default']]);
    return keyMap;
  }

  return null;
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const keys = getKeyMap();

  if (!keys) {
    req.serviceName = 'local-dev';
    next();
    return;
  }

  const providedKey = req.headers['x-api-key'] as string | undefined;

  if (!providedKey || !keys.has(providedKey)) {
    res.status(401).json({ success: false, error: 'Unauthorized: missing or invalid API key' });
    return;
  }

  req.serviceName = keys.get(providedKey);
  next();
}
