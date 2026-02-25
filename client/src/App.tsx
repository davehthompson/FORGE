import { useState, useEffect, useCallback } from 'react';
import { useStore } from './hooks/useStore';
import { Layout } from './components/Layout';
import { Home } from './components/Home';
import { DomainInput } from './components/DomainInput';
import { CompanySummary } from './components/CompanySummary';
import { CategorySelector } from './components/CategorySelector';
import { AssetSelector } from './components/AssetSelector';
import { QuickReceiptPrompt } from './components/QuickReceipt';
import { Editor } from './components/Editor';
import { Export } from './components/Export';
import { Analytics } from './components/Analytics/Analytics';

function App() {
  const { step } = useStore();
  const [showAnalytics, setShowAnalytics] = useState(false);

  const toggleAnalytics = useCallback(() => {
    setShowAnalytics((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        toggleAnalytics();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAnalytics]);

  // Editor and Export have their own headers
  const showHeader = step !== 'editor' && step !== 'export';

  const renderStep = () => {
    switch (step) {
      case 'home':
        return <Home />;
      case 'input':
        return <DomainInput />;
      case 'summary':
        return <CompanySummary />;
      case 'category':
        return <CategorySelector />;
      case 'select':
        return <AssetSelector />;
      case 'quick_receipt':
        return <QuickReceiptPrompt />;
      case 'editor':
        return <Editor />;
      case 'export':
        return <Export />;
      default:
        return <Home />;
    }
  };

  return (
    <Layout showHeader={showHeader}>
      {renderStep()}
      <Analytics open={showAnalytics} onClose={() => setShowAnalytics(false)} />
    </Layout>
  );
}

export default App;
