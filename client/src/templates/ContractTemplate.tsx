import { useState } from 'react';
import type { ContractData } from '../types';
import { getLogoUrl } from '../utils/logo';
import { normalizeDomain } from '../utils/domain';
import { useLogoColors, getLighterColor, getColorWithOpacity } from '../hooks/useLogoColors';
import { formatWithSymbol } from '../utils/currencies';
import { CompanyLogo } from '../components/ui';

interface ContractTemplateProps {
  data: ContractData;
  scale?: number;
  currency?: string;
}

export function ContractTemplate({ data, scale = 1, currency = 'USD' }: ContractTemplateProps) {
  // Format currency helper using the selected currency
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };
  const providerDomain = normalizeDomain(data.parties.provider.domain);
  const providerLogoUrl =
    data.parties.provider.logoUrl ||
    (providerDomain ? getLogoUrl(providerDomain, { size: 48 }) : null);
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(providerLogoUrl);
  const logoColors = useLogoColors(resolvedLogoUrl);

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
      <div 
        className="flex justify-between items-start mb-8 pb-6"
        style={{ borderBottom: `2px solid ${accentColor}` }}
      >
        <div>
          <h1 
            className="text-3xl font-bold"
            style={{ color: accentColor }}
          >
            SERVICE AGREEMENT
          </h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-ramp-gray-600">{data.contractNumber}</p>
          <p className="text-sm text-ramp-gray-600">Date: {data.date}</p>
          {data.quoteReference && (
            <p className="text-xs text-ramp-spring mt-2">Based on Quote: {data.quoteReference}</p>
          )}
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <p 
            className="text-xs uppercase tracking-wide font-semibold mb-2"
            style={{ color: accentColor }}
          >
            Service Provider
          </p>
          <div className="flex items-start gap-3">
            {providerLogoUrl && (
              <CompanyLogo
                src={providerLogoUrl}
                name={data.parties.provider.name}
                size={48}
                className="rounded-lg flex-shrink-0"
                style={{ border: `2px solid ${accentBorderColor}` }}
                onLoaded={setResolvedLogoUrl}
              />
            )}
            <div>
              <p className="font-bold text-ramp-slate">{data.parties.provider.name}</p>
              <p className="text-sm text-ramp-gray-600 whitespace-pre-line">{data.parties.provider.address}</p>
              <p className="text-sm text-ramp-gray-600 mt-1">
                Representative: {data.parties.provider.representative}
              </p>
            </div>
          </div>
        </div>
        <div>
          <p 
            className="text-xs uppercase tracking-wide font-semibold mb-2"
            style={{ color: accentColor }}
          >
            Client
          </p>
          <p className="font-bold text-ramp-slate">{data.parties.client.name}</p>
          <p className="text-sm text-ramp-gray-600 whitespace-pre-line">{data.parties.client.address}</p>
          <p className="text-sm text-ramp-gray-600 mt-1">
            Representative: {data.parties.client.representative}
          </p>
        </div>
      </div>

      {/* Contract Period */}
      <div 
        className="mb-8 p-4 rounded-lg"
        style={{ 
          backgroundColor: accentBgColor,
          border: `1px solid ${accentBorderColor}`,
        }}
      >
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-3"
          style={{ color: accentColor }}
        >
          Contract Period
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-ramp-gray-600">Effective Date</p>
            <p className="font-semibold text-ramp-slate">{data.effectiveDate}</p>
          </div>
          <div>
            <p className="text-sm text-ramp-gray-600">Expiration Date</p>
            <p className="font-semibold text-ramp-slate">{data.expirationDate}</p>
          </div>
          {data.lastDateToAction && (
            <div>
              <p className="text-sm text-ramp-gray-600">Last Date to Action</p>
              <p className="font-semibold text-ramp-slate">{data.lastDateToAction}</p>
            </div>
          )}
          {data.autoRenewal !== undefined && (
            <div>
              <p className="text-sm text-ramp-gray-600">Auto-Renewal</p>
              <p className="font-semibold text-ramp-slate">
                {data.autoRenewal ? `Yes — ${data.renewalNoticeDays || 60} days notice required` : 'No'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Services */}
      <div className="mb-8">
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-3"
          style={{ color: accentColor }}
        >
          Services
        </p>
        <ul className="space-y-2">
          {data.services.map((service, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-ramp-slate">
              <span style={{ color: accentColor }}>•</span>
              {service}
            </li>
          ))}
        </ul>
      </div>

      {/* Terms */}
      <div className="mb-8">
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-3"
          style={{ color: accentColor }}
        >
          Terms & Conditions
        </p>
        <ol className="space-y-2">
          {data.terms.map((term, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-ramp-slate">
              <span className="font-semibold" style={{ color: accentColor }}>{index + 1}.</span>
              {term}
            </li>
          ))}
        </ol>
      </div>

      {/* Compensation */}
      <div 
        className="mb-12 p-4 rounded-lg"
        style={{ 
          backgroundColor: accentBgColor,
          border: `1px solid ${accentBorderColor}`,
        }}
      >
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-3"
          style={{ color: accentColor }}
        >
          Compensation
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-ramp-gray-600">Total Contract Value</p>
            <p className="font-bold text-xl" style={{ color: accentColor }}>{formatCurrency(data.totalValue)}</p>
          </div>
          <div>
            <p className="text-sm text-ramp-gray-600">Payment Schedule</p>
            <p className="font-semibold text-ramp-slate">{data.paymentSchedule}</p>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div 
        className="grid grid-cols-2 gap-8 pt-8"
        style={{ borderTop: `1px solid ${accentBorderColor}` }}
      >
        <div>
          <p 
            className="text-xs uppercase tracking-wide font-semibold mb-3"
            style={{ color: accentColor }}
          >
            Provider Signature
          </p>
          <div 
            className="h-16 mb-2"
            style={{ borderBottom: `1px solid ${accentColor}` }}
          ></div>
          <p className="font-semibold text-ramp-slate">{data.signatures.provider.name}</p>
          <p className="text-sm text-ramp-gray-600">{data.signatures.provider.title}</p>
        </div>
        <div>
          <p 
            className="text-xs uppercase tracking-wide font-semibold mb-3"
            style={{ color: accentColor }}
          >
            Client Signature
          </p>
          <div 
            className="h-16 mb-2"
            style={{ borderBottom: `1px solid ${accentColor}` }}
          ></div>
          <p className="font-semibold text-ramp-slate">{data.signatures.client.name || '___________________'}</p>
          <p className="text-sm text-ramp-gray-600">{data.signatures.client.title}</p>
        </div>
      </div>
    </div>
  );
}
