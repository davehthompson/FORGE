import { useState } from 'react';
import { 
  FileText, 
  Receipt, 
  FileSpreadsheet, 
  FileSignature,
  ArrowLeft,
  Image,
  FileType,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Printer,
  Building2,
  Plane
} from 'lucide-react';
import { Button, Card, CardContent, Logo, Badge } from '../ui';
import { useStore } from '../../hooks/useStore';
import { exportPdf, exportJpg, downloadBlob } from '../../services/api';
import type { AssetType, AssetData } from '../../types';
import { AssetPreview } from '../Editor/AssetPreview';

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
  quote: 'Quote',
  contract: 'Contract',
  paper_receipt: 'Paper Receipt',
  hotel_folio: 'Hotel Folio',
  airline_receipt: 'Airline Receipt',
};

// Display order for export items: Quote → Contract → Invoice → Receipts
const ASSET_DISPLAY_ORDER: AssetType[] = ['quote', 'contract', 'invoice', 'receipt', 'paper_receipt', 'hotel_folio', 'airline_receipt'];

type ExportFormat = 'pdf' | 'jpg';

interface ExportStatus {
  type: AssetType;
  format: ExportFormat;
  invoiceIndex?: number; // For tracking multiple invoices
  status: 'pending' | 'exporting' | 'success' | 'error';
  error?: string;
}

