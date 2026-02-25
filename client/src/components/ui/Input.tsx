import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-ramp-slate mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full px-4 py-2.5 
            bg-white border border-ramp-stone rounded-lg
            text-ramp-slate placeholder:text-ramp-gray-500
            transition-colors duration-200
            hover:border-ramp-gray-500
            focus:outline-none focus:border-ramp-slate focus:ring-1 focus:ring-ramp-slate
            disabled:bg-ramp-gray-100 disabled:cursor-not-allowed
            ${error ? 'border-ramp-rust focus:border-ramp-rust focus:ring-ramp-rust' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-ramp-rust">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-ramp-sage">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
