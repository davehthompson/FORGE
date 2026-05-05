import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useStore } from '../../hooks/useStore';

const AUTO_DISMISS_MS = 8_000;

/**
 * Global error toast.
 *
 * Driven by `useStore.error`. Auto-dismisses after 8 seconds and is also
 * manually dismissible. Mounted once at the App root so any feature can
 * surface a failure by calling `setError(message)`.
 */
export function Toast() {
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);

  // Track the most recently surfaced error so we can animate cleanly when it
  // changes vs. just dismissing.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!error) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => {
      setError(null);
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [error, setError]);

  if (!visible || !error) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-lg">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ramp-slate">Something went wrong</p>
          <p className="mt-0.5 break-words text-sm text-ramp-sage">{error}</p>
        </div>
        <button
          onClick={() => setError(null)}
          aria-label="Dismiss"
          className="rounded-md p-1 text-ramp-sage hover:bg-ramp-sand hover:text-ramp-slate"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
