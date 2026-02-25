import { forwardRef, type InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id, checked, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-center gap-3 cursor-pointer select-none ${className}`}
      >
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          <div
            className={`
              w-5 h-5 rounded border-2 transition-colors duration-200
              flex items-center justify-center
              ${checked 
                ? 'bg-ramp-slate border-ramp-slate' 
                : 'bg-white border-ramp-stone hover:border-ramp-gray-500'
              }
              peer-focus-visible:ring-2 peer-focus-visible:ring-ramp-slate peer-focus-visible:ring-offset-2
              peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
            `}
          >
            {checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
          </div>
        </div>
        {label && (
          <span className="text-sm text-ramp-slate">{label}</span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
