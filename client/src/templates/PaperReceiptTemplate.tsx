import type { ReactNode } from 'react';
import type { PaperReceiptData } from '../types';
import { formatWithSymbol } from '../utils/currencies';

interface PaperReceiptTemplateProps {
  data: PaperReceiptData;
  scale?: number;
  currency?: string;
}

export function PaperReceiptTemplate({ data, scale = 1, currency = 'USD' }: PaperReceiptTemplateProps) {
  // Format currency helper
  const formatCurrency = (amount: number): string => {
    return formatWithSymbol(amount, currency);
  };

  // Format price without currency symbol for line items
  const formatPrice = (amount: number): string => {
    return amount.toFixed(2);
  };

  // Generate a random barcode pattern for visual effect
  const generateBarcodePattern = (): ReactNode[] => {
    const bars: ReactNode[] = [];
    
    for (let i = 0; i < 50; i++) {
      const width = Math.random() > 0.5 ? 2 : 1;
      const isBlack = i % 2 === 0;
      bars.push(
        <div 
          key={i} 
          style={{ 
            width: `${width}px`, 
            height: '40px',
            backgroundColor: isBlack ? '#000' : '#fff'
          }} 
        />
      );
    }
    return bars;
  };

  // Get payment icon
  const getPaymentIcon = () => {
    switch (data.payment.method) {
      case 'credit':
      case 'debit':
        return '💳';
      case 'cash':
        return '💵';
      case 'gift_card':
        return '🎁';
      case 'mobile':
        return '📱';
      default:
        return '💳';
    }
  };

  return (
    <div 
      className="bg-white shadow-lg font-mono"
      style={{ 
        width: '320px', 
        minHeight: '500px',
        padding: '24px 16px',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        // Thermal paper texture effect
        backgroundImage: `
          linear-gradient(90deg, transparent 0%, transparent 50%, rgba(0,0,0,0.02) 50%, rgba(0,0,0,0.02) 100%),
          linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '4px 4px, 100% 2px',
      }}
    >
      {/* Store Header */}
      <div className="text-center mb-4">
        <div className="text-lg font-bold tracking-wide uppercase" style={{ letterSpacing: '2px' }}>
          {data.store.name}
        </div>
        {data.store.storeNumber && (
          <div className="text-xs text-gray-600">Store #{data.store.storeNumber}</div>
        )}
        <div className="text-xs mt-1 leading-relaxed">
          {data.store.address}<br />
          {data.store.city}, {data.store.state} {data.store.zip}<br />
          {data.store.phone}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-gray-400 my-3" />

      {/* Transaction Info */}
      <div className="text-xs space-y-0.5 mb-3">
        <div className="flex justify-between">
          <span>DATE:</span>
          <span>{data.date}</span>
        </div>
        <div className="flex justify-between">
          <span>TIME:</span>
          <span>{data.time}</span>
        </div>
        <div className="flex justify-between">
          <span>TRANS#:</span>
          <span>{data.transactionId}</span>
        </div>
        {data.cashier && (
          <div className="flex justify-between">
            <span>CASHIER:</span>
            <span>{data.cashier}</span>
          </div>
        )}
        {data.register && (
          <div className="flex justify-between">
            <span>REG:</span>
            <span>{data.register}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-gray-400 my-3" />

      {/* Items */}
      <div className="text-xs space-y-2 mb-3">
        {data.items.map((item, index) => (
          <div key={index}>
            <div className="flex justify-between">
              <span className="flex-1 pr-2 truncate uppercase">{item.name}</span>
              <span className="font-medium">{formatPrice(item.total)}</span>
            </div>
            {item.quantity > 1 && (
              <div className="text-gray-500 pl-2">
                {item.quantity} @ {formatPrice(item.unitPrice)}
              </div>
            )}
            {item.sku && (
              <div className="text-gray-400 text-[10px] pl-2">SKU: {item.sku}</div>
            )}
            {(item.discount ?? 0) > 0 && (
              <div className="text-gray-600 pl-2">
                DISCOUNT: -{formatPrice(item.discount!)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-gray-400 my-3" />

      {/* Totals */}
      <div className="text-xs space-y-1 mb-3">
        <div className="flex justify-between">
          <span>SUBTOTAL:</span>
          <span>{formatPrice(data.subtotal)}</span>
        </div>
        {data.taxes?.length ? data.taxes.map((t, i) => (
          <div key={i} className="flex justify-between">
            <span>{t.name.toUpperCase()} ({(t.rate * 100).toFixed(2)}%):</span>
            <span>{formatPrice(t.amount)}</span>
          </div>
        )) : (
          <div className="flex justify-between">
            <span>TAX ({(data.taxRate * 100).toFixed(2)}%):</span>
            <span>{formatPrice(data.taxAmount)}</span>
          </div>
        )}
        {data.tip !== undefined && data.tip > 0 && (
          <div className="flex justify-between">
            <span>TIP:</span>
            <span>{formatPrice(data.tip)}</span>
          </div>
        )}
        {data.savings && data.savings > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>*** YOU SAVED ***</span>
            <span>-{formatPrice(data.savings)}</span>
          </div>
        )}
        <div className="border-t border-gray-300 my-1" />
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL:</span>
          <span>{formatCurrency(data.total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="text-xs space-y-1 mb-3">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1">
            <span>{getPaymentIcon()}</span>
            <span className="uppercase">{data.payment.method.replace('_', ' ')}</span>
            {data.payment.cardType && <span>({data.payment.cardType})</span>}
          </span>
          <span>{formatCurrency(data.total)}</span>
        </div>
        {data.payment.cardLast4 && (
          <div className="text-gray-500 pl-4">
            Card: ****{data.payment.cardLast4}
          </div>
        )}
        {data.payment.approvalCode && (
          <div className="text-gray-500 pl-4">
            Approval: {data.payment.approvalCode}
          </div>
        )}
        {data.payment.method === 'cash' && data.payment.amountTendered && (
          <>
            <div className="flex justify-between">
              <span>CASH TENDERED:</span>
              <span>{formatCurrency(data.payment.amountTendered)}</span>
            </div>
            {data.payment.change !== undefined && (
              <div className="flex justify-between font-medium">
                <span>CHANGE DUE:</span>
                <span>{formatCurrency(data.payment.change)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Loyalty Points */}
      {data.loyaltyPoints !== undefined && (
        <div className="text-xs text-center my-3 py-2 border-y border-dashed border-gray-400">
          <div className="font-medium">REWARDS POINTS EARNED: {data.loyaltyPoints}</div>
        </div>
      )}

      {/* Barcode */}
      <div className="flex flex-col items-center my-4">
        <div className="flex">
          {generateBarcodePattern()}
        </div>
        <div className="text-[10px] mt-1 tracking-widest text-gray-600">
          {data.barcode || data.transactionId}
        </div>
      </div>

      {/* Footer Messages */}
      {data.footer && data.footer.length > 0 && (
        <div className="text-center text-xs mt-4 space-y-1">
          {data.footer.map((line, index) => (
            <div key={index} className="text-gray-600">{line}</div>
          ))}
        </div>
      )}

      {/* Receipt Number */}
      <div className="text-center text-[10px] text-gray-400 mt-4">
        RECEIPT# {data.receiptNumber}
      </div>

      {/* Thermal paper edge effect */}
      <div 
        className="absolute left-0 right-0 h-4 pointer-events-none"
        style={{
          bottom: 0,
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.05))'
        }}
      />
    </div>
  );
}
