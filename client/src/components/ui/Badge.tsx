import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-ramp-stone text-ramp-slate',
  success: 'bg-ramp-mist text-ramp-smolder',
  warning: 'bg-ramp-mustard text-ramp-terrace',
  error: 'bg-ramp-pebble text-ramp-rust',
  info: 'bg-ramp-spring/20 text-ramp-spring',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ children, variant = 'default', className = '', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
