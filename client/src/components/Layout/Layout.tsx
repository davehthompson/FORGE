import { Logo } from '../ui';
import { useStore } from '../../hooks/useStore';

interface LayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

export function Layout({ children, showHeader = true }: LayoutProps) {
  const { reset, step } = useStore();

  return (
    <div className="min-h-screen bg-ramp-sand">
      {showHeader && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-ramp-stone">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            {step !== 'home' ? (
              <button onClick={reset} className="cursor-pointer">
                <Logo size="sm" />
              </button>
            ) : (
              <Logo size="sm" />
            )}
            <p className="text-sm text-ramp-sage">File Output for Ramp Generated Examples</p>
          </div>
        </header>
      )}
      <main className={showHeader ? 'pt-16' : ''}>
        {children}
      </main>
    </div>
  );
}
