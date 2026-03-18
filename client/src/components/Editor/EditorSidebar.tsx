import { Trash2, Plus } from 'lucide-react';
import { Input } from '../ui';
import type { AssetType, AssetData, InvoiceData, ReceiptData, PaperReceiptData, HotelFolioData, AirlineReceiptData, QuoteData, ContractData } from '../../types';
import { generateLineItemId } from '../../utils/documentSync';
import { useStore } from '../../hooks/useStore';
import { getCurrency } from '../../utils/currencies';

const numVal = (v: number) => v || '';

function useCurrencySymbol() {
  const { selectedCurrency } = useStore();
  return getCurrency(selectedCurrency)?.symbol || '$';
}

interface EditorSidebarProps {
  type: AssetType;
  data: AssetData;
  onChange: (data: AssetData) => void;
}

export function EditorSidebar({ type, data, onChange }: EditorSidebarProps) {
  switch (type) {
    case 'invoice':
      return <InvoiceEditor data={data as InvoiceData} onChange={onChange} />;
    case 'receipt':
      return <ReceiptEditor data={data as ReceiptData} onChange={onChange} />;
    case 'paper_receipt':
      return <PaperReceiptEditor data={data as PaperReceiptData} onChange={onChange} />;
    case 'hotel_folio':
      return <HotelFolioEditor data={data as HotelFolioData} onChange={onChange} />;
    case 'airline_receipt':
      return <AirlineReceiptEditor data={data as AirlineReceiptData} onChange={onChange} />;
    case 'quote':
      return <QuoteEditor data={data as QuoteData} onChange={onChange} />;
    case 'contract':
      return <ContractEditor data={data as ContractData} onChange={onChange} />;
    default:
      return null;
  }
}

