import { Building2, Receipt, FileScan, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../ui';
import { useStore } from '../../hooks/useStore';

export function Home() {
  const { setMode, setStep } = useStore();

  const handleCompanyMode = () => {
    setMode('company');
    setStep('input');
  };

  const handleQuickReceiptMode = () => {
    setMode('quick_receipt');
    setStep('quick_receipt');
  };

  const handleInvoiceEdit = () => {
    setMode('invoice_edit');
    setStep('invoice_edit');
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-ramp-slate mb-4">
            Welcome to FORGE
          </h1>
          <p className="text-ramp-gray-600 mt-2">
            Choose how you'd like to create your demo assets
          </p>
        </div>

        {/* Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Company Lookup Mode */}
          <Card 
            variant="elevated" 
            padding="lg" 
            className="cursor-pointer hover:shadow-xl transition-all duration-300 group border-2 border-transparent hover:border-ramp-solar"
            onClick={handleCompanyMode}
          >
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-ramp-solar/20 flex items-center justify-center mb-6 group-hover:bg-ramp-solar transition-colors">
                  <Building2 className="w-10 h-10 text-ramp-slate" />
                </div>
                <h2 className="text-xl font-bold text-ramp-slate mb-3">
                  Company Lookup
                </h2>
                <p className="text-ramp-sage mb-6 text-sm leading-relaxed">
                  Enter a company domain to generate invoices, receipts, quotes, and contracts based on real company data and spending categories.
                </p>
                <div className="flex items-center gap-2 text-ramp-slate font-medium group-hover:gap-3 transition-all">
                  <span>Get Started</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Receipt Mode */}
          <Card 
            variant="elevated" 
            padding="lg" 
            className="cursor-pointer hover:shadow-xl transition-all duration-300 group border-2 border-transparent hover:border-ramp-solar"
            onClick={handleQuickReceiptMode}
          >
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-ramp-solar/20 flex items-center justify-center mb-6 group-hover:bg-ramp-solar transition-colors">
                  <Receipt className="w-10 h-10 text-ramp-slate" />
                </div>
                <h2 className="text-xl font-bold text-ramp-slate mb-3">
                  Quick Receipt
                </h2>
                <p className="text-ramp-sage mb-6 text-sm leading-relaxed">
                  Describe a receipt in plain text and let AI generate realistic receipt data. Perfect for quick, custom receipts.
                </p>
                <div className="flex items-center gap-2 text-ramp-slate font-medium group-hover:gap-3 transition-all">
                  <span>Create Receipt</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            variant="elevated"
            padding="lg"
            className="cursor-pointer hover:shadow-xl transition-all duration-300 group border-2 border-transparent hover:border-ramp-solar"
            onClick={handleInvoiceEdit}
          >
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-ramp-solar/20 flex items-center justify-center mb-6 group-hover:bg-ramp-solar transition-colors">
                  <FileScan className="w-10 h-10 text-ramp-slate" />
                </div>
                <h2 className="text-xl font-bold text-ramp-slate mb-3">
                  Edit a prospect invoice
                </h2>
                <p className="text-ramp-sage mb-6 text-sm leading-relaxed">
                  Upload a real invoice and change what is printed on it for an OCR test. Export the edited PDF and the values OCR should return.
                </p>
                <div className="flex items-center gap-2 text-ramp-slate font-medium group-hover:gap-3 transition-all">
                  <span>Open an invoice</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-ramp-gray-500 mt-8">
          Generated assets export to PDF or JPG. Prospect invoices export an edited PDF plus expected OCR values.
        </p>
      </div>
    </div>
  );
}
