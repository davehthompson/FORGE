import { useState } from 'react';
import { 
  Receipt, 
  Printer, 
  Sparkles, 
  ArrowLeft, 
  ArrowRight,
  Loader2,
  ChevronDown,
  Plane,
  Hotel,
  Car,
  Utensils,
  ParkingCircle,
  Fuel,
  ShoppingBag,
  CalendarDays,
  Coffee,
  Train,
  FileText,
  Mail
} from 'lucide-react';
import { Button } from '../ui';
import { useStore } from '../../hooks/useStore';
import { generateQuickReceipt } from '../../services/api';
import { CURRENCIES, getCurrency } from '../../utils/currencies';

// Receipt style options - different formats for different use cases
const RECEIPT_STYLES = [
  { id: 'receipt', label: 'Digital', icon: Receipt, description: 'Standard digital receipt' },
  { id: 'paper_receipt', label: 'Thermal', icon: Printer, description: 'POS thermal paper style' },
  { id: 'hotel_folio', label: 'Hotel Folio', icon: FileText, description: 'Hotel checkout folio' },
  { id: 'airline_receipt', label: 'Airline', icon: Mail, description: 'Airline email receipt' },
] as const;

// Map categories to recommended receipt types
const CATEGORY_RECEIPT_MAP: Record<string, 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt'> = {
  flight: 'airline_receipt',
  hotel: 'hotel_folio',
  car_rental: 'receipt',
  rideshare: 'receipt',
  meals: 'receipt',
  coffee: 'paper_receipt',
  parking: 'paper_receipt',
  fuel: 'paper_receipt',
  transit: 'paper_receipt',
  conference: 'receipt',
  supplies: 'paper_receipt',
};

// Expense categories with icons and example prompts
const EXPENSE_CATEGORIES = [
  {
    id: 'flight',
    label: 'Flight',
    icon: Plane,
    description: 'Airline tickets & fees',
    examples: [
      "United Airlines flight from SFO to JFK, economy class, $387. Confirmation UA1234. Passenger: John Smith",
      "Delta round-trip LAX to ATL, basic economy, $452 total. Include baggage fee $35. Confirmation DL5678",
      "Southwest flight from Denver to Chicago Midway, $189 one-way. Wanna Get Away fare. Early bird check-in $25",
    ]
  },
  {
    id: 'hotel',
    label: 'Hotel',
    icon: Hotel,
    description: 'Lodging & accommodations',
    examples: [
      "Marriott Marquis NYC, 2 nights at $329/night. Room 1842. Include parking $65/night and room service $47",
      "Hilton Garden Inn Chicago, 3 nights for business trip. $189/night. Confirmation 84729163. Include incidentals $23",
      "Hyatt Regency San Francisco, 1 night $275. Late checkout fee $50. Mini bar charges $18. Room 2204",
    ]
  },
  {
    id: 'car_rental',
    label: 'Car Rental',
    icon: Car,
    description: 'Vehicle rentals',
    examples: [
      "Hertz car rental at LAX, Toyota Camry, 4 days at $78/day. Include insurance $15/day and fuel prepay $67",
      "Enterprise rental in Dallas, compact car 3 days. $52/day plus taxes. Returned with full tank",
      "Budget car rental SFO airport, midsize SUV, weekly rate $425. Include liability coverage $89",
    ]
  },
  {
    id: 'rideshare',
    label: 'Rideshare/Taxi',
    icon: Car,
    description: 'Uber, Lyft, taxis',
    examples: [
      "Uber from JFK airport to Manhattan hotel, $67.50. UberX. Driver: Michael. Tip included $10",
      "Lyft from downtown Seattle to airport, $42.30 plus $5 tip. Shared ride",
      "Yellow cab from O'Hare to Chicago Loop, $55 metered fare plus $8 tip. Receipt #4729",
    ]
  },
  {
    id: 'meals',
    label: 'Meals',
    icon: Utensils,
    description: 'Business meals & dining',
    examples: [
      "Client dinner at The Capital Grille NYC. 4 guests. 2 steaks, 2 salmon, appetizers, wine. Total $487 with tip",
      "Team lunch at Sweetgreen, 6 salads and drinks, $89.40. Corporate card ending 4521",
      "Business breakfast at hotel restaurant, continental breakfast and coffee, $34.50 including gratuity",
    ]
  },
  {
    id: 'coffee',
    label: 'Coffee/Snacks',
    icon: Coffee,
    description: 'Coffee shops & quick bites',
    examples: [
      "Starbucks grande latte and breakfast sandwich, $14.27. Mobile order. Store #12847 Seattle",
      "Peet's Coffee, 2 drip coffees and 2 pastries, $23.50. Meeting with client",
      "Dunkin' dozen donuts for team meeting and large box of coffee, $31.99",
    ]
  },
  {
    id: 'parking',
    label: 'Parking',
    icon: ParkingCircle,
    description: 'Parking fees',
    examples: [
      "LAX economy parking, 5 days at $20/day. Lot C, space 247. Ticket #892741",
      "Downtown Chicago parking garage, 8 hours at $12/hour max $45. ABC Parking 123 State St",
      "Airport valet parking at SFO, 3 days. $55/day. Confirmation V-89274",
    ]
  },
  {
    id: 'fuel',
    label: 'Gas/Fuel',
    icon: Fuel,
    description: 'Fuel for rental cars',
    examples: [
      "Shell gas station, 14.5 gallons premium at $4.89/gal. Rental car fill-up before return. Austin TX",
      "Chevron fuel, 12 gallons regular $3.79/gal. Pump 7. San Jose CA. Visa ending 8832",
      "BP gas station, filled rental car, 16.2 gallons at $3.45/gal. Chicago IL",
    ]
  },
  {
    id: 'transit',
    label: 'Transit/Rail',
    icon: Train,
    description: 'Trains, metro, bus',
    examples: [
      "Amtrak Acela DC to NYC, business class, $189. Confirmation 8B4K2M. Quiet car",
      "NYC Subway weekly unlimited MetroCard, $33. Purchased at Grand Central",
      "BART airport fare SFO to downtown SF, $10.50. Clipper card reload $20",
    ]
  },
  {
    id: 'conference',
    label: 'Conference/Event',
    icon: CalendarDays,
    description: 'Event registration & fees',
    examples: [
      "AWS re:Invent conference registration, full pass $1,799. Early bird discount applied. Las Vegas",
      "SaaStr Annual conference ticket, $699. Includes workshop day. San Mateo CA",
      "Local tech meetup sponsorship, $250. Includes 2 tickets and logo placement",
    ]
  },
  {
    id: 'supplies',
    label: 'Office Supplies',
    icon: ShoppingBag,
    description: 'Office & work supplies',
    examples: [
      "Staples order: printer paper 5 reams, pens, sticky notes, binder clips. $67.84. Store pickup",
      "Amazon office supplies: monitor stand $45, keyboard $79, mouse pad $12. Business account",
      "Office Depot: presentation folders, labels, shipping supplies. $43.27 for team offsite materials",
    ]
  },
];

