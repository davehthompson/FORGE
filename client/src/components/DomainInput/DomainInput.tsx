import { useState, type FormEvent } from 'react';
import { Globe, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button, Input, Card, CardContent } from '../ui';
import { useStore } from '../../hooks/useStore';
import { enrichCompany } from '../../services/api';

export function DomainInput() {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { setCompany, setStep, setIsLoading, isLoading } = useStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!domain.trim()) {
      setError('Please enter a domain');
      return;
    }

    // Basic domain validation
    const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    const cleanDomain = domain.trim().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    
    if (!domainPattern.test(cleanDomain)) {
      setError('Please enter a valid domain (e.g., example.com)');
      return;
    }

    setIsLoading(true);

    try {
      const company = await enrichCompany(cleanDomain);
      setCompany(company);
      setStep('summary');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch company data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <Card variant="elevated" padding="lg" className="w-full max-w-lg">
        <CardContent>
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep('home')}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ramp-sand mb-4">
              <Globe className="w-8 h-8 text-ramp-slate" />
            </div>
            <h1 className="text-2xl font-bold text-ramp-slate mb-2">
              Enter Company Domain
            </h1>
            <p className="text-ramp-sage">
              We'll analyze the company and help you create demo assets
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Company Domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              error={error ?? undefined}
              helperText="Enter the company's website domain"
              disabled={isLoading}
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading}
              className="group"
            >
              <span>Analyze Company</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-ramp-pebble rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-ramp-rust flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ramp-rust">{error}</p>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-ramp-stone">
            <p className="text-xs text-ramp-sage text-center">
              FORGE uses company data to generate realistic demo assets including
              invoices, receipts, quotes, and contracts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
