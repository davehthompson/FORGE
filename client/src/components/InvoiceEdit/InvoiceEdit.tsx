import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowLeft, Download, FileScan, PenLine, Sparkles } from 'lucide-react';
import { Button, Card, CardContent } from '../ui';
import { useStore } from '../../hooks/useStore';
import { readInvoiceFile, type LoadedInvoice } from '../../services/invoiceFile';
import { extractInvoiceFields, type EditField } from '../../services/invoiceEditApi';
import { downloadBlob, exportEditedInvoice } from '../../services/invoiceEditExport';

const GROUPS: Array<{ id: EditField['group']; title: string }> = [
  { id: 'header', title: 'Header' },
  { id: 'party', title: 'Parties' },
  { id: 'line', title: 'Line items' },
  { id: 'totals', title: 'Totals' },
  { id: 'custom', title: 'Drawn replacements' },
];

export function InvoiceEdit() {
  const { setStep } = useStore();
  const [invoice, setInvoice] = useState<LoadedInvoice | null>(null);
  const [fields, setFields] = useState<EditField[]>([]);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = invoice?.pages[page];

  const openFile = async (file: File) => {
    setError(null);
    setNotice(null);
    setFields([]);
    setStatus('Opening the file...');
    try {
      const loaded = await readInvoiceFile(file);
      setInvoice(loaded);
      setPage(0);
      setStatus('Reading the invoice...');
      const extracted = await extractInvoiceFields(loaded.pages, setStatus);
      setFields(extracted);
      setSelectedId(extracted[0]?.id ?? null);
      setStatus(null);
      if (!extracted.length) {
        setNotice('No fields were labeled. Draw a box on the page to replace any text.');
      }
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Could not read that invoice');
    }
  };

  const updateValue = (id: string, value: string) => {
    setFields((currentFields) => currentFields.map((field) => (field.id === id ? { ...field, value } : field)));
  };

  const requireField = (id: string, message: string) => {
    const field = fields.find((item) => item.id === id);
    if (!field) {
      setNotice(message);
      return null;
    }
    setNotice(null);
    setSelectedId(id);
    return field;
  };

  const applyInvoiceNumber = () => {
    const field = requireField('invoiceNumber', 'No invoice number was detected. Draw a box over it to replace it.');
    if (!field) return;
    updateValue(field.id, `TEST-${Date.now().toString().slice(-6)}`);
  };

  const applyUom = () => {
    const targets = fields.filter((field) => field.label.endsWith('UOM'));
    if (!targets.length) {
      setNotice('No unit of measure was detected on the line items.');
      return;
    }
    setNotice(null);
    setFields((currentFields) =>
      currentFields.map((field) => {
        if (!field.label.endsWith('UOM')) return field;
        const next = /^(ea|each|unit|pc|pcs)$/i.test(field.value.trim()) ? 'CS' : 'EA';
        return { ...field, value: next };
      }),
    );
    setSelectedId(targets[0].id);
  };

  const applyTax = () => {
    const field = requireField('tax', 'No tax amount was detected. Draw a box over it to replace it.');
    if (!field) return;
    updateValue(field.id, '0.00');
  };

  const applyMismatch = () => {
    const field = requireField('total', 'No total was detected. Draw a box over it to replace it.');
    if (!field) return;
    const amount = Number(field.value.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount)) {
      updateValue(field.id, `${field.value} +1`);
      return;
    }
    const prefix = field.value.trim().startsWith('$') ? '$' : '';
    updateValue(field.id, `${prefix}${(amount * 1.1).toFixed(2)}`);
  };

  const anonymize = () => {
    const vendor = fields.find((field) => field.id === 'vendorName');
    const billTo = fields.find((field) => field.id === 'billTo');
    if (!vendor && !billTo) {
      setNotice('No vendor or bill-to name was detected.');
      return;
    }
    setNotice(null);
    setFields((currentFields) =>
      currentFields.map((field) => {
        if (field.id === 'vendorName') return { ...field, value: 'Acme Supplies' };
        if (field.id === 'billTo') return { ...field, value: 'Northwind Labs' };
        return field;
      }),
    );
  };

  const localPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawMode || !current) return;
    const point = localPoint(event);
    drag.current = point;
    setDraft({ x: point.x, y: point.y, w: 0, h: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const point = localPoint(event);
    const x = Math.min(drag.current.x, point.x);
    const y = Math.min(drag.current.y, point.y);
    setDraft({ x, y, w: Math.abs(point.x - drag.current.x), h: Math.abs(point.y - drag.current.y) });
  };

  const onPointerUp = () => {
    if (!drag.current || !draft || !current) {
      drag.current = null;
      return;
    }
    drag.current = null;
    const box = draft;
    setDraft(null);
    if (box.w < 0.01 || box.h < 0.008) return;
    const id = `custom-${Date.now()}`;
    const field: EditField = {
      id,
      group: 'custom',
      label: 'Replacement',
      original: '',
      value: '',
      page: current.page,
      ...box,
    };
    setFields((currentFields) => [...currentFields, field]);
    setSelectedId(id);
    setDrawMode(false);
  };

  const exportBoth = async () => {
    if (!invoice) return;
    setExporting(true);
    setError(null);
    try {
      const { pdf, json } = await exportEditedInvoice(invoice, fields);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(pdf, `forge-invoice-${stamp}.pdf`);
      downloadBlob(json, `forge-invoice-${stamp}-expected-ocr.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!invoice) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
        <Card variant="elevated" padding="lg" className="w-full max-w-xl">
          <CardContent>
            <button
              onClick={() => setStep('home')}
              className="mb-6 inline-flex items-center gap-2 text-sm text-ramp-sage hover:text-ramp-slate"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ramp-sand mb-4">
                <FileScan className="w-8 h-8 text-ramp-slate" />
              </div>
              <h1 className="text-2xl font-bold text-ramp-slate mb-2">Edit a prospect invoice</h1>
              <p className="text-sm text-ramp-sage">
                Drop one PDF or image. Change what is printed on it, then download the edited file and the values OCR should return. The file stays in this browser session.
              </p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void openFile(file);
              }}
              className="w-full rounded-xl border-2 border-dashed border-ramp-stone bg-ramp-sand/40 px-6 py-10 text-sm text-ramp-slate hover:border-ramp-slate"
            >
              {status || 'Drop a PDF, PNG, or JPG — or click to browse'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void openFile(file);
              }}
            />
            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
            <p className="mt-4 text-xs text-ramp-sage text-center">
              One invoice, up to 6 pages. Use this for a themed OCR test, not a stack of files.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pageFields = fields.filter((field) => field.page === current?.page);

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ramp-stone bg-white px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => setStep('home')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Home
        </Button>
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-medium text-ramp-slate">Prospect invoice</p>
          <p className="text-xs text-ramp-sage">{status || 'Edits stay on the original layout'}</p>
        </div>
        {invoice.pages.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-ramp-slate">
            <button disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="px-2 py-1 rounded border border-ramp-stone disabled:opacity-40">Prev</button>
            <span>Page {page + 1} / {invoice.pages.length}</span>
            <button disabled={page === invoice.pages.length - 1} onClick={() => setPage((n) => n + 1)} className="px-2 py-1 rounded border border-ramp-stone disabled:opacity-40">Next</button>
          </div>
        )}
        <Button size="sm" onClick={() => void exportBoth()} disabled={exporting}>
          <Download className="w-4 h-4 mr-1" />
          {exporting ? 'Exporting...' : 'Export PDF + expected OCR'}
        </Button>
      </div>

      {(error || notice) && (
        <div className={`px-4 py-2 text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-ramp-solar/20 text-ramp-slate'}`}>
          {error || notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-ramp-stone bg-ramp-sand/40 px-4 py-2">
        <Chip onClick={applyInvoiceNumber}>New invoice number</Chip>
        <Chip onClick={applyUom}>Swap UOM</Chip>
        <Chip onClick={applyTax}>Zero tax</Chip>
        <Chip onClick={applyMismatch}>Mismatch total</Chip>
        <Chip onClick={anonymize}>Anonymize names</Chip>
        <Chip onClick={() => setDrawMode((on) => !on)} active={drawMode}>
          <PenLine className="w-3 h-3" />
          {drawMode ? 'Drawing… drag a box' : 'Draw a replacement'}
        </Chip>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] min-h-0">
        <div className="overflow-auto bg-ramp-gray-100 p-6">
          {current && (
            <div
              className={`relative mx-auto max-w-3xl shadow-lg ${drawMode ? 'cursor-crosshair' : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <img src={current.previewUrl} alt={`Invoice page ${page + 1}`} className="block w-full h-auto bg-white" draggable={false} />
              {pageFields.map((field) => {
                const dirty = field.value !== field.original;
                const selected = field.id === selectedId;
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (drawMode) return;
                      setSelectedId(field.id);
                    }}
                    className={`absolute text-left overflow-hidden ${
                      dirty ? 'bg-white text-ramp-slate' : 'bg-transparent'
                    } ${selected ? 'ring-2 ring-ramp-slate' : 'ring-1 ring-ramp-solar/70'}`}
                    style={{
                      left: `${field.x * 100}%`,
                      top: `${field.y * 100}%`,
                      width: `${field.w * 100}%`,
                      height: `${field.h * 100}%`,
                      fontSize: dirty ? '10px' : 0,
                      lineHeight: 1.1,
                    }}
                  >
                    {dirty ? field.value : ''}
                  </button>
                );
              })}
              {draft && (
                <div
                  className="absolute border-2 border-ramp-slate bg-white/40"
                  style={{
                    left: `${draft.x * 100}%`,
                    top: `${draft.y * 100}%`,
                    width: `${draft.w * 100}%`,
                    height: `${draft.h * 100}%`,
                  }}
                />
              )}
            </div>
          )}
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-ramp-stone bg-white overflow-auto p-4 space-y-5">
          {GROUPS.map((group) => {
            const items = fields.filter((field) => field.group === group.id);
            if (!items.length) return null;
            return (
              <section key={group.id}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ramp-sage mb-2">{group.title}</h2>
                <div className="space-y-3">
                  {items.map((field) => {
                    const dirty = field.value !== field.original;
                    return (
                      <label key={field.id} className="block">
                        <span className="flex items-center justify-between text-xs text-ramp-sage mb-1">
                          {field.label}
                          {dirty && <span className="text-ramp-slate">Edited</span>}
                        </span>
                        <input
                          value={field.value}
                          onFocus={() => {
                            setSelectedId(field.id);
                            setPage(field.page);
                          }}
                          onChange={(event) => updateValue(field.id, event.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm text-ramp-slate focus:outline-none focus:ring-2 focus:ring-ramp-slate/20 ${
                            field.id === selectedId ? 'border-ramp-slate' : 'border-ramp-stone'
                          }`}
                        />
                        {dirty && field.original && (
                          <span className="mt-1 block text-[11px] text-ramp-sage line-through">{field.original}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!fields.length && !status && (
            <p className="text-sm text-ramp-sage flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5" />
              Draw a box on the page to cover any text and type what OCR should read instead.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
        active ? 'border-ramp-slate bg-ramp-slate text-white' : 'border-ramp-stone bg-white text-ramp-slate hover:bg-ramp-sand'
      }`}
    >
      {children}
    </button>
  );
}
