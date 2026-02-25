import { Logo } from '../ui';

interface LayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

export function Layout({ children, showHeader = true }: LayoutProps) {
  return (
    <div className="min-h-screen bg-ramp-sand">
      {showHeader && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-ramp-stone">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <Logo size="sm" />
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
