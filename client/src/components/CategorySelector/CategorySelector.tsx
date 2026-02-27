import { useState } from 'react';
import { 
  DollarSign, 
  ArrowRight, 
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Coins,
  Pencil
} from 'lucide-react';
import { Button, Card, CardContent } from '../ui';
import { useStore } from '../../hooks/useStore';
import { CURRENCIES, getCurrency } from '../../utils/currencies';

export function CategorySelector() {
  const { 
    company, 
    selectedSpendingCategory,
    setSelectedSpendingCategory,
    selectedCurrency,
    setSelectedCurrency,
    setStep 
  } = useStore();
  
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const currentCurrency = getCurrency(selectedCurrency) || CURRENCIES[0];

  if (!company) {
    return null;
  }

  const handleCategorySelect = (category: string) => {
    setIsCustomMode(false);
    setCustomText('');
    setSelectedSpendingCategory(category);
  };

  const handleCustomToggle = () => {
    setIsCustomMode(true);
    setSelectedSpendingCategory(customText || null);
  };

  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    setSelectedSpendingCategory(text.trim() || null);
  };

  const handleContinue = () => {
    if (selectedSpendingCategory) {
      setStep('select');
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <Card variant="elevated" padding="lg" className="w-full max-w-2xl">
        <CardContent>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ramp-sand mb-4">
              <DollarSign className="w-8 h-8 text-ramp-slate" />
            </div>
            <h1 className="text-2xl font-bold text-ramp-slate mb-2">
              Select Spending Category
            </h1>
            <p className="text-ramp-sage">
              Choose a spending category to focus the generated assets for {company.name}
            </p>
          </div>

          {/* Category Options */}
          <div className="space-y-3 mb-4">
            {company.spendingCategories.map((category, index) => {
              const isSelected = !isCustomMode && selectedSpendingCategory === category;

              return (
                <button
                  key={index}
                  onClick={() => handleCategorySelect(category)}
                  className={`
                    w-full p-4 rounded-xl border-2 text-left transition-all duration-200
                    flex items-center justify-between
                    ${isSelected 
                      ? 'border-ramp-slate bg-ramp-sand' 
                      : 'border-ramp-stone hover:border-ramp-gray-400 bg-white'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                      ${isSelected 
                        ? 'bg-ramp-slate text-white' 
                        : 'bg-ramp-stone text-ramp-slate'
                      }
                    `}>
                      {index + 1}
                    </div>
                    <span className={`font-medium ${isSelected ? 'text-ramp-slate' : 'text-ramp-gray-700'}`}>
                      {category}
                    </span>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-ramp-slate" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Category Option */}
          <div className="mb-8">
            <button
              onClick={handleCustomToggle}
              className={`
                w-full p-4 rounded-xl border-2 text-left transition-all duration-200
                flex items-center justify-between
                ${isCustomMode
                  ? 'border-ramp-slate bg-ramp-sand'
                  : 'border-dashed border-ramp-stone hover:border-ramp-gray-400 bg-white'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${isCustomMode
                    ? 'bg-ramp-slate text-white'
                    : 'bg-ramp-stone text-ramp-slate'
                  }
                `}>
                  <Pencil className="w-4 h-4" />
                </div>
                <span className={`font-medium ${isCustomMode ? 'text-ramp-slate' : 'text-ramp-gray-700'}`}>
                  Custom
                </span>
              </div>
              {isCustomMode && (
                <CheckCircle2 className="w-5 h-5 text-ramp-slate" />
              )}
            </button>

            {isCustomMode && (
              <div className="mt-3">
                <textarea
                  value={customText}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  placeholder="Describe what you need, e.g. FedEx overnight shipping services, Dell laptop procurement, Hilton hotel stays for Q1 offsite..."
                  rows={3}
                  autoFocus
                  className="w-full p-4 rounded-xl border-2 border-ramp-stone focus:border-ramp-slate focus:outline-none bg-white text-ramp-slate placeholder:text-ramp-gray-400 text-sm resize-none transition-colors duration-200"
                />
                <p className="mt-1.5 text-xs text-ramp-sage">
                  Include a vendor name and the type of line items you want generated.
                </p>
              </div>
            )}
          </div>

          {/* Currency Selector */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4 text-ramp-sage" />
              <span className="text-sm font-medium text-ramp-slate">Currency</span>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                className="w-full p-3 rounded-xl border-2 border-ramp-stone hover:border-ramp-gray-400 bg-white text-left transition-all duration-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{currentCurrency.flag}</span>
                  <div>
                    <span className="font-medium text-ramp-slate">{currentCurrency.code}</span>
                    <span className="text-ramp-sage ml-2">({currentCurrency.symbol})</span>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-ramp-sage transition-transform ${showCurrencyDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showCurrencyDropdown && (
                <div className="absolute z-10 w-full mt-2 bg-white rounded-xl border-2 border-ramp-stone shadow-lg max-h-64 overflow-y-auto">
                  {CURRENCIES.map((currency) => (
                    <button
                      key={currency.code}
                      onClick={() => {
                        setSelectedCurrency(currency.code);
                        setShowCurrencyDropdown(false);
                      }}
                      className={`w-full p-3 text-left hover:bg-ramp-sand transition-colors flex items-center gap-3 ${
                        selectedCurrency === currency.code ? 'bg-ramp-sand' : ''
                      }`}
                    >
                      <span className="text-xl">{currency.flag}</span>
                      <div className="flex-1">
                        <span className="font-medium text-ramp-slate">{currency.code}</span>
                        <span className="text-ramp-sage text-sm ml-2">{currency.name}</span>
                      </div>
                      <span className="text-ramp-gray-600 font-mono">{currency.symbol}</span>
                      {selectedCurrency === currency.code && (
                        <CheckCircle2 className="w-4 h-4 text-ramp-slate" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Info box */}
          {selectedSpendingCategory && (
            <div className="mb-6 p-4 bg-ramp-solar/20 rounded-lg border border-ramp-solar">
              <p className="text-sm text-ramp-slate">
                <strong>{isCustomMode ? 'Custom:' : 'Selected:'}</strong> {selectedSpendingCategory}
              </p>
              <p className="text-xs text-ramp-sage mt-1">
                All generated invoices, receipts, quotes, and contracts will use {currentCurrency.code} ({currentCurrency.symbol}) and be related to this {isCustomMode ? 'description' : 'category'}.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep('summary')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              fullWidth
              onClick={handleContinue}
              disabled={!selectedSpendingCategory}
              className="group"
            >
              <span>Continue to Asset Selection</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          {/* Helper text */}
          <p className="mt-4 text-xs text-ramp-sage text-center">
            This helps generate more realistic and focused demo assets
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
