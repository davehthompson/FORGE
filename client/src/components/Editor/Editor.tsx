import { useRef, useState } from 'react';
import { 
  FileText, 
  Receipt, 
  FileSpreadsheet, 
  FileSignature,
  Download,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Printer,
  Building2,
  Plane
} from 'lucide-react';
import { Button, Logo } from '../ui';
import { useStore } from '../../hooks/useStore';
import type { AssetType, AssetData, InvoiceData } from '../../types';
import { AssetPreview } from './AssetPreview';
import { EditorSidebar } from './EditorSidebar';

const ASSET_ICONS: Record<AssetType, typeof FileText> = {
  invoice: FileText,
  receipt: Receipt,
  paper_receipt: Printer,
  hotel_folio: Building2,
  airline_receipt: Plane,
  quote: FileSpreadsheet,
  contract: FileSignature,
};

const ASSET_LABELS: Record<AssetType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  paper_receipt: 'Paper Receipt',
  hotel_folio: 'Hotel Folio',
  airline_receipt: 'Airline Receipt',
  quote: 'Quote',
  contract: 'Contract',
};

// Display order for tabs: Quote → Contract → Invoice → Receipts
const ASSET_DISPLAY_ORDER: AssetType[] = ['quote', 'contract', 'invoice', 'receipt', 'paper_receipt', 'hotel_folio', 'airline_receipt'];

export function Editor() {
  const {
    selectedAssets,
    generatedAssets,
    generatedInvoices,
    currentAsset,
    setCurrentAsset,
    setGeneratedAsset,
    currentInvoiceIndex,
    setCurrentInvoiceIndex,
    updateGeneratedInvoice,
    setStep,
    mode,
    reset,
  } = useStore();

  const [scale, setScale] = useState(1);
  const previewRef = useRef<HTMLDivElement>(null);

  // Handle multiple invoices
  const hasMultipleInvoices = generatedInvoices.length > 1;
  const isViewingInvoice = currentAsset === 'invoice';
  
  // Get the current data - use invoice array for invoices if available
  const currentData = currentAsset 
    ? (isViewingInvoice && hasMultipleInvoices 
        ? generatedInvoices[currentInvoiceIndex] 
        : generatedAssets[currentAsset])
    : null;

  const handleDataChange = (newData: AssetData) => {
    if (currentAsset) {
      if (isViewingInvoice && hasMultipleInvoices) {
        // Update the specific invoice in the array
        updateGeneratedInvoice(currentInvoiceIndex, newData as Partial<InvoiceData>);
      } else {
        setGeneratedAsset(currentAsset, newData);
      }
    }
  };

  const handlePreviousInvoice = () => {
    if (currentInvoiceIndex > 0) {
      setCurrentInvoiceIndex(currentInvoiceIndex - 1);
    }
  };

  const handleNextInvoice = () => {
    if (currentInvoiceIndex < generatedInvoices.length - 1) {
      setCurrentInvoiceIndex(currentInvoiceIndex + 1);
    }
  };

  const handleZoomIn = () => {
    setScale((s) => Math.min(s + 0.1, 1.5));
  };

  const handleZoomOut = () => {
    setScale((s) => Math.max(s - 0.1, 0.3));
  };

  const handleResetZoom = () => {
    setScale(0.6);
  };

  const handleExport = () => {
    setStep('export');
  };

  if (!currentAsset || !currentData) {
    return null;
  }

  const Icon = ASSET_ICONS[currentAsset];

  return (
    <div className="h-screen flex flex-col bg-ramp-sand">
      {/* Header */}
      <header className="bg-white border-b border-ramp-stone px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(mode === 'quick_receipt' ? 'quick_receipt' : 'select')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <button onClick={reset} className="cursor-pointer">
            <Logo size="sm" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Asset tabs - sorted in document flow order: Quote → Contract → Invoice → Receipt */}
          {ASSET_DISPLAY_ORDER
            .filter(type => selectedAssets.includes(type))
            .map((type) => {
            const TabIcon = ASSET_ICONS[type];
            const isActive = type === currentAsset;
            const invoiceCount = type === 'invoice' ? generatedInvoices.length : 0;
            return (
              <button
                key={type}
                onClick={() => {
                  setCurrentAsset(type);
                  if (type === 'invoice') {
                    setCurrentInvoiceIndex(0);
                  }
                }}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive 
                    ? 'bg-ramp-slate text-white' 
                    : 'text-ramp-slate hover:bg-ramp-stone'
                  }
                `}
              >
                <TabIcon className="w-4 h-4" />
                {ASSET_LABELS[type]}
                {invoiceCount > 1 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-ramp-stone'}`}>
                    {invoiceCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview area */}
        <div className="flex-1 overflow-auto p-8 flex items-start justify-center">
          <div className="relative">
            {/* Zoom controls */}
            <div className="absolute -top-12 left-0 flex items-center gap-2 bg-white rounded-lg shadow-sm border border-ramp-stone p-1">
              <button
                onClick={handleZoomOut}
                className="p-1.5 hover:bg-ramp-sand rounded transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4 text-ramp-slate" />
              </button>
              <span className="text-sm text-ramp-slate px-2 min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 hover:bg-ramp-sand rounded transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4 text-ramp-slate" />
              </button>
              <div className="w-px h-4 bg-ramp-stone" />
              <button
                onClick={handleResetZoom}
                className="p-1.5 hover:bg-ramp-sand rounded transition-colors"
                title="Reset zoom"
              >
                <RotateCcw className="w-4 h-4 text-ramp-slate" />
              </button>
            </div>

            {/* Invoice navigation for multiple invoices */}
            {isViewingInvoice && hasMultipleInvoices && (
              <div className="absolute -top-12 right-0 flex items-center gap-2 bg-white rounded-lg shadow-sm border border-ramp-stone p-1">
                <button
                  onClick={handlePreviousInvoice}
                  disabled={currentInvoiceIndex === 0}
                  className="p-1.5 hover:bg-ramp-sand rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4 text-ramp-slate" />
                </button>
                <span className="text-sm text-ramp-slate px-2">
                  Invoice {currentInvoiceIndex + 1} of {generatedInvoices.length}
                </span>
                <button
                  onClick={handleNextInvoice}
                  disabled={currentInvoiceIndex === generatedInvoices.length - 1}
                  className="p-1.5 hover:bg-ramp-sand rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4 text-ramp-slate" />
                </button>
              </div>
            )}

            {/* Document preview */}
            <div className="bg-ramp-gray-400 p-4 rounded-lg shadow-inner">
              <AssetPreview
                ref={previewRef}
                type={currentAsset}
                data={currentData}
                scale={scale}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-96 bg-white border-l border-ramp-stone overflow-y-auto">
          <div className="p-4 border-b border-ramp-stone">
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5 text-ramp-slate" />
              <h2 className="font-bold text-ramp-slate">Edit {ASSET_LABELS[currentAsset]}</h2>
            </div>
            <p className="text-sm text-ramp-sage mt-1">
              Make changes to the document content
            </p>
          </div>
          <div className="p-4">
            <EditorSidebar
              type={currentAsset}
              data={currentData}
              onChange={handleDataChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
