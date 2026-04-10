import { create } from 'zustand';
import type { CompanyProfile, AssetType, AssetData, InvoiceData, QuoteData, ContractData } from '../types';

type AppMode = 'company' | 'quick_receipt';
type AppStep = 'home' | 'input' | 'summary' | 'category' | 'select' | 'quick_receipt' | 'editor' | 'export' | 'receipt_image_preview';

interface AppState {
  // Mode & Navigation
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  step: AppStep;
  setStep: (step: AppStep) => void;

  // Company data
  company: CompanyProfile | null;
  setCompany: (company: CompanyProfile | null) => void;

  // Spending category selection
  selectedSpendingCategory: string | null;
  setSelectedSpendingCategory: (category: string | null) => void;

  // Currency selection
  selectedCurrency: string;
  setSelectedCurrency: (currency: string) => void;

  // Quick receipt prompt
  quickReceiptPrompt: string;
  setQuickReceiptPrompt: (prompt: string) => void;
  quickReceiptType: 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt' | 'photo_receipt';
  setQuickReceiptType: (type: 'receipt' | 'paper_receipt' | 'hotel_folio' | 'airline_receipt' | 'photo_receipt') => void;

  // Receipt image (Gemini Nano Banana)
  receiptImageBlob: Blob | null;
  setReceiptImageBlob: (blob: Blob | null) => void;
  receiptImageScene: string;
  setReceiptImageScene: (scene: string) => void;

  // Asset selection
  selectedAssets: AssetType[];
  setSelectedAssets: (assets: AssetType[]) => void;
  toggleAsset: (asset: AssetType) => void;
  selectAllAssets: () => void;
  clearAssets: () => void;

  // Invoice count for connected flow
  invoiceCount: number;
  setInvoiceCount: (count: number) => void;

  // Matching mode for connected invoice flow
  matchingMode: '2way' | '3way';
  setMatchingMode: (mode: '2way' | '3way') => void;

  // Line item count per document
  lineItemCount: number;
  setLineItemCount: (count: number) => void;

  // Generated assets (single assets)
  generatedAssets: Record<AssetType, AssetData | null>;
  setGeneratedAsset: (type: AssetType, data: AssetData) => void;
  updateGeneratedAsset: (type: AssetType, data: Partial<AssetData>) => void;

  // Multiple invoices for connected flow
  generatedInvoices: InvoiceData[];
  setGeneratedInvoices: (invoices: InvoiceData[]) => void;
  addGeneratedInvoice: (invoice: InvoiceData) => void;
  updateGeneratedInvoice: (index: number, data: Partial<InvoiceData>) => void;

  // Batch update for cross-document sync
  batchUpdateDocuments: (updates: {
    quote?: QuoteData | null;
    contract?: ContractData | null;
    invoices?: InvoiceData[];
  }) => void;

  // Current editing
  currentAsset: AssetType | null;
  setCurrentAsset: (asset: AssetType | null) => void;
  currentInvoiceIndex: number;
  setCurrentInvoiceIndex: (index: number) => void;

  // Loading/Error states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

const ALL_ASSETS: AssetType[] = ['invoice', 'receipt', 'paper_receipt', 'hotel_folio', 'airline_receipt', 'quote', 'contract'];

const initialState = {
  mode: 'company' as AppMode,
  step: 'home' as AppStep,
  company: null,
  selectedSpendingCategory: null as string | null,
  selectedCurrency: 'USD',
  quickReceiptPrompt: '',
  quickReceiptType: 'receipt' as 'receipt' | 'paper_receipt' | 'photo_receipt',
  receiptImageBlob: null as Blob | null,
  receiptImageScene: 'restaurant_table',
  selectedAssets: [] as AssetType[],
  invoiceCount: 2,
  matchingMode: '2way' as '2way' | '3way',
  lineItemCount: 4,
  generatedAssets: {
    invoice: null,
    receipt: null,
    paper_receipt: null,
    hotel_folio: null,
    airline_receipt: null,
    quote: null,
    contract: null,
  } as Record<AssetType, AssetData | null>,
  generatedInvoices: [] as InvoiceData[],
  currentAsset: null,
  currentInvoiceIndex: 0,
  isLoading: false,
  error: null,
};

export const useStore = create<AppState>((set) => ({
  ...initialState,

  setMode: (mode) => set({ mode }),

  setStep: (step) => set({ step }),

  setCompany: (company) => set({ company }),

  setSelectedSpendingCategory: (category) => set({ selectedSpendingCategory: category }),

  setSelectedCurrency: (currency) => set({ selectedCurrency: currency }),

  setQuickReceiptPrompt: (prompt) => set({ quickReceiptPrompt: prompt }),

  setQuickReceiptType: (type) => set({ quickReceiptType: type }),

  setReceiptImageBlob: (blob) => set({ receiptImageBlob: blob }),

  setReceiptImageScene: (scene) => set({ receiptImageScene: scene }),

  setSelectedAssets: (assets) => set({ selectedAssets: assets }),

  toggleAsset: (asset) =>
    set((state) => ({
      selectedAssets: state.selectedAssets.includes(asset)
        ? state.selectedAssets.filter((a) => a !== asset)
        : [...state.selectedAssets, asset],
    })),

  selectAllAssets: () => set({ selectedAssets: [...ALL_ASSETS] }),

  clearAssets: () => set({ selectedAssets: [] }),

  setInvoiceCount: (count) => set({ invoiceCount: count }),

  setMatchingMode: (mode) => set({ matchingMode: mode }),

  setLineItemCount: (count) => set({ lineItemCount: count }),

  setGeneratedAsset: (type, data) =>
    set((state) => ({
      generatedAssets: {
        ...state.generatedAssets,
        [type]: data,
      },
    })),

  updateGeneratedAsset: (type, data) =>
    set((state) => {
      const current = state.generatedAssets[type];
      if (!current) return state;
      return {
        generatedAssets: {
          ...state.generatedAssets,
          [type]: { ...current, ...data },
        },
      };
    }),

  setGeneratedInvoices: (invoices) => set({ generatedInvoices: invoices }),

  addGeneratedInvoice: (invoice) =>
    set((state) => ({
      generatedInvoices: [...state.generatedInvoices, invoice],
    })),

  updateGeneratedInvoice: (index, data) =>
    set((state) => {
      const invoices = [...state.generatedInvoices];
      if (invoices[index]) {
        invoices[index] = { ...invoices[index], ...data };
      }
      return { generatedInvoices: invoices };
    }),

  batchUpdateDocuments: (updates) =>
    set((state) => {
      const newState: Partial<AppState> = {};
      const newAssets = { ...state.generatedAssets };

      if (updates.quote !== undefined) {
        newAssets.quote = updates.quote;
      }
      if (updates.contract !== undefined) {
        newAssets.contract = updates.contract;
      }
      newState.generatedAssets = newAssets;

      if (updates.invoices !== undefined) {
        newState.generatedInvoices = updates.invoices;
        if (updates.invoices.length > 0) {
          newAssets.invoice = updates.invoices[0];
        }
      }

      return newState;
    }),

  setCurrentAsset: (asset) => set({ currentAsset: asset }),

  setCurrentInvoiceIndex: (index) => set({ currentInvoiceIndex: index }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
