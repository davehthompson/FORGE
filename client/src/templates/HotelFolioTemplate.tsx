import { useState } from 'react';
import type { HotelFolioData } from '../types';
import { getLogoUrl } from '../utils/logo';
import { normalizeDomain } from '../utils/domain';
import { useLogoColors, getLighterColor, getColorWithOpacity } from '../hooks/useLogoColors';
import { formatWithSymbol } from '../utils/currencies';
import { CompanyLogo } from '../components/ui';

interface HotelFolioTemplateProps {
  data: HotelFolioData;
  scale?: number;
  currency?: string;
}

export function HotelFolioTemplate({ data, scale = 1, currency = 'USD' }: HotelFolioTemplateProps) {
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };

  const hotelDomain = normalizeDomain(data.hotel.domain);
  const hotelLogoUrl =
    data.hotel.logoUrl ||
    (hotelDomain ? getLogoUrl(hotelDomain, { size: 80 }) : null);
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(hotelLogoUrl);
  const logoColors = useLogoColors(resolvedLogoUrl);

  const accentColor = logoColors?.primary || '#1a365d';
  const accentBgColor = logoColors 
    ? getLighterColor(logoColors.primaryRgb, 0.95) 
    : '#f7fafc';
  const accentBorderColor = logoColors
    ? getColorWithOpacity(logoColors.primaryRgb, 0.2)
    : '#e2e8f0';

  // Group charges by category
  const roomCharges = data.charges.filter(c => c.category === 'Room');
  const incidentalCharges = data.charges.filter(c => c.category !== 'Room');

  return (
    <div 
      className="bg-white shadow-lg font-sans"
      style={{ 
        width: '794px', 
        minHeight: '1123px',
        padding: '40px 48px',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-6" style={{ borderBottom: `2px solid ${accentColor}` }}>
        <div className="flex items-start gap-4">
          {hotelLogoUrl && (
            <CompanyLogo
              src={hotelLogoUrl}
              name={data.hotel.name}
              size={64}
              onLoaded={setResolvedLogoUrl}
            />
          )}
          <div>
            <h1 className="text-2xl font-bold" style={{ color: accentColor }}>
              {data.hotel.name}
            </h1>
            {data.hotel.brand && (
              <p className="text-sm text-gray-500">{data.hotel.brand}</p>
            )}
            <p className="text-sm text-gray-600 mt-1">
              {data.hotel.address}<br />
              {data.hotel.city}, {data.hotel.state} {data.hotel.zip}
            </p>
            <p className="text-sm text-gray-600">{data.hotel.phone}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold" style={{ color: accentColor }}>GUEST FOLIO</h2>
          <p className="text-sm text-gray-600 mt-2">Folio #: {data.folioNumber}</p>
          <p className="text-sm text-gray-600">Confirmation: {data.confirmation}</p>
        </div>
      </div>

      {/* Guest & Stay Info */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="p-4 rounded-lg" style={{ backgroundColor: accentBgColor, border: `1px solid ${accentBorderColor}` }}>
          <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: accentColor }}>
            Guest Information
          </h3>
          <p className="font-semibold text-gray-900">{data.guest.name}</p>
          {data.guest.email && <p className="text-sm text-gray-600">{data.guest.email}</p>}
          {data.guest.loyaltyNumber && (
            <div className="mt-2">
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: accentColor, color: 'white' }}>
                {data.guest.loyaltyTier || 'Member'} #{data.guest.loyaltyNumber}
              </span>
            </div>
          )}
        </div>
        <div className="p-4 rounded-lg" style={{ backgroundColor: accentBgColor, border: `1px solid ${accentBorderColor}` }}>
          <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: accentColor }}>
            Stay Details
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Check-In</p>
              <p className="font-semibold text-gray-900">{data.checkIn}</p>
            </div>
            <div>
              <p className="text-gray-500">Check-Out</p>
              <p className="font-semibold text-gray-900">{data.checkOut}</p>
            </div>
            <div>
              <p className="text-gray-500">Room</p>
              <p className="font-semibold text-gray-900">{data.roomNumber}</p>
            </div>
            <div>
              <p className="text-gray-500">Room Type</p>
              <p className="font-semibold text-gray-900">{data.roomType}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charges Table */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: accentColor }}>
          Itemized Charges
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: accentBgColor }}>
              <th className="text-left p-3 font-semibold" style={{ color: accentColor }}>Date</th>
              <th className="text-left p-3 font-semibold" style={{ color: accentColor }}>Description</th>
              <th className="text-right p-3 font-semibold" style={{ color: accentColor }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Room Charges */}
            {roomCharges.length > 0 && (
              <>
                <tr>
                  <td colSpan={3} className="p-2 font-semibold text-gray-700 bg-gray-50">
                    Room Charges
                  </td>
                </tr>
                {roomCharges.map((charge, index) => (
                  <tr key={`room-${index}`} style={{ borderBottom: `1px solid ${accentBorderColor}` }}>
                    <td className="p-3 text-gray-600">{charge.date}</td>
                    <td className="p-3 text-gray-800">{charge.description}</td>
                    <td className="p-3 text-right text-gray-800">{formatCurrency(charge.amount)}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: accentBgColor }}>
                  <td colSpan={2} className="p-3 text-right font-semibold">Room Subtotal</td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(data.roomTotal)}</td>
                </tr>
              </>
            )}
            
            {/* Incidental Charges */}
            {incidentalCharges.length > 0 && (
              <>
                <tr>
                  <td colSpan={3} className="p-2 font-semibold text-gray-700 bg-gray-50 mt-2">
                    Incidentals & Other Charges
                  </td>
                </tr>
                {incidentalCharges.map((charge, index) => (
                  <tr key={`inc-${index}`} style={{ borderBottom: `1px solid ${accentBorderColor}` }}>
                    <td className="p-3 text-gray-600">{charge.date}</td>
                    <td className="p-3 text-gray-800">{charge.description}</td>
                    <td className="p-3 text-right text-gray-800">{formatCurrency(charge.amount)}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: accentBgColor }}>
                  <td colSpan={2} className="p-3 text-right font-semibold">Incidentals Subtotal</td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(data.incidentalsTotal)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Taxes & Total */}
      <div className="flex justify-end mb-8">
        <div className="w-80">
          <div className="p-4 rounded-lg" style={{ backgroundColor: accentBgColor, border: `1px solid ${accentBorderColor}` }}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Room Total ({data.nights} nights)</span>
                <span className="text-gray-800">{formatCurrency(data.roomTotal)}</span>
              </div>
              {data.incidentalsTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Incidentals</span>
                  <span className="text-gray-800">{formatCurrency(data.incidentalsTotal)}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2" style={{ borderColor: accentBorderColor }}>
                {data.taxes.map((tax, index) => (
                  <div key={index} className="flex justify-between text-gray-600">
                    <span>{tax.name} {tax.rate ? `(${(tax.rate * 100).toFixed(1)}%)` : ''}</span>
                    <span>{formatCurrency(tax.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t" style={{ borderColor: accentColor }}>
                <span>Tax Total</span>
                <span>{formatCurrency(data.taxTotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-3 mt-2 border-t-2" style={{ color: accentColor, borderColor: accentColor }}>
                <span>TOTAL</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: accentBgColor, border: `1px solid ${accentBorderColor}` }}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: accentColor }}>
              Payment Received
            </h3>
            <p className="text-gray-700">
              {data.payment.method}
              {data.payment.cardType && ` - ${data.payment.cardType}`}
              {data.payment.cardLast4 && ` ending in ${data.payment.cardLast4}`}
            </p>
            <p className="text-sm text-gray-500">Processed on {data.payment.date}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Amount Paid</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>{formatCurrency(data.total)}</p>
          </div>
        </div>
      </div>

      {/* Points Earned */}
      {data.pointsEarned && (
        <div className="text-center p-3 rounded-lg" style={{ backgroundColor: accentBgColor }}>
          <p className="text-sm">
            <span className="font-semibold" style={{ color: accentColor }}>{data.pointsEarned.toLocaleString()} points</span>
            <span className="text-gray-600"> earned on this stay</span>
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 text-center text-xs text-gray-500" style={{ borderTop: `1px solid ${accentBorderColor}` }}>
        <p>Thank you for staying with {data.hotel.name}</p>
        <p className="mt-1">Questions about this folio? Contact us at {data.hotel.phone} or {data.hotel.email || `info@${data.hotel.domain}`}</p>
      </div>
    </div>
  );
}