export function Export() {
  const { selectedAssets, generatedAssets, generatedInvoices, setStep, reset, company, selectedCurrency } = useStore();
  const [exportStatuses, setExportStatuses] = useState<ExportStatus[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const hasMultipleInvoices = generatedInvoices.length > 1;

  // Helper to create a unique key for status tracking
  const getStatusKey = (type: AssetType, format: ExportFormat, invoiceIndex?: number) => {
    return invoiceIndex !== undefined ? `${type}-${invoiceIndex}-${format}` : `${type}-${format}`;
  };

  const handleExport = async (type: AssetType, format: ExportFormat, data: AssetData, invoiceIndex?: number) => {
    if (!data) return;

    const statusKey = getStatusKey(type, format, invoiceIndex);

    setExportStatuses((prev) => [
      ...prev.filter((s) => getStatusKey(s.type, s.format, s.invoiceIndex) !== statusKey),
      { type, format, invoiceIndex, status: 'exporting' },
    ]);

    try {
      let blob: Blob;
      if (format === 'pdf') {
        blob = await exportPdf(type, data, selectedCurrency);
      } else {
        blob = await exportJpg(type, data, selectedCurrency);
      }

      const companyName = company?.name.replace(/\s+/g, '_') || 'company';
      const invoiceSuffix = invoiceIndex !== undefined ? `_${invoiceIndex + 1}` : '';
      const filename = `${companyName}_${type}${invoiceSuffix}_${Date.now()}.${format}`;
      downloadBlob(blob, filename);

      setExportStatuses((prev) =>
        prev.map((s) =>
          getStatusKey(s.type, s.format, s.invoiceIndex) === statusKey
            ? { ...s, status: 'success' }
            : s
        )
      );
    } catch (error) {
      setExportStatuses((prev) =>
        prev.map((s) =>
          getStatusKey(s.type, s.format, s.invoiceIndex) === statusKey
            ? { ...s, status: 'error', error: error instanceof Error ? error.message : 'Export failed' }
            : s
        )
      );
    }
  };

  const handleExportAll = async (format: ExportFormat) => {
    setIsExporting(true);

    // Export in display order
    for (const type of ASSET_DISPLAY_ORDER) {
      if (!selectedAssets.includes(type)) continue;
      
      if (type === 'invoice' && hasMultipleInvoices) {
        // Export all invoices
        for (let i = 0; i < generatedInvoices.length; i++) {
          await handleExport(type, format, generatedInvoices[i], i);
        }
      } else {
        const data = generatedAssets[type];
        if (data) {
          await handleExport(type, format, data);
        }
      }
    }

    setIsExporting(false);
  };

  const getExportStatus = (type: AssetType, format: ExportFormat, invoiceIndex?: number): ExportStatus | undefined => {
    const statusKey = getStatusKey(type, format, invoiceIndex);
    return exportStatuses.find((s) => getStatusKey(s.type, s.format, s.invoiceIndex) === statusKey);
  };

  const handleStartOver = () => {
    reset();
    setStep('input');
  };

  // Calculate total exportable items (including multiple invoices)
  const totalExportItems = selectedAssets.reduce((count, type) => {
    if (type === 'invoice' && hasMultipleInvoices) {
      return count + generatedInvoices.length;
    }
    return count + 1;
  }, 0);

  return (
    <div className="min-h-screen bg-ramp-sand">
      {/* Header */}
      <header className="bg-white border-b border-ramp-stone px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('editor')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Editor
          </Button>
          <Logo size="sm" />
        </div>

        <Button variant="outline" onClick={handleStartOver}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Start New Project
        </Button>
      </header>

      {/* Main content */}
      <div className="max-w-6xl mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ramp-slate mb-2">Export Your Assets</h1>
          <p className="text-ramp-sage">
            Download your generated documents as PDF or JPG files
          </p>
        </div>

        {/* Bulk export */}
        <Card variant="elevated" padding="md" className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-ramp-slate">Export All Assets</h2>
                <p className="text-sm text-ramp-sage">
                  Download all {totalExportItems} {totalExportItems === 1 ? 'document' : 'documents'} at once
                  {hasMultipleInvoices && ` (includes ${generatedInvoices.length} invoices)`}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleExportAll('jpg')}
                  disabled={isExporting}
                >
                  <Image className="w-4 h-4 mr-2" />
                  Export All as JPG
                </Button>
                <Button
                  onClick={() => handleExportAll('pdf')}
                  disabled={isExporting}
                >
                  <FileType className="w-4 h-4 mr-2" />
                  Export All as PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Individual assets - ordered by document flow */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {ASSET_DISPLAY_ORDER
            .filter(type => selectedAssets.includes(type))
            .flatMap((type) => {
              // Handle multiple invoices
              if (type === 'invoice' && hasMultipleInvoices) {
                return generatedInvoices.map((invoiceData, index) => {
                  const Icon = ASSET_ICONS[type];
                  const pdfStatus = getExportStatus(type, 'pdf', index);
                  const jpgStatus = getExportStatus(type, 'jpg', index);

                  return (
                    <Card key={`invoice-${index}`} variant="elevated" padding="none" className="overflow-hidden">
                      {/* Preview */}
                      <div className="bg-ramp-gray-300 p-4 flex justify-center items-start overflow-hidden h-64">
                        <div className="transform scale-[0.25] origin-top">
                          <AssetPreview type={type} data={invoiceData} scale={1} />
                        </div>
                      </div>

                      {/* Info and actions */}
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className="w-5 h-5 text-ramp-slate" />
                          <h3 className="font-bold text-ramp-slate">
                            Invoice {index + 1} of {generatedInvoices.length}
                          </h3>
                          {(pdfStatus?.status === 'success' || jpgStatus?.status === 'success') && (
                            <Badge variant="success">Exported</Badge>
                          )}
                        </div>
                        <p className="text-xs text-ramp-sage mb-3">
                          {invoiceData.invoiceNumber}
                        </p>

                        <div className="flex gap-2">
                          <ExportButton
                            format="jpg"
                            status={jpgStatus}
                            onClick={() => handleExport(type, 'jpg', invoiceData, index)}
                            disabled={isExporting}
                          />
                          <ExportButton
                            format="pdf"
                            status={pdfStatus}
                            onClick={() => handleExport(type, 'pdf', invoiceData, index)}
                            disabled={isExporting}
                          />
                        </div>

                        {(pdfStatus?.status === 'error' || jpgStatus?.status === 'error') && (
                          <p className="mt-2 text-sm text-ramp-rust">
                            {pdfStatus?.error || jpgStatus?.error}
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                });
              }

              // Handle single assets (quote, contract, receipt, or single invoice)
              const data = generatedAssets[type];
              if (!data) return [];

              const Icon = ASSET_ICONS[type];
              const pdfStatus = getExportStatus(type, 'pdf');
              const jpgStatus = getExportStatus(type, 'jpg');

              return [(
                <Card key={type} variant="elevated" padding="none" className="overflow-hidden">
                  {/* Preview */}
                  <div className="bg-ramp-gray-300 p-4 flex justify-center items-start overflow-hidden h-64">
                    <div className="transform scale-[0.25] origin-top">
                      <AssetPreview type={type} data={data} scale={1} />
                    </div>
                  </div>

                  {/* Info and actions */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-5 h-5 text-ramp-slate" />
                      <h3 className="font-bold text-ramp-slate">{ASSET_LABELS[type]}</h3>
                      {(pdfStatus?.status === 'success' || jpgStatus?.status === 'success') && (
                        <Badge variant="success">Exported</Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <ExportButton
                        format="jpg"
                        status={jpgStatus}
                        onClick={() => handleExport(type, 'jpg', data)}
                        disabled={isExporting}
                      />
                      <ExportButton
                        format="pdf"
                        status={pdfStatus}
                        onClick={() => handleExport(type, 'pdf', data)}
                        disabled={isExporting}
                      />
                    </div>

                    {(pdfStatus?.status === 'error' || jpgStatus?.status === 'error') && (
                      <p className="mt-2 text-sm text-ramp-rust">
                        {pdfStatus?.error || jpgStatus?.error}
                      </p>
                    )}
                  </div>
                </Card>
              )];
            })}
        </div>

        {/* Success message */}
        {exportStatuses.some((s) => s.status === 'success') && (
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 bg-ramp-mist/20 text-ramp-smolder px-4 py-2 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
              <span>Files downloaded successfully!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ExportButtonProps {
  format: ExportFormat;
  status?: ExportStatus;
  onClick: () => void;
  disabled: boolean;
}

function ExportButton({ format, status, onClick, disabled }: ExportButtonProps) {
  const isExporting = status?.status === 'exporting';
  const isSuccess = status?.status === 'success';

  return (
    <Button
      variant={format === 'pdf' ? 'primary' : 'outline'}
      size="sm"
      onClick={onClick}
      disabled={disabled || isExporting}
      className="flex-1"
    >
      {isExporting ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Exporting...
        </>
      ) : isSuccess ? (
        <>
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {format.toUpperCase()}
        </>
      ) : (
        <>
          {format === 'pdf' ? (
            <FileType className="w-4 h-4 mr-2" />
          ) : (
            <Image className="w-4 h-4 mr-2" />
          )}
          {format.toUpperCase()}
        </>
      )}
    </Button>
  );
}
