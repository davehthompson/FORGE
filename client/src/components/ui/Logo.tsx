interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const imgSizes = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

const textSizes = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

export function Logo({ className = '', size = 'md' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/assets/Ramp-glyph-RGB-black.png"
        alt="Ramp"
        className={`${imgSizes[size]} object-contain`}
      />
      <span className={`font-bold tracking-tight text-ramp-slate ${textSizes[size]}`}>
        FORGE
      </span>
    </div>
  );
}

export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <img
      src="/assets/Ramp-glyph-RGB-black.png"
      alt="Ramp"
      className={`w-10 h-10 object-contain ${className}`}
    />
  );
}
