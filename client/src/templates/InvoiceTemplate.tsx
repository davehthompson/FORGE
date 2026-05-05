import { useState } from 'react';
import type { InvoiceData } from '../types';
import { getLogoUrl } from '../utils/logo';
import { resolveCompanyDomain } from '../utils/domain';
import { useLogoColors, getLighterColor, getColorWithOpacity } from '../hooks/useLogoColors';
import { formatWithSymbol } from '../utils/currencies';
import { CompanyLogo } from '../components/ui';

interface InvoiceTemplateProps {
  data: InvoiceData;
  scale?: number;
  currency?: string;
}

export function InvoiceTemplate({ data, scale = 1, currency = 'USD' }: InvoiceTemplateProps) {
  // Format currency helper using the selected currency
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };
  const vendorDomain = resolveCompanyDomain({
    domain: data.vendor.domain,
    email: data.vendor.email,
  });
  const vendorLogoUrl = vendorDomain ? getLogoUrl(vendorDomain, { size: 64 }) : null;
  // Track which URL the logo actually loaded from (Logo.dev may 404, in which
  // case CompanyLogo falls back to Clearbit/Google). useLogoColors needs that
  // real URL so the extracted accent color matches the displayed image.
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(vendorLogoUrl);
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
      <div className="flex justify-between items-start mb-10">
        <div className="flex items-start gap-4">
          {vendorLogoUrl && (
            <CompanyLogo
              src={vendorLogoUrl}
              name={data.vendor.name}
              size={64}
              className="rounded-lg"
              style={{ border: `2px solid ${accentBorderColor}` }}
              onLoaded={setResolvedLogoUrl}
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
            INVOICE
          </h2>
          <p className="text-sm text-ramp-gray-600 mt-1">{data.invoiceNumber}</p>
          <p className="text-sm text-ramp-gray-600">Date: {data.date}</p>
          <p className="text-sm text-ramp-gray-600">Due: {data.dueDate}</p>
          {data.quoteReference && (
            <p className="text-xs text-ramp-spring mt-2">Quote Ref: {data.quoteReference}</p>
          )}
          {data.contractReference && (
            <p className="text-xs text-ramp-spring">Contract Ref: {data.contractReference}</p>
          )}
        </div>
      </div>

      {/* Bill To */}
      <div className="mb-8">
        <p 
          className="text-xs uppercase tracking-wide font-semibold mb-2"
          style={{ color: accentColor }}
        >
          Bill To
        </p>
        <p className="font-bold text-ramp-slate">{data.client.name}</p>
        <p className="text-sm text-ramp-gray-600 whitespace-pre-line">{data.client.address}</p>
        <p className="text-sm text-ramp-gray-600">{data.client.email}</p>
      </div>

      {/* Line Items Table */}
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
          {data.lineItems.map((item, index) => (
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
          {data.taxes?.length ? data.taxes.map((t, i) => (
            <div 
              key={i}
              className="flex justify-between py-2"
              style={{ borderBottom: `1px solid ${accentBorderColor}` }}
            >
              <span className="text-ramp-gray-600">{t.name}{t.rate ? ` (${(t.rate * 100).toFixed(1)}%)` : ''}</span>
              <span className="text-ramp-slate">{formatCurrency(t.amount)}</span>
            </div>
          )) : (
            <div 
              className="flex justify-between py-2"
              style={{ borderBottom: `1px solid ${accentBorderColor}` }}
            >
              <span className="text-ramp-gray-600">Tax</span>
              <span className="text-ramp-slate">{formatCurrency(data.tax)}</span>
            </div>
          )}
          <div 
            className="flex justify-between py-3 mt-2"
            style={{ borderTop: `2px solid ${accentColor}` }}
          >
            <span className="font-bold text-lg" style={{ color: accentColor }}>Total Due</span>
            <span className="font-bold text-lg" style={{ color: accentColor }}>{formatCurrency(data.total)}</span>
          </div>
        </div>
      </div>

      {/* Payment Terms & Remit Info */}
      <div className="grid grid-cols-2 gap-4">
        {/* Payment Terms */}
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
            Payment Terms
          </p>
          <p className="text-sm text-ramp-slate">{data.paymentTerms}</p>
          {data.notes && (
            <p className="text-sm text-ramp-slate mt-2">{data.notes}</p>
          )}
        </div>

        {/* ACH Remit Information */}
        {data.remitTo && (
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
              Remit Payment To (ACH)
            </p>
            <div className="space-y-1 text-sm">
              <p className="text-ramp-slate">
                <span className="text-ramp-gray-600">Bank:</span> {data.remitTo.bankName}
              </p>
              <p className="text-ramp-slate">
                <span className="text-ramp-gray-600">Account Name:</span> {data.remitTo.accountName}
              </p>
              <p className="text-ramp-slate font-mono">
                <span className="text-ramp-gray-600 font-sans">Routing:</span> {data.remitTo.routingNumber}
              </p>
              <p className="text-ramp-slate font-mono">
                <span className="text-ramp-gray-600 font-sans">Account:</span> {data.remitTo.accountNumber}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
