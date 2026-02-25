import type { AirlineReceiptData } from '../types';
import { getLogoUrl } from '../utils/logo';
import { useLogoColors, getLighterColor, getColorWithOpacity } from '../hooks/useLogoColors';
import { formatWithSymbol } from '../utils/currencies';
import { Plane, Calendar, User, CreditCard } from 'lucide-react';

interface AirlineReceiptTemplateProps {
  data: AirlineReceiptData;
  scale?: number;
  currency?: string;
}

export function AirlineReceiptTemplate({ data, scale = 1, currency = 'USD' }: AirlineReceiptTemplateProps) {
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };

  const airlineLogoUrl = data.airline.domain ? getLogoUrl(data.airline.domain, { size: 80 }) : null;
  const logoColors = useLogoColors(airlineLogoUrl);

  const accentColor = logoColors?.primary || '#0033a0';
  const accentBgColor = logoColors 
    ? getLighterColor(logoColors.primaryRgb, 0.95) 
    : '#f0f4ff';
  const accentBorderColor = logoColors
    ? getColorWithOpacity(logoColors.primaryRgb, 0.2)
    : '#c7d2fe';

  return (
    <div 
      className="bg-white shadow-lg font-sans"
      style={{ 
        width: '650px', 
        minHeight: '900px',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* Email Header Bar */}
      <div className="px-8 py-4" style={{ backgroundColor: accentColor }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {airlineLogoUrl && (
              <img 
                src={airlineLogoUrl} 
                alt={`${data.airline.name} logo`}
                className="w-10 h-10 object-contain bg-white rounded p-1"
                crossOrigin="anonymous"
              />
            )}
            <span className="text-white font-bold text-xl">{data.airline.name}</span>
          </div>
          <span className="text-white/80 text-sm">Electronic Receipt</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Confirmation Banner */}
        <div className="text-center mb-8 pb-6" style={{ borderBottom: `2px solid ${accentBorderColor}` }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ backgroundColor: accentBgColor }}>
            <Plane className="w-5 h-5" style={{ color: accentColor }} />
            <span className="font-semibold" style={{ color: accentColor }}>Your Trip is Confirmed!</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Confirmation: <span style={{ color: accentColor }}>{data.confirmationCode}</span>
          </h1>
          {data.ticketNumber && (
            <p className="text-gray-500">Ticket Number: {data.ticketNumber}</p>
          )}
        </div>

        {/* Passenger Info */}
        <div className="flex items-start gap-4 mb-6 p-4 rounded-lg" style={{ backgroundColor: accentBgColor }}>
          <User className="w-5 h-5 mt-0.5" style={{ color: accentColor }} />
          <div>
            <p className="font-semibold text-gray-900">{data.passenger.name}</p>
            {data.passenger.frequentFlyer && (
              <p className="text-sm text-gray-600">
                {data.airline.name} {data.passenger.tierStatus || ''} #{data.passenger.frequentFlyer}
              </p>
            )}
          </div>
        </div>

        {/* Flight Details */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: accentColor }}>
            <Calendar className="w-5 h-5" />
            Flight Details
          </h2>
          
          {data.flights.map((flight, index) => (
            <div 
              key={index} 
              className="mb-4 p-5 rounded-lg border"
              style={{ borderColor: accentBorderColor, backgroundColor: 'white' }}
            >
              {/* Flight Number & Date Row */}
              <div className="flex justify-between items-center mb-4 pb-3" style={{ borderBottom: `1px solid ${accentBorderColor}` }}>
                <div>
                  <span className="text-sm text-gray-500">Flight</span>
                  <p className="font-bold text-lg" style={{ color: accentColor }}>{flight.flightNumber}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-500">Date</span>
                  <p className="font-semibold text-gray-900">{flight.date}</p>
                </div>
              </div>

              {/* Route */}
              <div className="flex flex-col items-center">
                <div className="flex items-start justify-between w-full">
                  {/* Departure */}
                  <div className="text-center flex-1">
                    <p className="text-3xl font-bold text-gray-900">{flight.departure.code}</p>
                    <p className="text-sm text-gray-600 max-w-[140px] mx-auto">{flight.departure.airport}</p>
                    {flight.departure.terminal && (
                      <p className="text-xs text-gray-500 mt-1">
                        Terminal {flight.departure.terminal}
                        {flight.departure.gate && ` · Gate ${flight.departure.gate}`}
                      </p>
                    )}
                  </div>

                  {/* Arrow/Connector */}
                  <div className="px-2 flex flex-col items-center justify-center pt-2">
                    <div className="w-20 border-t-2 border-dashed relative" style={{ borderColor: accentColor }}>
                      <Plane 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white" 
                        style={{ color: accentColor }} 
                      />
                    </div>
                  </div>

                  {/* Arrival */}
                  <div className="text-center flex-1">
                    <p className="text-3xl font-bold text-gray-900">{flight.arrival.code}</p>
                    <p className="text-sm text-gray-600 max-w-[140px] mx-auto">{flight.arrival.airport}</p>
                    {flight.arrival.terminal && (
                      <p className="text-xs text-gray-500 mt-1">Terminal {flight.arrival.terminal}</p>
                    )}
                  </div>
                </div>

                {/* Duration - Below the route line */}
                {flight.duration && (
                  <div className="mt-2 px-3 py-1 rounded-full text-xs text-gray-500" style={{ backgroundColor: accentBgColor }}>
                    {flight.duration}
                  </div>
                )}

                {/* Times Row */}
                <div className="flex justify-between w-full mt-3 px-4">
                  <div className="text-center flex-1">
                    <p className="text-lg font-semibold" style={{ color: accentColor }}>{flight.departure.time}</p>
                  </div>
                  <div className="flex-1"></div>
                  <div className="text-center flex-1">
                    <p className="text-lg font-semibold" style={{ color: accentColor }}>{flight.arrival.time}</p>
                  </div>
                </div>
              </div>

              {/* Class & Seat Info */}
              <div className="flex justify-center gap-6 mt-4 pt-3" style={{ borderTop: `1px solid ${accentBorderColor}` }}>
                <div className="text-center">
                  <span className="text-xs text-gray-500">Class</span>
                  <p className="font-semibold text-gray-900">{flight.class}</p>
                </div>
                {flight.seat && (
                  <div className="text-center">
                    <span className="text-xs text-gray-500">Seat</span>
                    <p className="font-semibold text-gray-900">{flight.seat}</p>
                  </div>
                )}
                {flight.aircraft && (
                  <div className="text-center">
                    <span className="text-xs text-gray-500">Aircraft</span>
                    <p className="font-semibold text-gray-900">{flight.aircraft}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Fare Breakdown */}
        <div className="mb-8 p-5 rounded-lg" style={{ backgroundColor: accentBgColor }}>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: accentColor }}>
            <CreditCard className="w-5 h-5" />
            Payment Summary
          </h2>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Base Fare</span>
              <span className="text-gray-900">{formatCurrency(data.fareBreakdown.baseFare)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Taxes</span>
              <span className="text-gray-900">{formatCurrency(data.fareBreakdown.taxes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Carrier-Imposed Fees</span>
              <span className="text-gray-900">{formatCurrency(data.fareBreakdown.fees)}</span>
            </div>
            {data.fareBreakdown.baggage && data.fareBreakdown.baggage > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Checked Baggage</span>
                <span className="text-gray-900">{formatCurrency(data.fareBreakdown.baggage)}</span>
              </div>
            )}
            {data.fareBreakdown.seatSelection && data.fareBreakdown.seatSelection > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Seat Selection</span>
                <span className="text-gray-900">{formatCurrency(data.fareBreakdown.seatSelection)}</span>
              </div>
            )}
            {data.fareBreakdown.other && data.fareBreakdown.other > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Other Services</span>
                <span className="text-gray-900">{formatCurrency(data.fareBreakdown.other)}</span>
              </div>
            )}
            <div className="flex justify-between pt-3 mt-2 border-t text-lg font-bold" style={{ borderColor: accentColor, color: accentColor }}>
              <span>Total Charged</span>
              <span>{formatCurrency(data.total)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: accentBorderColor }}>
            <p className="text-sm text-gray-600">
              Paid with {data.payment.method}
              {data.payment.cardType && ` (${data.payment.cardType}`}
              {data.payment.cardLast4 && ` ending in ${data.payment.cardLast4})`}
            </p>
          </div>
        </div>

        {/* Miles Earned */}
        {data.milesEarned && (
          <div className="text-center p-4 rounded-lg mb-6" style={{ backgroundColor: accentBgColor }}>
            <p className="text-sm text-gray-600">Estimated miles to be earned</p>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>
              {data.milesEarned.toLocaleString()} miles
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 pt-6" style={{ borderTop: `1px solid ${accentBorderColor}` }}>
          <p>This is your electronic receipt for travel on {data.airline.name}</p>
          <p className="mt-1">Booked on {data.bookingDate}</p>
          <p className="mt-3">
            For questions or changes, visit <span style={{ color: accentColor }}>{data.airline.domain}</span> or contact customer service
          </p>
        </div>
      </div>
    </div>
  );
}
