import type { QuoteData } from '../types';
import { getLogoUrl } from '../utils/logo';
import { useLogoColors, getLighterColor, getColorWithOpacity } from '../hooks/useLogoColors';
import { formatWithSymbol } from '../utils/currencies';

interface QuoteTemplateProps {
  data: QuoteData;
  scale?: number;
  currency?: string;
}

export function QuoteTemplate({ data, scale = 1, currency = 'USD' }: QuoteTemplateProps) {
  // Format currency helper using the selected currency
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };
  const vendorLogoUrl = data.vendor.domain ? getLogoUrl(data.vendor.domain, { size: 64 }) : null;
  const logoColors = useLogoColors(vendorLogoUrl);

  // Use logo colors or fall back to defaults
  const accentColor = logoColors?.primary || '#3D3D3D';
  const accentBgColor = logoColors 
    ? getLighterColor(logoColors.primaryRgb, 0.92) 
    : '#F4F3EF';
  const accentBorderColor = logoColors
    ? getColorWithOpacity(logoColors.primaryRgb, 0.3)
    : '#E0DDD8';

  return (
    <div 
      className="bg-white shadow-lg"
      style={{ 
        width: 794, 
        minHeight: 1123, 
        padding: 48,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div className="flex items-start gap-4">
          {vendorLogoUrl && (
            <img 
              src={vendorLogoUrl} 
              alt={`${data.vendor.name} logo`}
              className="w-16 h-16 object-contain rounded-lg"
              style={{ border: `2px solid ${accentBorderColor}` }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div>
            <h1 
              className="text-2xl font-bold"
              style={{ color: accentColor }}
            >
              {data.vendor.name}
            </h1>
            <p className="text-sm text-ramp-gray-600 mt-1 whitespace-pre-line">
              {data.vendor.address}
            </p>
            <p className="text-sm text-ramp-gray-600">{data.vendor.email}</p>
            <p className="text-sm text-ramp-gray-600">{data.vendor.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 
            className="text-2xl font-bold"
            style={{ color: accentColor }}
          >
            QUOTE
          </h2>
          <p className="text-sm text-ramp-gray-600 mt-1">{data.quoteNumber}</p>
          <p className="text-sm text-ramp-gray-600">Date: {data.date}</p>
          <div 
            className="mt-2 inline-block px-3 py-1 rounded text-sm font-semibold"
            style={{ 
              backgroundColor: accentBgColor,
              color: accentColor,
              border: `1px solid ${accentBorderColor}`,
            }}
          >
            Valid until {data.validUntil}
          </div>
        </div>
      </div>

      {/* Prepared For */}
      <div className="mb-8">
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-2"
          style={{ color: accentColor }}
        >
          Prepared For
        </p>
        <p className="font-bold text-ramp-slate">{data.client.name}</p>
        <p className="text-sm text-ramp-gray-600 whitespace-pre-line">{data.client.address}</p>
        <p className="text-sm text-ramp-gray-600">{data.client.email}</p>
      </div>

      {/* Items Table */}
      <table className="w-full mb-8">
        <thead>
          <tr style={{ backgroundColor: accentBgColor }}>
            <th 
              className="text-left p-3 text-xs uppercase tracking-wide font-semibold"
              style={{ color: accentColor }}
            >
              Description
            </th>
            <th 
              className="text-right p-3 text-xs uppercase tracking-wide font-semibold"
              style={{ color: accentColor }}
            >
              Qty
            </th>
            <th 
              className="text-right p-3 text-xs uppercase tracking-wide font-semibold"
              style={{ color: accentColor }}
            >
              Unit Price
            </th>
            <th 
              className="text-right p-3 text-xs uppercase tracking-wide font-semibold"
              style={{ color: accentColor }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr 
              key={index} 
              style={{ borderBottom: `1px solid ${accentBorderColor}` }}
            >
              <td className="p-3 text-ramp-slate">{item.description}</td>
              <td className="p-3 text-right text-ramp-slate">{item.quantity}</td>
              <td className="p-3 text-right text-ramp-slate">{formatCurrency(item.unitPrice)}</td>
              <td className="p-3 text-right text-ramp-slate">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-72">
          <div 
            className="flex justify-between py-2"
            style={{ borderBottom: `1px solid ${accentBorderColor}` }}
          >
            <span className="text-ramp-gray-600">Subtotal</span>
            <span className="text-ramp-slate">{formatCurrency(data.subtotal)}</span>
          </div>
          {(data.discount ?? 0) > 0 && (
            <div 
              className="flex justify-between py-2 text-ramp-rust"
              style={{ borderBottom: `1px solid ${accentBorderColor}` }}
            >
              <span>Discount</span>
              <span>-{formatCurrency(data.discount)}</span>
            </div>
          )}
          <div 
            className="flex justify-between py-3 mt-2"
            style={{ borderTop: `2px solid ${accentColor}` }}
          >
            <span className="font-bold text-lg" style={{ color: accentColor }}>Total</span>
            <span className="font-bold text-lg" style={{ color: accentColor }}>{formatCurrency(data.total)}</span>
          </div>
        </div>
      </div>

      {/* Terms & Notes */}
      <div 
        className="rounded-lg p-4"
        style={{ 
          backgroundColor: accentBgColor,
          border: `1px solid ${accentBorderColor}`,
        }}
      >
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-2"
          style={{ color: accentColor }}
        >
          Terms & Conditions
        </p>
        <p className="text-sm text-ramp-slate">{data.terms}</p>
        {data.notes && (
          <p 
            className="text-sm text-ramp-slate mt-3 pt-3"
            style={{ borderTop: `1px solid ${accentBorderColor}` }}
          >
            {data.notes}
          </p>
        )}
      </div>
    </div>
  );
}
