import type { QuoteData, ContractData, InvoiceData, AssetType } from '../types';

export function generateLineItemId(): string {
  return crypto.randomUUID();
}

export function ensureLineItemIds<T extends { id?: string }>(items: T[]): (T & { id: string })[] {
  return items.map(item => ({
    ...item,
    id: item.id || generateLineItemId(),
  }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface ConnectedState {
  quote: QuoteData | null;
  contract: ContractData | null;
  invoices: InvoiceData[];
}

interface SyncResult {
  quote: QuoteData | null;
  contract: ContractData | null;
  invoices: InvoiceData[];
}

function recalcQuoteTotals(items: QuoteData['items'], discount: number): Pick<QuoteData, 'subtotal' | 'total'> {
  const subtotal = round2(items.reduce((sum, item) => sum + item.total, 0));
  return { subtotal, total: round2(subtotal - discount) };
}

function recalcInvoiceTotals(lineItems: InvoiceData['lineItems']): Pick<InvoiceData, 'subtotal' | 'tax' | 'total'> {
  const subtotal = round2(lineItems.reduce((sum, item) => sum + item.total, 0));
  const tax = round2(subtotal * 0.0875);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

function distributeQuantity(totalQty: number, percentages: number[]): number[] {
  if (totalQty === 0) return percentages.map(() => 0);
  const raw = percentages.map(p => totalQty * p);
  const floors = raw.map(v => Math.floor(v));
  let remaining = totalQty - floors.reduce((s, v) => s + v, 0);
  const remainders = raw.map((v, i) => ({ i, r: v - floors[i] }));
  remainders.sort((a, b) => b.r - a.r);
  for (let k = 0; k < remaining; k++) {
    floors[remainders[k].i] += 1;
  }
  return floors;
}

function buildInvoiceLineItemsForSplit(
  quoteItems: QuoteData['items'],
  invoiceIndex: number,
  allPercentages: number[],
): InvoiceData['lineItems'] {
  return quoteItems
    .map(item => {
      const distributed = distributeQuantity(item.quantity, allPercentages);
      const qty = distributed[invoiceIndex];
      return {
        id: item.id,
        description: item.description,
        quantity: qty,
        unitPrice: item.unitPrice,
        total: round2(qty * item.unitPrice),
      };
    })
    .filter(item => item.quantity > 0);
}

function syncContractFromQuote(contract: ContractData, quote: QuoteData): ContractData {
  return {
    ...contract,
    services: quote.items.map(item => item.description),
    totalValue: quote.total,
  };
}

function syncQuoteFromInvoices(quote: QuoteData, invoices: InvoiceData[]): QuoteData {
  if (invoices.length === 0) return quote;

  const allIds = new Set<string>();
  for (const inv of invoices) {
    for (const li of inv.lineItems) {
      allIds.add(li.id);
    }
  }

  const mergedItems: QuoteData['items'] = [];
  for (const id of allIds) {
    const matchingItems = invoices
      .map(inv => inv.lineItems.find(li => li.id === id))
      .filter(Boolean) as InvoiceData['lineItems'];

    const firstMatch = matchingItems[0];
    const totalQty = matchingItems.reduce((s, li) => s + li.quantity, 0);
    const existingQuoteItem = quote.items.find(qi => qi.id === id);
    const unitPrice = existingQuoteItem?.unitPrice ?? firstMatch.unitPrice;
    const combinedTotal = round2(totalQty * unitPrice);

    mergedItems.push({
      id,
      description: existingQuoteItem?.description ?? firstMatch.description,
      quantity: totalQty,
      unitPrice,
      total: combinedTotal,
    });
  }

  for (const qi of quote.items) {
    if (!allIds.has(qi.id)) {
      mergedItems.push({ ...qi });
    }
  }

  const discount = quote.discount || 0;
  const totals = recalcQuoteTotals(mergedItems, discount);
  return { ...quote, items: mergedItems, ...totals };
}

export function syncConnectedDocuments(
  sourceType: AssetType,
  sourceData: QuoteData | ContractData | InvoiceData,
  sourceInvoiceIndex: number | null,
  state: ConnectedState,
): SyncResult {
  let { quote, contract, invoices } = state;

  if (sourceType === 'quote') {
    quote = sourceData as QuoteData;
    quote = { ...quote, items: ensureLineItemIds(quote.items) };

    if (contract) {
      contract = syncContractFromQuote(contract, quote);
    }

    if (invoices.length > 0) {
      const n = invoices.length;
      const equalPercentages = invoices.map(() => 1 / n);
      invoices = invoices.map((inv, i) => {
        const newLineItems = buildInvoiceLineItemsForSplit(quote!.items, i, equalPercentages);
        const totals = recalcInvoiceTotals(newLineItems);
        return { ...inv, lineItems: newLineItems, ...totals };
      });
    }
  } else if (sourceType === 'invoice' && sourceInvoiceIndex !== null) {
    const updatedInvoice = sourceData as InvoiceData;
    const newInvoices = [...invoices];
    newInvoices[sourceInvoiceIndex] = {
      ...updatedInvoice,
      lineItems: ensureLineItemIds(updatedInvoice.lineItems),
    };

    const editedInv = newInvoices[sourceInvoiceIndex];

    const addedIds = new Set<string>();
    const removedIds = new Set<string>();
    const oldInvoice = invoices[sourceInvoiceIndex];

    if (oldInvoice) {
      const oldIds = new Set(oldInvoice.lineItems.map(li => li.id));
      const newIds = new Set(editedInv.lineItems.map(li => li.id));
      for (const id of newIds) {
        if (!oldIds.has(id)) addedIds.add(id);
      }
      for (const id of oldIds) {
        if (!newIds.has(id)) removedIds.add(id);
      }
    }

    const hasStructuralChange = addedIds.size > 0 || removedIds.size > 0;

    if (hasStructuralChange) {
      for (let i = 0; i < newInvoices.length; i++) {
        if (i === sourceInvoiceIndex) continue;
        let otherItems = [...newInvoices[i].lineItems];

        for (const id of removedIds) {
          otherItems = otherItems.filter(li => li.id !== id);
        }

        for (const id of addedIds) {
          const sourceItem = editedInv.lineItems.find(li => li.id === id);
          if (sourceItem && !otherItems.find(li => li.id === id)) {
            otherItems.push({
              id: sourceItem.id,
              description: sourceItem.description,
              quantity: sourceItem.quantity,
              unitPrice: 0,
              total: 0,
            });
          }
        }

        const totals = recalcInvoiceTotals(otherItems);
        newInvoices[i] = { ...newInvoices[i], lineItems: otherItems, ...totals };
      }
    }

    for (const id of editedInv.lineItems.map(li => li.id)) {
      if (addedIds.has(id)) continue;
      const editedItem = editedInv.lineItems.find(li => li.id === id)!;
      const oldItem = oldInvoice?.lineItems.find(li => li.id === id);

      const descChanged = oldItem && oldItem.description !== editedItem.description;

      if (descChanged) {
        for (let i = 0; i < newInvoices.length; i++) {
          if (i === sourceInvoiceIndex) continue;
          newInvoices[i] = {
            ...newInvoices[i],
            lineItems: newInvoices[i].lineItems.map(li => {
              if (li.id !== id) return li;
              return { ...li, description: editedItem.description };
            }),
          };
        }
      }
    }

    invoices = newInvoices;

    if (quote) {
      quote = syncQuoteFromInvoices(quote, invoices);
      if (contract) {
        contract = syncContractFromQuote(contract, quote);
      }
    }
  } else if (sourceType === 'contract') {
    const updatedContract = sourceData as ContractData;
    const oldTotalValue = contract?.totalValue || 0;
    const newTotalValue = updatedContract.totalValue;
    contract = updatedContract;

    if (quote && oldTotalValue > 0 && newTotalValue !== oldTotalValue) {
      const scaleFactor = newTotalValue / oldTotalValue;
      const newItems = quote.items.map(item => ({
        ...item,
        unitPrice: round2(item.unitPrice * scaleFactor),
        total: round2(item.quantity * round2(item.unitPrice * scaleFactor)),
      }));
      const discount = quote.discount || 0;
      const totals = recalcQuoteTotals(newItems, discount);
      quote = { ...quote, items: newItems, ...totals };

      if (invoices.length > 0) {
        const cn = invoices.length;
        const cEqualPct = invoices.map(() => 1 / cn);
        invoices = invoices.map((inv, i) => {
          const newLineItems = buildInvoiceLineItemsForSplit(quote!.items, i, cEqualPct);
          const invTotals = recalcInvoiceTotals(newLineItems);
          return { ...inv, lineItems: newLineItems, ...invTotals };
        });
      }
    }
  }

  return { quote, contract, invoices };
}

export function hasConnectedDocuments(
  selectedAssets: AssetType[],
  generatedAssets: Record<string, unknown>,
  generatedInvoices: InvoiceData[],
): boolean {
  const hasQuote = selectedAssets.includes('quote') && generatedAssets['quote'];
  const hasContract = selectedAssets.includes('contract') && generatedAssets['contract'];
  const hasInvoice = selectedAssets.includes('invoice') &&
    (generatedInvoices.length > 0 || generatedAssets['invoice']);

  const connectedCount = [hasQuote, hasContract, hasInvoice].filter(Boolean).length;
  return connectedCount >= 2;
}
