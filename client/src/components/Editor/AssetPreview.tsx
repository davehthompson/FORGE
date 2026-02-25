import { forwardRef } from 'react';
import type { AssetType, AssetData, InvoiceData, ReceiptData, PaperReceiptData, HotelFolioData, AirlineReceiptData, QuoteData, ContractData } from '../../types';
import { InvoiceTemplate, ReceiptTemplate, PaperReceiptTemplate, HotelFolioTemplate, AirlineReceiptTemplate, QuoteTemplate, ContractTemplate } from '../../templates';
import { useStore } from '../../hooks/useStore';

interface AssetPreviewProps {
  type: AssetType;
  data: AssetData;
  scale?: number;
  currency?: string;
}

export const AssetPreview = forwardRef<HTMLDivElement, AssetPreviewProps>(
  ({ type, data, scale = 1, currency: currencyProp }, ref) => {
    const { selectedCurrency } = useStore();
    const currency = currencyProp || selectedCurrency;

    const renderTemplate = () => {
      switch (type) {
        case 'invoice':
          return <InvoiceTemplate data={data as InvoiceData} scale={scale} currency={currency} />;
        case 'receipt':
          return <ReceiptTemplate data={data as ReceiptData} scale={scale} currency={currency} />;
        case 'paper_receipt':
          return <PaperReceiptTemplate data={data as PaperReceiptData} scale={scale} currency={currency} />;
        case 'hotel_folio':
          return <HotelFolioTemplate data={data as HotelFolioData} scale={scale} currency={currency} />;
        case 'airline_receipt':
          return <AirlineReceiptTemplate data={data as AirlineReceiptData} scale={scale} currency={currency} />;
        case 'quote':
          return <QuoteTemplate data={data as QuoteData} scale={scale} currency={currency} />;
        case 'contract':
          return <ContractTemplate data={data as ContractData} scale={scale} currency={currency} />;
        default:
          return null;
      }
    };

    return (
      <div ref={ref} className="inline-block">
        {renderTemplate()}
      </div>
    );
  }
);

AssetPreview.displayName = 'AssetPreview';
