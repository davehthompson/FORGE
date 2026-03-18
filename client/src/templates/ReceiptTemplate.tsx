import type { ReceiptData } from '../types';
import { getLogoUrl } from '../utils/logo';
import { useLogoColors, getColorWithOpacity } from '../hooks/useLogoColors';
import { formatWithSymbol } from '../utils/currencies';

interface ReceiptTemplateProps {
  data: ReceiptData;
  scale?: number;
  currency?: string;
}

export function ReceiptTemplate({ data, scale = 1, currency = 'USD' }: ReceiptTemplateProps) {
  // Format currency helper using the selected currency
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };
  const vendorLogoUrl = data.vendor.domain ? getLogoUrl(data.vendor.domain, { size: 48 }) : null;
  const logoColors = useLogoColors(vendorLogoUrl);

  // Use logo colors or fall back to defaults
  const accentColor = logoColors?.primary || '#3D3D3D';
  const accentBorderColor = logoColors
    ? getColorWithOpacity(logoColors.primaryRgb, 0.4)
    : '#E0DDD8';

  return (
    <div 
      className="bg-white shadow-lg"
      style={{ 
        width: 400, 
        minHeight: 600, 
        padding: 32,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* Header */}
      <div 
        className="text-center mb-6 pb-6"
        style={{ borderBottom: `2px dashed ${accentBorderColor}` }}
      >
        {vendorLogoUrl && (
          <img 
            src={vendorLogoUrl} 
            alt={`${data.vendor.name} logo`}
            className="w-12 h-12 object-contain mx-auto mb-2 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <h1 
          className="text-xl font-bold"
          style={{ color: accentColor }}
        >
          {data.vendor.name}
        </h1>
        <p className="text-sm text-ramp-gray-600 mt-1">{data.vendor.address}</p>
      </div>

      {/* Receipt Info */}
      <div className="flex justify-between text-sm mb-6">
        <div>
          <p className="text-ramp-gray-600">Receipt #</p>
          <p className="font-medium text-ramp-slate">{data.receiptNumber}</p>
        </div>
        <div className="text-right">
          <p className="text-ramp-gray-600">Date</p>
          <p className="font-medium text-ramp-slate">{data.date}</p>
        </div>
      </div>

      {/* Items */}
      <div className="mb-6">
        <div 
          className="pb-2 mb-2"
          style={{ borderBottom: `1px solid ${accentBorderColor}` }}
        >
          <div 
            className="flex justify-between text-xs uppercase tracking-wide font-semibold"
            style={{ color: accentColor }}
          >
            <span>Item</span>
            <span>Amount</span>
          </div>
        </div>
        {data.items.map((item, index) => (
          <div key={index} className="flex justify-between py-2 text-sm">
            <div>
              <p className="text-ramp-slate">{item.description}</p>
              <p className="text-ramp-gray-500 text-xs">Qty: {item.quantity} @ {formatCurrency(item.price)}</p>
            </div>
            <span className="text-ramp-slate">{formatCurrency(item.quantity * item.price)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div 
        className="pt-4 mb-6"
        style={{ borderTop: `2px dashed ${accentBorderColor}` }}
      >
        <div className="flex justify-between text-sm py-1">
          <span className="text-ramp-gray-600">Subtotal</span>
          <span className="text-ramp-slate">{formatCurrency(data.subtotal)}</span>
        </div>
        {data.taxes?.length ? data.taxes.map((t, i) => (
          <div key={i} className="flex justify-between text-sm py-1">
            <span className="text-ramp-gray-600">{t.name}{t.rate ? ` (${(t.rate * 100).toFixed(1)}%)` : ''}</span>
            <span className="text-ramp-slate">{formatCurrency(t.amount)}</span>
          </div>
        )) : (
          <div className="flex justify-between text-sm py-1">
            <span className="text-ramp-gray-600">Tax</span>
            <span className="text-ramp-slate">{formatCurrency(data.tax)}</span>
          </div>
        )}
        {data.tip !== undefined && data.tip > 0 && (
          <div className="flex justify-between text-sm py-1">
            <span className="text-ramp-gray-600">Tip</span>
            <span className="text-ramp-slate">{formatCurrency(data.tip)}</span>
          </div>
        )}
        <div 
          className="flex justify-between py-2 mt-2"
          style={{ borderTop: `1px solid ${accentColor}` }}
        >
          <span className="font-bold" style={{ color: accentColor }}>TOTAL</span>
          <span className="font-bold text-lg" style={{ color: accentColor }}>{formatCurrency(data.total)}</span>
        </div>
      </div>

      {/* Payment Method */}
      <div 
        className="text-center pt-4"
        style={{ borderTop: `2px dashed ${accentBorderColor}` }}
      >
        <p 
          className="text-xs uppercase tracking-wide mb-1"
          style={{ color: accentColor }}
        >
          Payment Method
        </p>
        <p className="text-sm font-medium text-ramp-slate">
          {data.paymentMethod}
          {data.cardLast4 && ` •••• ${data.cardLast4}`}
        </p>
      </div>

      {/* Footer */}
      <div 
        className="text-center mt-6 pt-4"
        style={{ borderTop: `1px solid ${accentBorderColor}` }}
      >
        <p className="text-xs text-ramp-gray-500">Thank you for your business!</p>
      </div>
    </div>
  );
}