// Invoice Editor
function InvoiceEditor({ data, onChange }: { data: InvoiceData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateVendor = (field: keyof InvoiceData['vendor'], value: string) => {
    onChange({ ...data, vendor: { ...data.vendor, [field]: value } });
  };

  const updateClient = (field: keyof InvoiceData['client'], value: string) => {
    onChange({ ...data, client: { ...data.client, [field]: value } });
  };

  const recalcInvoice = (items: InvoiceData['lineItems'], taxes?: InvoiceData['taxes']) => {
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    const taxLines = taxes?.length ? taxes : data.taxes?.length ? data.taxes : [{ name: 'Tax', rate: 0.0875, amount: 0 }];
    const updatedTaxes = taxLines.map(t => ({ ...t, amount: Math.round(subtotal * t.rate * 100) / 100 }));
    const taxTotal = Math.round(updatedTaxes.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    return { subtotal, taxes: updatedTaxes, taxTotal, tax: taxTotal, total: Math.round((subtotal + taxTotal) * 100) / 100 };
  };

  const updateLineItem = (index: number, field: keyof InvoiceData['lineItems'][0], value: string | number) => {
    const newLineItems = [...data.lineItems];
    newLineItems[index] = { ...newLineItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      newLineItems[index].total = Math.round(newLineItems[index].quantity * newLineItems[index].unitPrice * 100) / 100;
    }
    
    onChange({ ...data, lineItems: newLineItems, ...recalcInvoice(newLineItems) });
  };

  const addLineItem = () => {
    const newLineItems = [...data.lineItems, { id: generateLineItemId(), description: '', quantity: 1, unitPrice: 0, total: 0 }];
    onChange({ ...data, lineItems: newLineItems, ...recalcInvoice(newLineItems) });
  };

  const deleteLineItem = (index: number) => {
    if (data.lineItems.length <= 1) return;
    const newLineItems = data.lineItems.filter((_, i) => i !== index);
    onChange({ ...data, lineItems: newLineItems, ...recalcInvoice(newLineItems) });
  };

  return (
    <div className="space-y-6">
      <Section title="Document Info">
        <Input
          label="Invoice Number"
          value={data.invoiceNumber}
          onChange={(e) => onChange({ ...data, invoiceNumber: e.target.value })}
        />
        <Input
          label="Date"
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
        />
        <Input
          label="Due Date"
          type="date"
          value={data.dueDate}
          onChange={(e) => onChange({ ...data, dueDate: e.target.value })}
        />
      </Section>

      <Section title="Vendor">
        <Input
          label="Name"
          value={data.vendor.name}
          onChange={(e) => updateVendor('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.vendor.address}
          onChange={(e) => updateVendor('address', e.target.value)}
        />
        <Input
          label="Email"
          value={data.vendor.email}
          onChange={(e) => updateVendor('email', e.target.value)}
        />
        <Input
          label="Phone"
          value={data.vendor.phone}
          onChange={(e) => updateVendor('phone', e.target.value)}
        />
      </Section>

      <Section title="Client">
        <Input
          label="Name"
          value={data.client.name}
          onChange={(e) => updateClient('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.client.address}
          onChange={(e) => updateClient('address', e.target.value)}
        />
        <Input
          label="Email"
          value={data.client.email}
          onChange={(e) => updateClient('email', e.target.value)}
        />
      </Section>

      <Section title="Line Items" action={<AddButton onClick={addLineItem} />}>
        {data.lineItems.map((item, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Input
                  label={`Item ${index + 1} Description`}
                  value={item.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                />
              </div>
              <DeleteButton onClick={() => deleteLineItem(index)} disabled={data.lineItems.length <= 1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Qty"
                type="number"
                value={numVal(item.quantity)}
                onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 0)}
              />
              <Input
                label={`Unit Price (${sym})`}
                type="number"
                value={numVal(item.unitPrice)}
                onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Taxes" action={
        <button
          onClick={() => {
            const newTaxes = [...(data.taxes || []), { name: 'Tax', rate: 0, amount: 0 }];
            onChange({ ...data, ...recalcInvoice(data.lineItems, newTaxes) });
          }}
          className="flex items-center gap-1 text-xs font-medium text-ramp-sage hover:text-ramp-slate transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Tax
        </button>
      }>
        {(data.taxes || []).map((taxLine, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Input
                label="Tax Name"
                value={taxLine.name}
                onChange={(e) => {
                  const newTaxes = [...(data.taxes || [])];
                  newTaxes[index] = { ...newTaxes[index], name: e.target.value };
                  onChange({ ...data, ...recalcInvoice(data.lineItems, newTaxes) });
                }}
              />
              {(data.taxes || []).length > 1 && (
                <button
                  onClick={() => {
                    const newTaxes = (data.taxes || []).filter((_, i) => i !== index);
                    onChange({ ...data, ...recalcInvoice(data.lineItems, newTaxes) });
                  }}
                  className="mt-6 p-1 text-ramp-gray-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Rate (%)"
                type="number"
                step="0.01"
                value={numVal(Math.round(taxLine.rate * 10000) / 100)}
                onChange={(e) => {
                  const newTaxes = [...(data.taxes || [])];
                  newTaxes[index] = { ...newTaxes[index], rate: (parseFloat(e.target.value) || 0) / 100 };
                  onChange({ ...data, ...recalcInvoice(data.lineItems, newTaxes) });
                }}
              />
              <Input
                label={`Amount (${sym})`}
                type="number"
                value={numVal(taxLine.amount)}
                disabled
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Notes">
        <Input
          label="Payment Terms"
          value={data.paymentTerms}
          onChange={(e) => onChange({ ...data, paymentTerms: e.target.value })}
        />
        <Input
          label="Notes"
          value={data.notes || ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </Section>
    </div>
  );
}

// Receipt Editor
function ReceiptEditor({ data, onChange }: { data: ReceiptData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateVendor = (field: keyof ReceiptData['vendor'], value: string) => {
    onChange({ ...data, vendor: { ...data.vendor, [field]: value } });
  };

  const recalcReceipt = (items: ReceiptData['items'], taxes?: ReceiptData['taxes']) => {
    const subtotal = Math.round(items.reduce((sum, item) => sum + (item.quantity * item.price), 0) * 100) / 100;
    const taxLines = taxes?.length ? taxes : data.taxes?.length ? data.taxes : [{ name: 'Tax', rate: 0.0875, amount: 0 }];
    const updatedTaxes = taxLines.map(t => ({ ...t, amount: Math.round(subtotal * t.rate * 100) / 100 }));
    const taxTotal = Math.round(updatedTaxes.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    const tip = data.tip || 0;
    return { subtotal, taxes: updatedTaxes, taxTotal, tax: taxTotal, total: Math.round((subtotal + taxTotal + tip) * 100) / 100 };
  };

  const updateItem = (index: number, field: keyof ReceiptData['items'][0], value: string | number) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems, ...recalcReceipt(newItems) });
  };

  const addItem = () => {
    const newItems = [...data.items, { description: '', quantity: 1, price: 0 }];
    onChange({ ...data, items: newItems, ...recalcReceipt(newItems) });
  };

  const deleteItem = (index: number) => {
    if (data.items.length <= 1) return;
    const newItems = data.items.filter((_, i) => i !== index);
    onChange({ ...data, items: newItems, ...recalcReceipt(newItems) });
  };

  const updateTip = (tipValue: number) => {
    const taxTotal = data.taxTotal ?? data.tax ?? 0;
    const total = Math.round((data.subtotal + taxTotal + tipValue) * 100) / 100;
    onChange({ ...data, tip: tipValue, total });
  };

  return (
    <div className="space-y-6">
      <Section title="Document Info">
        <Input
          label="Receipt Number"
          value={data.receiptNumber}
          onChange={(e) => onChange({ ...data, receiptNumber: e.target.value })}
        />
        <Input
          label="Date"
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
        />
      </Section>

      <Section title="Vendor">
        <Input
          label="Name"
          value={data.vendor.name}
          onChange={(e) => updateVendor('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.vendor.address}
          onChange={(e) => updateVendor('address', e.target.value)}
        />
      </Section>

      <Section title="Items" action={<AddButton onClick={addItem} />}>
        {data.items.map((item, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Input
                  label={`Item ${index + 1}`}
                  value={item.description}
                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                />
              </div>
              <DeleteButton onClick={() => deleteItem(index)} disabled={data.items.length <= 1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Qty"
                type="number"
                value={numVal(item.quantity)}
                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
              />
              <Input
                label={`Price (${sym})`}
                type="number"
                step="0.01"
                value={numVal(item.price)}
                onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Taxes" action={
        <button
          onClick={() => {
            const newTaxes = [...(data.taxes || []), { name: 'Tax', rate: 0, amount: 0 }];
            onChange({ ...data, ...recalcReceipt(data.items, newTaxes) });
          }}
          className="flex items-center gap-1 text-xs font-medium text-ramp-sage hover:text-ramp-slate transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Tax
        </button>
      }>
        {(data.taxes || []).map((taxLine, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Input
                label="Tax Name"
                value={taxLine.name}
                onChange={(e) => {
                  const newTaxes = [...(data.taxes || [])];
                  newTaxes[index] = { ...newTaxes[index], name: e.target.value };
                  onChange({ ...data, ...recalcReceipt(data.items, newTaxes) });
                }}
              />
              {(data.taxes || []).length > 1 && (
                <button
                  onClick={() => {
                    const newTaxes = (data.taxes || []).filter((_, i) => i !== index);
                    onChange({ ...data, ...recalcReceipt(data.items, newTaxes) });
                  }}
                  className="mt-6 p-1 text-ramp-gray-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Rate (%)"
                type="number"
                step="0.01"
                value={numVal(Math.round(taxLine.rate * 10000) / 100)}
                onChange={(e) => {
                  const newTaxes = [...(data.taxes || [])];
                  newTaxes[index] = { ...newTaxes[index], rate: (parseFloat(e.target.value) || 0) / 100 };
                  onChange({ ...data, ...recalcReceipt(data.items, newTaxes) });
                }}
              />
              <Input
                label={`Amount (${sym})`}
                type="number"
                value={numVal(taxLine.amount)}
                disabled
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Gratuity">
        <Input
          label={`Tip (${sym})`}
          type="number"
          step="0.01"
          value={numVal(data.tip || 0)}
          onChange={(e) => updateTip(parseFloat(e.target.value) || 0)}
        />
      </Section>

      <Section title="Payment">
        <Input
          label="Payment Method"
          value={data.paymentMethod}
          onChange={(e) => onChange({ ...data, paymentMethod: e.target.value })}
        />
        <Input
          label="Card Last 4"
          value={data.cardLast4 || ''}
          maxLength={4}
          onChange={(e) => onChange({ ...data, cardLast4: e.target.value })}
        />
      </Section>
    </div>
  );
}

// Quote Editor
function QuoteEditor({ data, onChange }: { data: QuoteData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateVendor = (field: keyof QuoteData['vendor'], value: string) => {
    onChange({ ...data, vendor: { ...data.vendor, [field]: value } });
  };

  const updateClient = (field: keyof QuoteData['client'], value: string) => {
    onChange({ ...data, client: { ...data.client, [field]: value } });
  };

  const recalcQuote = (items: QuoteData['items']) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = data.discount || 0;
    return { subtotal, total: subtotal - discount };
  };

  const updateItem = (index: number, field: keyof QuoteData['items'][0], value: string | number) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
    }
    
    onChange({ ...data, items: newItems, ...recalcQuote(newItems) });
  };

  const addItem = () => {
    const newItems = [...data.items, { id: generateLineItemId(), description: '', quantity: 1, unitPrice: 0, total: 0 }];
    onChange({ ...data, items: newItems, ...recalcQuote(newItems) });
  };

  const deleteItem = (index: number) => {
    if (data.items.length <= 1) return;
    const newItems = data.items.filter((_, i) => i !== index);
    onChange({ ...data, items: newItems, ...recalcQuote(newItems) });
  };

  return (
    <div className="space-y-6">
      <Section title="Document Info">
        <Input
          label="Quote Number"
          value={data.quoteNumber}
          onChange={(e) => onChange({ ...data, quoteNumber: e.target.value })}
        />
        <Input
          label="Date"
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
        />
        <Input
          label="Valid Until"
          type="date"
          value={data.validUntil}
          onChange={(e) => onChange({ ...data, validUntil: e.target.value })}
        />
      </Section>

      <Section title="Vendor">
        <Input
          label="Name"
          value={data.vendor.name}
          onChange={(e) => updateVendor('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.vendor.address}
          onChange={(e) => updateVendor('address', e.target.value)}
        />
        <Input
          label="Email"
          value={data.vendor.email}
          onChange={(e) => updateVendor('email', e.target.value)}
        />
        <Input
          label="Phone"
          value={data.vendor.phone}
          onChange={(e) => updateVendor('phone', e.target.value)}
        />
      </Section>

      <Section title="Client">
        <Input
          label="Name"
          value={data.client.name}
          onChange={(e) => updateClient('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.client.address}
          onChange={(e) => updateClient('address', e.target.value)}
        />
        <Input
          label="Email"
          value={data.client.email}
          onChange={(e) => updateClient('email', e.target.value)}
        />
      </Section>

      <Section title="Items" action={<AddButton onClick={addItem} />}>
        {data.items.map((item, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Input
                  label={`Item ${index + 1}`}
                  value={item.description}
                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                />
              </div>
              <DeleteButton onClick={() => deleteItem(index)} disabled={data.items.length <= 1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Qty"
                type="number"
                value={numVal(item.quantity)}
                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
              />
              <Input
                label={`Unit Price (${sym})`}
                type="number"
                value={numVal(item.unitPrice)}
                onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Discount">
        <Input
          label={`Discount Amount (${sym})`}
          type="number"
          value={numVal(data.discount || 0)}
          onChange={(e) => {
            const discount = parseFloat(e.target.value) || 0;
            onChange({ ...data, discount, total: data.subtotal - discount });
          }}
        />
      </Section>

      <Section title="Terms">
        <Input
          label="Terms"
          value={data.terms}
          onChange={(e) => onChange({ ...data, terms: e.target.value })}
        />
        <Input
          label="Notes"
          value={data.notes || ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </Section>
    </div>
  );
}

// Contract Editor
function ContractEditor({ data, onChange }: { data: ContractData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateProvider = (field: keyof ContractData['parties']['provider'], value: string) => {
    onChange({
      ...data,
      parties: {
        ...data.parties,
        provider: { ...data.parties.provider, [field]: value },
      },
    });
  };

  const updateClient = (field: keyof ContractData['parties']['client'], value: string) => {
    onChange({
      ...data,
      parties: {
        ...data.parties,
        client: { ...data.parties.client, [field]: value },
      },
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Document Info">
        <Input
          label="Contract Number"
          value={data.contractNumber}
          onChange={(e) => onChange({ ...data, contractNumber: e.target.value })}
        />
        <Input
          label="Date"
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
        />
        <Input
          label="Effective Date"
          type="date"
          value={data.effectiveDate}
          onChange={(e) => onChange({ ...data, effectiveDate: e.target.value })}
        />
        <Input
          label="Expiration Date"
          type="date"
          value={data.expirationDate}
          onChange={(e) => onChange({ ...data, expirationDate: e.target.value })}
        />
      </Section>

      <Section title="Provider">
        <Input
          label="Name"
          value={data.parties.provider.name}
          onChange={(e) => updateProvider('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.parties.provider.address}
          onChange={(e) => updateProvider('address', e.target.value)}
        />
        <Input
          label="Representative"
          value={data.parties.provider.representative}
          onChange={(e) => updateProvider('representative', e.target.value)}
        />
      </Section>

      <Section title="Client">
        <Input
          label="Name"
          value={data.parties.client.name}
          onChange={(e) => updateClient('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.parties.client.address}
          onChange={(e) => updateClient('address', e.target.value)}
        />
        <Input
          label="Representative"
          value={data.parties.client.representative}
          onChange={(e) => updateClient('representative', e.target.value)}
        />
      </Section>

      <Section title="Compensation">
        <Input
          label={`Total Value (${sym})`}
          type="number"
          value={numVal(data.totalValue)}
          onChange={(e) => onChange({ ...data, totalValue: parseFloat(e.target.value) || 0 })}
        />
        <Input
          label="Payment Schedule"
          value={data.paymentSchedule}
          onChange={(e) => onChange({ ...data, paymentSchedule: e.target.value })}
        />
      </Section>

      <Section title="Signatures">
        <Input
          label="Provider Signatory Name"
          value={data.signatures.provider.name}
          onChange={(e) => onChange({
            ...data,
            signatures: { ...data.signatures, provider: { ...data.signatures.provider, name: e.target.value } },
          })}
        />
        <Input
          label="Provider Title"
          value={data.signatures.provider.title}
          onChange={(e) => onChange({
            ...data,
            signatures: { ...data.signatures, provider: { ...data.signatures.provider, title: e.target.value } },
          })}
        />
        <Input
          label="Client Signatory Name"
          value={data.signatures.client.name}
          onChange={(e) => onChange({
            ...data,
            signatures: { ...data.signatures, client: { ...data.signatures.client, name: e.target.value } },
          })}
        />
        <Input
          label="Client Title"
          value={data.signatures.client.title}
          onChange={(e) => onChange({
            ...data,
            signatures: { ...data.signatures, client: { ...data.signatures.client, title: e.target.value } },
          })}
        />
      </Section>
    </div>
  );
}

// Paper Receipt Editor
function PaperReceiptEditor({ data, onChange }: { data: PaperReceiptData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateStore = (field: keyof PaperReceiptData['store'], value: string) => {
    onChange({ ...data, store: { ...data.store, [field]: value } });
  };

  const recalcPaperReceipt = (items: PaperReceiptData['items'], taxes?: PaperReceiptData['taxes']) => {
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    const taxLines = taxes?.length ? taxes : data.taxes?.length ? data.taxes : [{ name: 'Tax', rate: data.taxRate || 0.0825, amount: 0 }];
    const updatedTaxes = taxLines.map(t => ({ ...t, amount: Math.round(subtotal * t.rate * 100) / 100 }));
    const taxTotal = Math.round(updatedTaxes.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    const tip = data.tip ? Math.round(data.tip * 100) / 100 : 0;
    return { subtotal, taxes: updatedTaxes, taxTotal, taxAmount: taxTotal, taxRate: updatedTaxes[0]?.rate || 0, total: Math.round((subtotal + taxTotal + tip) * 100) / 100 };
  };

  const updateItem = (index: number, field: keyof PaperReceiptData['items'][0], value: string | number) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].total = Math.round(newItems[index].quantity * newItems[index].unitPrice * 100) / 100;
    }
    
    onChange({ ...data, items: newItems, ...recalcPaperReceipt(newItems) });
  };

  const addItem = () => {
    const newItems = [...data.items, { name: '', quantity: 1, unitPrice: 0, total: 0 }];
    onChange({ ...data, items: newItems, ...recalcPaperReceipt(newItems) });
  };

  const deleteItem = (index: number) => {
    if (data.items.length <= 1) return;
    const newItems = data.items.filter((_, i) => i !== index);
    onChange({ ...data, items: newItems, ...recalcPaperReceipt(newItems) });
  };

  return (
    <div className="space-y-6">
      <Section title="Receipt Info">
        <Input
          label="Receipt Number"
          value={data.receiptNumber}
          onChange={(e) => onChange({ ...data, receiptNumber: e.target.value })}
        />
        <Input
          label="Transaction ID"
          value={data.transactionId}
          onChange={(e) => onChange({ ...data, transactionId: e.target.value })}
        />
        <Input
          label="Date"
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
        />
        <Input
          label="Time"
          value={data.time}
          onChange={(e) => onChange({ ...data, time: e.target.value })}
        />
      </Section>

      <Section title="Store">
        <Input
          label="Store Name"
          value={data.store.name}
          onChange={(e) => updateStore('name', e.target.value)}
        />
        <Input
          label="Address"
          value={data.store.address}
          onChange={(e) => updateStore('address', e.target.value)}
        />
        <Input
          label="City"
          value={data.store.city}
          onChange={(e) => updateStore('city', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="State"
            value={data.store.state}
            onChange={(e) => updateStore('state', e.target.value)}
          />
          <Input
            label="ZIP"
            value={data.store.zip}
            onChange={(e) => updateStore('zip', e.target.value)}
          />
        </div>
        <Input
          label="Phone"
          value={data.store.phone}
          onChange={(e) => updateStore('phone', e.target.value)}
        />
      </Section>

      <Section title="Items" action={<AddButton onClick={addItem} />}>
        {data.items.map((item, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Input
                  label={`Item ${index + 1}`}
                  value={item.name}
                  onChange={(e) => updateItem(index, 'name', e.target.value)}
                />
              </div>
              <DeleteButton onClick={() => deleteItem(index)} disabled={data.items.length <= 1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Qty"
                type="number"
                value={numVal(item.quantity)}
                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
              />
              <Input
                label={`Price (${sym})`}
                type="number"
                step="0.01"
                value={numVal(item.unitPrice)}
                onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Taxes" action={
        <button
          onClick={() => {
            const newTaxes = [...(data.taxes || []), { name: 'Tax', rate: 0, amount: 0 }];
            onChange({ ...data, ...recalcPaperReceipt(data.items, newTaxes) });
          }}
          className="flex items-center gap-1 text-xs font-medium text-ramp-sage hover:text-ramp-slate transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Tax
        </button>
      }>
        {(data.taxes || []).map((taxLine, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Input
                label="Tax Name"
                value={taxLine.name}
                onChange={(e) => {
                  const newTaxes = [...(data.taxes || [])];
                  newTaxes[index] = { ...newTaxes[index], name: e.target.value };
                  onChange({ ...data, ...recalcPaperReceipt(data.items, newTaxes) });
                }}
              />
              {(data.taxes || []).length > 1 && (
                <button
                  onClick={() => {
                    const newTaxes = (data.taxes || []).filter((_, i) => i !== index);
                    onChange({ ...data, ...recalcPaperReceipt(data.items, newTaxes) });
                  }}
                  className="mt-6 p-1 text-ramp-gray-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Rate (%)"
                type="number"
                step="0.01"
                value={numVal(Math.round(taxLine.rate * 10000) / 100)}
                onChange={(e) => {
                  const newTaxes = [...(data.taxes || [])];
                  newTaxes[index] = { ...newTaxes[index], rate: (parseFloat(e.target.value) || 0) / 100 };
                  onChange({ ...data, ...recalcPaperReceipt(data.items, newTaxes) });
                }}
              />
              <Input
                label={`Amount (${sym})`}
                type="number"
                value={numVal(taxLine.amount)}
                disabled
              />
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

// Hotel Folio Editor
function HotelFolioEditor({ data, onChange }: { data: HotelFolioData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateHotel = (field: keyof HotelFolioData['hotel'], value: string) => {
    onChange({ ...data, hotel: { ...data.hotel, [field]: value } });
  };

  const updateGuest = (field: keyof HotelFolioData['guest'], value: string) => {
    onChange({ ...data, guest: { ...data.guest, [field]: value } });
  };

  const recalcFolio = (charges: HotelFolioData['charges']) => {
    const roomCharges = charges.filter(c => c.category === 'Room');
    const incidentalCharges = charges.filter(c => c.category !== 'Room');
    const roomTotal = roomCharges.reduce((sum, c) => sum + c.amount, 0);
    const incidentalsTotal = incidentalCharges.reduce((sum, c) => sum + c.amount, 0);
    const taxTotal = data.taxes.reduce((sum, t) => sum + t.amount, 0);
    return { roomTotal, incidentalsTotal, total: roomTotal + incidentalsTotal + taxTotal };
  };

  const updateCharge = (index: number, field: keyof HotelFolioData['charges'][0], value: string | number) => {
    const newCharges = [...data.charges];
    newCharges[index] = { ...newCharges[index], [field]: value };
    onChange({ ...data, charges: newCharges, ...recalcFolio(newCharges) });
  };

  const addCharge = () => {
    const today = new Date().toISOString().split('T')[0];
    const newCharges = [...data.charges, { category: 'Room', description: '', date: today, amount: 0 }];
    onChange({ ...data, charges: newCharges, ...recalcFolio(newCharges) });
  };

  const deleteCharge = (index: number) => {
    if (data.charges.length <= 1) return;
    const newCharges = data.charges.filter((_, i) => i !== index);
    onChange({ ...data, charges: newCharges, ...recalcFolio(newCharges) });
  };

  return (
    <div className="space-y-6">
      <Section title="Folio Info">
        <Input
          label="Folio Number"
          value={data.folioNumber}
          onChange={(e) => onChange({ ...data, folioNumber: e.target.value })}
        />
        <Input
          label="Confirmation"
          value={data.confirmation}
          onChange={(e) => onChange({ ...data, confirmation: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Check-In"
            type="date"
            value={data.checkIn}
            onChange={(e) => onChange({ ...data, checkIn: e.target.value })}
          />
          <Input
            label="Check-Out"
            type="date"
            value={data.checkOut}
            onChange={(e) => onChange({ ...data, checkOut: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Room #"
            value={data.roomNumber}
            onChange={(e) => onChange({ ...data, roomNumber: e.target.value })}
          />
          <Input
            label="Nights"
            type="number"
            value={numVal(data.nights)}
            onChange={(e) => onChange({ ...data, nights: parseInt(e.target.value) || 0 })}
          />
        </div>
        <Input
          label="Room Type"
          value={data.roomType}
          onChange={(e) => onChange({ ...data, roomType: e.target.value })}
        />
      </Section>

      <Section title="Hotel">
        <Input
          label="Hotel Name"
          value={data.hotel.name}
          onChange={(e) => updateHotel('name', e.target.value)}
        />
        <Input
          label="Brand"
          value={data.hotel.brand || ''}
          onChange={(e) => updateHotel('brand', e.target.value)}
        />
        <Input
          label="Address"
          value={data.hotel.address}
          onChange={(e) => updateHotel('address', e.target.value)}
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            label="City"
            value={data.hotel.city}
            onChange={(e) => updateHotel('city', e.target.value)}
          />
          <Input
            label="State"
            value={data.hotel.state}
            onChange={(e) => updateHotel('state', e.target.value)}
          />
          <Input
            label="ZIP"
            value={data.hotel.zip}
            onChange={(e) => updateHotel('zip', e.target.value)}
          />
        </div>
        <Input
          label="Phone"
          value={data.hotel.phone}
          onChange={(e) => updateHotel('phone', e.target.value)}
        />
      </Section>

      <Section title="Guest">
        <Input
          label="Guest Name"
          value={data.guest.name}
          onChange={(e) => updateGuest('name', e.target.value)}
        />
        <Input
          label="Email"
          value={data.guest.email || ''}
          onChange={(e) => updateGuest('email', e.target.value)}
        />
        <Input
          label="Loyalty Number"
          value={data.guest.loyaltyNumber || ''}
          onChange={(e) => updateGuest('loyaltyNumber', e.target.value)}
        />
        <Input
          label="Loyalty Tier"
          value={data.guest.loyaltyTier || ''}
          onChange={(e) => updateGuest('loyaltyTier', e.target.value)}
        />
      </Section>

      <Section title="Charges" action={<AddButton onClick={addCharge} label="Add Charge" />}>
        {data.charges.map((charge, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input
                  label="Category"
                  value={charge.category}
                  onChange={(e) => updateCharge(index, 'category', e.target.value)}
                />
                <Input
                  label="Date"
                  type="date"
                  value={charge.date}
                  onChange={(e) => updateCharge(index, 'date', e.target.value)}
                />
              </div>
              <DeleteButton onClick={() => deleteCharge(index)} disabled={data.charges.length <= 1} />
            </div>
            <Input
              label="Description"
              value={charge.description}
              onChange={(e) => updateCharge(index, 'description', e.target.value)}
            />
            <Input
              label={`Amount (${sym})`}
              type="number"
              step="0.01"
              value={numVal(charge.amount)}
              onChange={(e) => updateCharge(index, 'amount', parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}

// Airline Receipt Editor
function AirlineReceiptEditor({ data, onChange }: { data: AirlineReceiptData; onChange: (data: AssetData) => void }) {
  const sym = useCurrencySymbol();
  const updateAirline = (field: keyof AirlineReceiptData['airline'], value: string) => {
    onChange({ ...data, airline: { ...data.airline, [field]: value } });
  };

  const updatePassenger = (field: keyof AirlineReceiptData['passenger'], value: string) => {
    onChange({ ...data, passenger: { ...data.passenger, [field]: value } });
  };

  const updateFlight = (index: number, field: string, value: string) => {
    const newFlights = [...data.flights];
    if (field.startsWith('departure.')) {
      const subField = field.replace('departure.', '') as keyof AirlineReceiptData['flights'][0]['departure'];
      newFlights[index] = { 
        ...newFlights[index], 
        departure: { ...newFlights[index].departure, [subField]: value } 
      };
    } else if (field.startsWith('arrival.')) {
      const subField = field.replace('arrival.', '') as keyof AirlineReceiptData['flights'][0]['arrival'];
      newFlights[index] = { 
        ...newFlights[index], 
        arrival: { ...newFlights[index].arrival, [subField]: value } 
      };
    } else {
      newFlights[index] = { ...newFlights[index], [field]: value };
    }
    onChange({ ...data, flights: newFlights });
  };

  const addFlight = () => {
    const today = new Date().toISOString().split('T')[0];
    const newFlights = [...data.flights, {
      flightNumber: '',
      date: today,
      departure: { airport: '', code: '', time: '' },
      arrival: { airport: '', code: '', time: '' },
      class: 'Economy',
    }];
    onChange({ ...data, flights: newFlights });
  };

  const deleteFlight = (index: number) => {
    if (data.flights.length <= 1) return;
    const newFlights = data.flights.filter((_, i) => i !== index);
    onChange({ ...data, flights: newFlights });
  };

  const updateFareBreakdown = (field: keyof AirlineReceiptData['fareBreakdown'], value: number) => {
    const newFareBreakdown = { ...data.fareBreakdown, [field]: value };
    const total = (newFareBreakdown.baseFare || 0) + 
                  (newFareBreakdown.taxes || 0) + 
                  (newFareBreakdown.fees || 0) + 
                  (newFareBreakdown.baggage || 0) + 
                  (newFareBreakdown.seatSelection || 0) +
                  (newFareBreakdown.other || 0);
    onChange({ ...data, fareBreakdown: newFareBreakdown, total });
  };

  return (
    <div className="space-y-6">
      <Section title="Booking Info">
        <Input
          label="Confirmation Code"
          value={data.confirmationCode}
          onChange={(e) => onChange({ ...data, confirmationCode: e.target.value })}
        />
        <Input
          label="Ticket Number"
          value={data.ticketNumber || ''}
          onChange={(e) => onChange({ ...data, ticketNumber: e.target.value })}
        />
        <Input
          label="Booking Date"
          type="date"
          value={data.bookingDate}
          onChange={(e) => onChange({ ...data, bookingDate: e.target.value })}
        />
      </Section>

      <Section title="Airline">
        <Input
          label="Airline Name"
          value={data.airline.name}
          onChange={(e) => updateAirline('name', e.target.value)}
        />
        <Input
          label="Domain"
          value={data.airline.domain}
          onChange={(e) => updateAirline('domain', e.target.value)}
        />
      </Section>

      <Section title="Passenger">
        <Input
          label="Passenger Name"
          value={data.passenger.name}
          onChange={(e) => updatePassenger('name', e.target.value)}
        />
        <Input
          label="Frequent Flyer #"
          value={data.passenger.frequentFlyer || ''}
          onChange={(e) => updatePassenger('frequentFlyer', e.target.value)}
        />
        <Input
          label="Tier Status"
          value={data.passenger.tierStatus || ''}
          onChange={(e) => updatePassenger('tierStatus', e.target.value)}
        />
      </Section>

      <Section title="Flights" action={<AddButton onClick={addFlight} label="Add Flight" />}>
        {data.flights.map((flight, index) => (
          <div key={index} className="p-3 bg-ramp-sand rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input
                  label="Flight #"
                  value={flight.flightNumber}
                  onChange={(e) => updateFlight(index, 'flightNumber', e.target.value)}
                />
                <Input
                  label="Date"
                  type="date"
                  value={flight.date}
                  onChange={(e) => updateFlight(index, 'date', e.target.value)}
                />
              </div>
              <DeleteButton onClick={() => deleteFlight(index)} disabled={data.flights.length <= 1} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="From (Code)"
                value={flight.departure.code}
                onChange={(e) => updateFlight(index, 'departure.code', e.target.value)}
              />
              <Input
                label="To (Code)"
                value={flight.arrival.code}
                onChange={(e) => updateFlight(index, 'arrival.code', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Depart Time"
                value={flight.departure.time}
                onChange={(e) => updateFlight(index, 'departure.time', e.target.value)}
              />
              <Input
                label="Arrive Time"
                value={flight.arrival.time}
                onChange={(e) => updateFlight(index, 'arrival.time', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Class"
                value={flight.class}
                onChange={(e) => updateFlight(index, 'class', e.target.value)}
              />
              <Input
                label="Seat"
                value={flight.seat || ''}
                onChange={(e) => updateFlight(index, 'seat', e.target.value)}
              />
            </div>
            <Input
              label="Duration"
              value={flight.duration || ''}
              onChange={(e) => updateFlight(index, 'duration', e.target.value)}
            />
          </div>
        ))}
      </Section>

      <Section title="Fare Breakdown">
        <Input
          label={`Base Fare (${sym})`}
          type="number"
          step="0.01"
          value={numVal(data.fareBreakdown.baseFare)}
          onChange={(e) => updateFareBreakdown('baseFare', parseFloat(e.target.value) || 0)}
        />
        <Input
          label={`Taxes (${sym})`}
          type="number"
          step="0.01"
          value={numVal(data.fareBreakdown.taxes)}
          onChange={(e) => updateFareBreakdown('taxes', parseFloat(e.target.value) || 0)}
        />
        <Input
          label={`Fees (${sym})`}
          type="number"
          step="0.01"
          value={numVal(data.fareBreakdown.fees)}
          onChange={(e) => updateFareBreakdown('fees', parseFloat(e.target.value) || 0)}
        />
        <Input
          label={`Baggage (${sym})`}
          type="number"
          step="0.01"
          value={numVal(data.fareBreakdown.baggage || 0)}
          onChange={(e) => updateFareBreakdown('baggage', parseFloat(e.target.value) || 0)}
        />
        <Input
          label={`Seat Selection (${sym})`}
          type="number"
          step="0.01"
          value={numVal(data.fareBreakdown.seatSelection || 0)}
          onChange={(e) => updateFareBreakdown('seatSelection', parseFloat(e.target.value) || 0)}
        />
      </Section>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ramp-slate uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function AddButton({ onClick, label = 'Add' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-medium text-ramp-sage hover:text-ramp-slate transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1 text-ramp-sage hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Remove item"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
