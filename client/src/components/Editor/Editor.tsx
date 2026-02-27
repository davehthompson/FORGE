import { useRef, useState, useCallback, useEffect } from 'react';
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
  Plane,
  GripVertical
} from 'lucide-react';
import { Button, Logo } from '../ui';
import { useStore } from '../../hooks/useStore';
import type { AssetType, AssetData, InvoiceData, QuoteData, ContractData } from '../../types';
import { AssetPreview } from './AssetPreview';
import { EditorSidebar } from './EditorSidebar';
import { syncConnectedDocuments, hasConnectedDocuments, ensureLineItemIds } from '../../utils/documentSync';

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
    batchUpdateDocuments,
    setStep,
    mode,
    reset,
  } = useStore();

  // Backfill IDs on line items that were generated before this feature
  useEffect(() => {
    const quote = generatedAssets.quote as QuoteData | null;
    if (quote?.items?.length && !quote.items[0].id) {
      setGeneratedAsset('quote', { ...quote, items: ensureLineItemIds(quote.items) });
    }
    const invoices = generatedInvoices.length > 0 ? generatedInvoices : [];
    invoices.forEach((inv, i) => {
      if (inv?.lineItems?.length && !inv.lineItems[0].id) {
        updateGeneratedInvoice(i, { lineItems: ensureLineItemIds(inv.lineItems) });
      }
    });
    const singleInvoice = generatedAssets.invoice as InvoiceData | null;
    if (singleInvoice?.lineItems?.length && !singleInvoice.lineItems[0].id && invoices.length === 0) {
      setGeneratedAsset('invoice', { ...singleInvoice, lineItems: ensureLineItemIds(singleInvoice.lineItems) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const DOC_WIDTH = 794;
  const PREVIEW_PADDING = 96;

  const [userZoom, setUserZoom] = useState(1);
  const [sidebarWidth, setSidebarWidth] = useState(384);
  const [isDragging, setIsDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const MIN_SIDEBAR = 280;
  const MAX_SIDEBAR = 600;

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = containerWidth > 0
    ? Math.min(1, (containerWidth - PREVIEW_PADDING) / DOC_WIDTH)
    : 1;
  const scale = fitScale * userZoom;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const newWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, dragRef.current.startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Handle multiple invoices
  const hasMultipleInvoices = generatedInvoices.length > 1;
  const isViewingInvoice = currentAsset === 'invoice';
  
  // Get the current data - use invoice array for invoices if available
  const currentData = currentAsset 
    ? (isViewingInvoice && hasMultipleInvoices 
        ? generatedInvoices[currentInvoiceIndex] 
        : generatedAssets[currentAsset])
    : null;

  const isConnected = hasConnectedDocuments(selectedAssets, generatedAssets, generatedInvoices);

  const handleDataChange = (newData: AssetData) => {
    if (!currentAsset) return;

    const syncableTypes: AssetType[] = ['quote', 'contract', 'invoice'];
    if (isConnected && syncableTypes.includes(currentAsset)) {
      const invoiceList = generatedInvoices.length > 0
        ? generatedInvoices
        : generatedAssets.invoice
          ? [generatedAssets.invoice as InvoiceData]
          : [];

      const result = syncConnectedDocuments(
        currentAsset,
        newData as QuoteData | ContractData | InvoiceData,
        isViewingInvoice ? currentInvoiceIndex : null,
        {
          quote: (generatedAssets.quote as QuoteData) || null,
          contract: (generatedAssets.contract as ContractData) || null,
          invoices: invoiceList,
        },
      );

      batchUpdateDocuments({
        quote: result.quote,
        contract: result.contract,
        invoices: result.invoices,
      });
    } else {
      if (isViewingInvoice && hasMultipleInvoices) {
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
    setUserZoom((z) => Math.min(z + 0.1, 2));
  };

  const handleZoomOut = () => {
    setUserZoom((z) => Math.max(z - 0.1, 0.3));
  };

  const handleResetZoom = () => {
    setUserZoom(1);
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
        {/* Sidebar - left */}
        <div
          className="bg-white border-r border-ramp-stone overflow-y-auto flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
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

        {/* Resizable divider */}
        <div
          onMouseDown={handleMouseDown}
          className="w-px flex-shrink-0 cursor-col-resize flex items-center justify-center group relative bg-ramp-stone"
        >
          <div className={`absolute w-4 h-4 rounded-full border bg-white flex items-center justify-center shadow-sm transition-colors ${isDragging ? 'border-ramp-solar' : 'border-ramp-stone group-hover:border-ramp-sage'}`}>
            <GripVertical className="w-2.5 h-2.5 text-ramp-sage" />
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto flex flex-col">
          {/* Toolbar row */}
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-ramp-stone p-1">
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

            {isViewingInvoice && hasMultipleInvoices && (
              <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-ramp-stone p-1">
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
          </div>

          {/* Document preview */}
          <div ref={previewContainerRef} className="flex-1 overflow-auto px-8 pb-8 flex items-start justify-center">
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
      </div>
    </div>
  );
}
