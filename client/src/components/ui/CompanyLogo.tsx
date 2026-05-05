import { useState, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';

interface CompanyLogoProps {
  /** Logo URL (Logo.dev). When omitted or it 404s, the icon fallback shows. */
  src?: string;
  /** Company name — used for alt text. */
  name?: string;
  /** Pixel size of the rendered square. Defaults to 64. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Called with the URL that loaded successfully. Useful for feeding the same
   * URL to color extraction so the accent colors match the displayed image.
   */
  onLoaded?: (url: string) => void;
}

/**
 * Renders a company logo from Logo.dev. If the URL fails to load (token
 * missing/invalid or the request is blocked), falls back to a generic
 * `Building2` icon. Logo.dev's `fallback=monogram` parameter (set in
 * `getLogoUrl`) handles unknown domains by returning a colored letter
 * monogram, so a missing brand still yields a usable image when the token
 * is valid.
 */
export function CompanyLogo({
  src,
  name,
  size = 64,
  className = '',
  style: styleOverride,
  onLoaded,
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const style: CSSProperties = { width: size, height: size, ...styleOverride };

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-ramp-sand ${className}`}
        style={style}
      >
        <Building2 className="h-1/2 w-1/2 text-ramp-slate" />
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt={name ? `${name} logo` : 'Company logo'}
      className={`object-contain ${className}`}
      style={style}
      onLoad={() => onLoaded?.(src)}
      onError={() => setFailed(true)}
    />
  );
}
