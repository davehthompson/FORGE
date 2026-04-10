import { useState, useEffect } from 'react';
import { ArrowLeft, Download, RefreshCw, Loader2, Camera } from 'lucide-react';
import { Button } from '../ui';
import { useStore } from '../../hooks/useStore';
import { generateReceiptImage } from '../../services/api';

export function ReceiptImagePreview() {
  const {
    receiptImageBlob,
    setReceiptImageBlob,
    quickReceiptPrompt,
    receiptImageScene,
    setStep,
    setIsLoading,
    isLoading,
    setError,
    error,
  } = useStore();

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (receiptImageBlob) {
      const url = URL.createObjectURL(receiptImageBlob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [receiptImageBlob]);

  const handleDownload = () => {
    if (!receiptImageBlob) return;
    const url = URL.createObjectURL(receiptImageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRegenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const blob = await generateReceiptImage(quickReceiptPrompt, receiptImageScene);
      setReceiptImageBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate receipt image');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setReceiptImageBlob(null);
    setStep('quick_receipt');
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-ramp-stone overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-ramp-stone">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-ramp-solar/20">
              <Camera className="w-4 h-4 text-ramp-slate" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ramp-slate">Receipt Photo</h2>
              <p className="text-ramp-sage text-xs">Generated with Gemini Nano Banana</p>
            </div>
          </div>
          <button
            onClick={handleBack}
            disabled={isLoading}
            className="text-sm text-ramp-sage hover:text-ramp-slate transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        </div>

        {/* Image */}
        <div className="p-6 flex justify-center bg-ramp-sand/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 text-ramp-slate animate-spin" />
              <p className="text-sm text-ramp-sage">Regenerating receipt image...</p>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Generated receipt"
              className="max-w-full max-h-[60vh] rounded-lg shadow-md object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <p className="text-sm text-ramp-sage">No image generated yet.</p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 border-t border-ramp-stone flex gap-3">
          <Button
            fullWidth
            onClick={handleDownload}
            disabled={isLoading || !receiptImageBlob}
          >
            <Download className="w-4 h-4 mr-2" />
            Download PNG
          </Button>
          <button
            onClick={handleRegenerate}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-ramp-stone text-sm font-medium text-ramp-slate hover:bg-ramp-sand transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