export function QuickReceiptPrompt() {
  const { 
    setStep, 
    quickReceiptPrompt,
    setQuickReceiptPrompt,
    quickReceiptType,
    setQuickReceiptType,
    selectedCurrency,
    setSelectedCurrency,
    setGeneratedAsset,
    setCurrentAsset,
    setSelectedAssets,
    setIsLoading,
    isLoading,
    setError,
    error
  } = useStore();

  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const currentCurrency = getCurrency(selectedCurrency) || CURRENCIES[0];

  const handleGenerate = async () => {
    if (!quickReceiptPrompt.trim()) {
      setError('Please enter a description for your receipt');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGenerationStatus('Analyzing your description...');

    try {
      // Include category hint in the prompt for better generation
      const enhancedPrompt = selectedCategory 
        ? `[Category: ${selectedCategory}] ${quickReceiptPrompt}`
        : quickReceiptPrompt;

      const receiptData = await generateQuickReceipt(
        enhancedPrompt,
        quickReceiptType,
        selectedCurrency,
        (status) => setGenerationStatus(status)
      );

      setGeneratedAsset(quickReceiptType, receiptData);
      setCurrentAsset(quickReceiptType);
      setSelectedAssets([quickReceiptType]);
      setStep('editor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate receipt');
    } finally {
      setIsLoading(false);
      setGenerationStatus(null);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(categoryId);
      // Auto-switch to the recommended receipt type for this category
      const recommendedType = CATEGORY_RECEIPT_MAP[categoryId];
      if (recommendedType) {
        setQuickReceiptType(recommendedType);
      }
    }
  };

  const handleExampleClick = (example: string) => {
    setQuickReceiptPrompt(example);
  };

  const selectedCategoryData = EXPENSE_CATEGORIES.find(c => c.id === selectedCategory);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg border border-ramp-stone overflow-hidden flex">
        {/* Left column - Categories */}
        <div className="w-64 flex-shrink-0 border-r border-ramp-stone bg-ramp-sand/30 flex flex-col">
          <div className="p-4 border-b border-ramp-stone">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-ramp-solar/20">
                <Receipt className="w-4 h-4 text-ramp-slate" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-ramp-slate">Category</h2>
                <p className="text-ramp-sage text-xs">Select expense type</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {EXPENSE_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryClick(category.id)}
                  disabled={isLoading}
                  className={`w-full px-3 py-2 rounded-lg text-left transition-all duration-200 flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-white border border-ramp-slate shadow-sm'
                      : 'border border-transparent hover:bg-white/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-ramp-slate' : 'text-ramp-gray-500'}`} />
                  <span className={`text-sm ${isSelected ? 'font-medium text-ramp-slate' : 'text-ramp-gray-700'}`}>
                    {category.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column - Form */}
        <div className="flex-1 p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-ramp-slate">Quick Receipt Generator</h1>
              <p className="text-ramp-sage text-sm">Describe your expense and we'll generate a receipt</p>
            </div>
            <button
              onClick={() => setStep('home')}
              disabled={isLoading}
              className="text-sm text-ramp-sage hover:text-ramp-slate transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>

          {/* Receipt Style + Currency row */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ramp-sage mb-1.5 uppercase tracking-wide">
                Receipt Style
              </label>
              <div className="flex gap-1.5">
                {RECEIPT_STYLES.map((style) => {
                  const Icon = style.icon;
                  const isSelected = quickReceiptType === style.id;
                  return (
                    <button
                      key={style.id}
                      onClick={() => setQuickReceiptType(style.id as typeof quickReceiptType)}
                      disabled={isLoading}
                      className={`flex-1 py-2 px-2 rounded-lg border text-center transition-all ${
                        isSelected
                          ? 'border-ramp-slate bg-ramp-sand'
                          : 'border-ramp-stone hover:border-ramp-gray-400 bg-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mx-auto mb-0.5 ${isSelected ? 'text-ramp-slate' : 'text-ramp-gray-500'}`} />
                      <p className={`text-xs font-medium ${isSelected ? 'text-ramp-slate' : 'text-ramp-gray-600'}`}>
                        {style.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-44">
              <label className="block text-xs font-medium text-ramp-sage mb-1.5 uppercase tracking-wide">
                Currency
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                  disabled={isLoading}
                  className="w-full py-2 px-3 rounded-lg border border-ramp-stone hover:border-ramp-gray-400 bg-white text-left transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{currentCurrency.flag}</span>
                    <span className="font-medium text-ramp-slate text-sm">{currentCurrency.code}</span>
                    <span className="text-ramp-sage text-xs">{currentCurrency.symbol}</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-ramp-sage transition-transform ${showCurrencyDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showCurrencyDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-white rounded-lg border border-ramp-stone shadow-lg max-h-48 overflow-y-auto">
                    {CURRENCIES.map((currency) => (
                      <button
                        key={currency.code}
                        onClick={() => {
                          setSelectedCurrency(currency.code);
                          setShowCurrencyDropdown(false);
                        }}
                        className={`w-full p-2 text-left hover:bg-ramp-sand transition-colors flex items-center gap-2 text-sm ${
                          selectedCurrency === currency.code ? 'bg-ramp-sand' : ''
                        }`}
                      >
                        <span>{currency.flag}</span>
                        <span className="font-medium text-ramp-slate">{currency.code}</span>
                        <span className="text-ramp-sage text-xs">{currency.symbol}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Example prompts for selected category */}
          {selectedCategoryData && (
            <div className="p-3 bg-ramp-sand/40 rounded-lg">
              <p className="text-xs font-medium text-ramp-slate mb-1.5">
                Try an example:
              </p>
              <div className="space-y-1">
                {selectedCategoryData.examples.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(example)}
                    disabled={isLoading}
                    className="w-full text-left text-xs p-2 bg-white rounded border border-ramp-stone hover:border-ramp-gray-400 transition-colors text-ramp-gray-700 hover:text-ramp-slate"
                  >
                    {example.slice(0, 140)}{example.length > 140 ? '...' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Input */}
          <div>
            <label className="block text-xs font-medium text-ramp-sage mb-1.5 uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={quickReceiptPrompt}
              onChange={(e) => setQuickReceiptPrompt(e.target.value)}
              placeholder={selectedCategoryData 
                ? `Describe your ${selectedCategoryData.label.toLowerCase()} expense in detail — include vendor, amounts, dates, and any specifics...`
                : "Select a category or describe any expense..."}
              className="w-full h-28 px-4 py-3 bg-white border border-ramp-stone rounded-lg text-ramp-slate placeholder:text-ramp-gray-500 transition-colors duration-200 hover:border-ramp-gray-500 focus:outline-none focus:border-ramp-slate focus:ring-2 focus:ring-ramp-slate/20 resize-none text-sm"
              disabled={isLoading}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Generation Status */}
          {isLoading && generationStatus && (
            <div className="p-3 bg-ramp-solar/20 border border-ramp-solar rounded-lg">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-ramp-slate animate-spin" />
                <p className="text-sm text-ramp-slate">{generationStatus}</p>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <Button
            fullWidth
            onClick={handleGenerate}
            disabled={isLoading || !quickReceiptPrompt.trim()}
            className="group"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                <span>Generate Receipt</span>
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
