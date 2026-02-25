import { useState } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  FileSignature, 
  ArrowRight, 
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  DollarSign,
  Link2,
  Plus,
  Minus,
} from 'lucide-react';

import { Button, Card, CardContent, Badge } from '../ui';
import { useStore } from '../../hooks/useStore';
import { 
  generateAssetStreaming, 
  shouldUseConnectedFlow, 
  generateConnectedAssetsStreaming,
  getConnectedGenerationOrder
} from '../../services/api';
import type { AssetType } from '../../types';

interface AssetOption {
  type: AssetType;
  label: string;
  description: string;
  icon: typeof FileText;
}

const ASSET_OPTIONS: AssetOption[] = [
  {
    type: 'quote',
    label: 'Quote',
    description: 'Price estimate with services, discounts, and validity period',
    icon: FileSpreadsheet,
  },
  {
    type: 'contract',
    label: 'Contract',
    description: 'Service agreement with terms, conditions, and signature fields',
    icon: FileSignature,
  },
  {
    type: 'invoice',
    label: 'Invoice',
    description: 'Detailed billing document with line items, taxes, and payment terms',
    icon: FileText,
  },
];

export function AssetSelector() {
  const { 
    company, 
    selectedSpendingCategory,
    selectedCurrency,
    selectedAssets, 
    toggleAsset, 
    selectAllAssets, 
    clearAssets,
    setStep,
    setGeneratedAsset,
    setCurrentAsset,
    setIsLoading,
    isLoading,
    setError,
    invoiceCount,
    setInvoiceCount,
    setGeneratedInvoices,
    setCurrentInvoiceIndex
  } = useStore();
  
  const [currentAssetType, setCurrentAssetType] = useState<AssetType | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [completedAssets, setCompletedAssets] = useState<AssetType[]>([]);
  const [currentInvoiceGenerating, setCurrentInvoiceGenerating] = useState<number>(0);

  const allSelected = selectedAssets.length === ASSET_OPTIONS.length;

  const handleToggleAll = () => {
    if (allSelected) {
      clearAssets();
    } else {
      selectAllAssets();
    }
  };

  const handleGenerate = async () => {
    if (!company || selectedAssets.length === 0 || !selectedSpendingCategory) return;

    setIsLoading(true);
    setError(null);
    setCompletedAssets([]);
    setGeneratedInvoices([]);
    setCurrentInvoiceGenerating(0);

    try {
      const useConnectedFlow = shouldUseConnectedFlow(selectedAssets);
      const hasInvoice = selectedAssets.includes('invoice');
      
      if (useConnectedFlow && hasInvoice) {
        // Use connected generation with multiple invoices
        const result = await generateConnectedAssetsStreaming(
          selectedAssets,
          company,
          selectedSpendingCategory,
          (type, status, invoiceIndex) => {
            setCurrentAssetType(type);
            setCurrentStatus(status);
            if (invoiceIndex !== undefined) {
              setCurrentInvoiceGenerating(invoiceIndex);
            }
            // Mark previous assets as complete when we move to a new type
            const orderedTypes = getConnectedGenerationOrder(selectedAssets);
            const currentTypeIndex = orderedTypes.indexOf(type);
            if (currentTypeIndex > 0) {
              const previousType = orderedTypes[currentTypeIndex - 1];
              setCompletedAssets(prev => 
                prev.includes(previousType) ? prev : [...prev, previousType]
              );
            }
          },
          invoiceCount,
          selectedCurrency
        );
        
        // Store single assets (quote, contract, receipt)
        Object.entries(result.assets).forEach(([type, data]) => {
          if (type !== 'invoice' || result.invoices.length === 0) {
            setGeneratedAsset(type as AssetType, data);
          }
        });
        
        // Store multiple invoices
        if (result.invoices.length > 0) {
          setGeneratedInvoices(result.invoices);
          // Also set first invoice as the main invoice asset for backward compatibility
          setGeneratedAsset('invoice', result.invoices[0]);
        }
        
        // Mark all as completed
        setCompletedAssets(selectedAssets);
      } else if (useConnectedFlow) {
        // Connected flow without invoice (just quote + contract)
        const result = await generateConnectedAssetsStreaming(
          selectedAssets,
          company,
          selectedSpendingCategory,
          (type, status) => {
            setCurrentAssetType(type);
            setCurrentStatus(status);
            const orderedTypes = getConnectedGenerationOrder(selectedAssets);
            const currentTypeIndex = orderedTypes.indexOf(type);
            if (currentTypeIndex > 0) {
              const previousType = orderedTypes[currentTypeIndex - 1];
              setCompletedAssets(prev => 
                prev.includes(previousType) ? prev : [...prev, previousType]
              );
            }
          },
          1, // Single invoice if needed
          selectedCurrency
        );
        
        Object.entries(result.assets).forEach(([type, data]) => {
          setGeneratedAsset(type as AssetType, data);
        });
        
        setCompletedAssets(selectedAssets);
      } else {
        // Standard independent generation
        for (const type of selectedAssets) {
          setCurrentAssetType(type);
          setCurrentStatus('Initializing...');
          
          const assetData = await generateAssetStreaming(
            type,
            company,
            selectedSpendingCategory,
            (status) => {
              setCurrentStatus(status);
            },
            undefined,
            selectedCurrency
          );
          
          setGeneratedAsset(type, assetData);
          setCompletedAssets(prev => [...prev, type]);
        }
      }

      // Set the first asset as current and navigate to editor
      const orderedAssets = useConnectedFlow 
        ? getConnectedGenerationOrder(selectedAssets) 
        : selectedAssets;
      setCurrentAsset(orderedAssets[0]);
      setCurrentInvoiceIndex(0);
      setStep('editor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate assets');
      setIsLoading(false);
      setCurrentAssetType(null);
      setCurrentStatus(null);
    }
  };

  if (!company || !selectedSpendingCategory) {
    return null;
  }

  // Check if connected flow will be used
  const isConnectedFlow = shouldUseConnectedFlow(selectedAssets);
  
  const totalAssets = selectedAssets.length;
  const completedCount = completedAssets.length;

  // GENERATION VIEW - Pulsating logo with status text
  if (isLoading) {
    const currentLabel = currentAssetType
      ? (() => {
          const option = ASSET_OPTIONS.find(o => o.type === currentAssetType);
          const name = option?.label || currentAssetType;
          if (currentAssetType === 'invoice' && isConnectedFlow && invoiceCount > 1) {
            return `Invoice ${currentInvoiceGenerating + 1} of ${invoiceCount}`;
          }
          return name;
        })()
      : '';

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {/* Pulsating Ramp logo */}
          <div className="mb-6">
            <img
              src="/assets/Ramp-glyph-RGB-black.png"
              alt="Ramp"
              className="w-16 h-16 mx-auto animate-pulse"
            />
          </div>

          {/* Current asset being generated */}
          <p className="text-sm font-medium text-ramp-slate mb-1">
            {currentLabel}
          </p>

          {/* Current step */}
          <p className="text-sm text-ramp-sage mb-2">
            {currentStatus || 'Initializing...'}
          </p>

          {/* Progress count */}
          <p className="text-xs text-ramp-gray-500">
            {completedCount} of {totalAssets} assets complete
          </p>
        </div>
      </div>
    );
  }

  // SELECTION VIEW - Normal asset selection UI
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card variant="elevated" padding="lg" className="w-full max-w-2xl">
        <CardContent>
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ramp-sand mb-4">
              <Sparkles className="w-8 h-8 text-ramp-slate" />
            </div>
            <h1 className="text-2xl font-bold text-ramp-slate mb-2">
              Select Assets to Generate
            </h1>
            <p className="text-ramp-sage">
              Choose which demo documents you want to create for {company.name}
            </p>
          </div>

          {/* Selected Category Badge */}
          <div className="mb-6 p-4 bg-ramp-solar/20 rounded-lg border border-ramp-solar">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-ramp-slate" />
              <span className="text-sm font-medium text-ramp-slate">Spending Category:</span>
              <Badge variant="default">{selectedSpendingCategory}</Badge>
            </div>
            <p className="text-xs text-ramp-sage mt-1">
              All assets will be generated with vendors and line items related to this category
            </p>
          </div>

          {/* Select All Button */}
          <div className="flex justify-end mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleAll}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          {/* Asset Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {ASSET_OPTIONS.map((option) => {
              const isSelected = selectedAssets.includes(option.type);
              const Icon = option.icon;

              return (
                <button
                  key={option.type}
                  onClick={() => toggleAsset(option.type)}
                  className={`
                    relative p-4 rounded-xl border-2 text-left transition-all duration-200
                    ${isSelected 
                      ? 'border-ramp-slate bg-ramp-sand' 
                      : 'border-ramp-stone hover:border-ramp-gray-400 bg-white'
                    }
                    cursor-pointer
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className={`
                      p-2 rounded-lg
                      ${isSelected 
                        ? 'bg-ramp-slate text-white' 
                        : 'bg-ramp-stone text-ramp-slate'
                      }
                    `}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-ramp-slate">{option.label}</h3>
                      <p className="text-sm text-ramp-sage mt-1">
                        {option.description}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-ramp-slate flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Connected Flow Indicator */}
          {isConnectedFlow && (
            <div className="mb-6 p-4 bg-ramp-spring/10 rounded-lg border border-ramp-spring/30">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-ramp-spring/20">
                  <Link2 className="w-4 h-4 text-ramp-spring" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-ramp-slate text-sm">Connected Document Flow</h4>
                  <p className="text-xs text-ramp-sage mt-1">
                    These documents will be generated in order and reference each other:
                    {selectedAssets.includes('quote') && ' Quote →'}
                    {selectedAssets.includes('contract') && ' Contract →'}
                    {selectedAssets.includes('invoice') && ` Invoice${invoiceCount > 1 ? `s (${invoiceCount})` : ''}`}
                  </p>
                  <p className="text-xs text-ramp-spring mt-1">
                    Same vendor, matching totals, and document references will be maintained
                  </p>
                  
                  {/* Invoice count selector */}
                  {selectedAssets.includes('invoice') && (
                    <div className="mt-4 pt-3 border-t border-ramp-spring/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-ramp-slate">Number of Invoices</p>
                          <p className="text-xs text-ramp-sage">
                            Multiple invoices will split the total as partial payments
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setInvoiceCount(Math.max(1, invoiceCount - 1))}
                            disabled={invoiceCount <= 1}
                            className="w-8 h-8 rounded-lg border border-ramp-spring/40 flex items-center justify-center hover:bg-ramp-spring/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="w-4 h-4 text-ramp-slate" />
                          </button>
                          <span className="w-8 text-center font-bold text-ramp-slate">{invoiceCount}</span>
                          <button
                            onClick={() => setInvoiceCount(Math.min(5, invoiceCount + 1))}
                            disabled={invoiceCount >= 5}
                            className="w-8 h-8 rounded-lg border border-ramp-spring/40 flex items-center justify-center hover:bg-ramp-spring/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus className="w-4 h-4 text-ramp-slate" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep('category')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              fullWidth
              onClick={handleGenerate}
              disabled={selectedAssets.length === 0}
              className="group"
            >
              <span>Generate {selectedAssets.length} Asset{selectedAssets.length !== 1 ? 's' : ''}</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          {/* Helper text */}
          <p className="mt-4 text-xs text-ramp-sage text-center">
            Assets will be generated with AI-powered content based on the selected spending category
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
