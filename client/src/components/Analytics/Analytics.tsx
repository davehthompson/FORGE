import { useState, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';

interface AnalyticsSummary {
  total: number;
  byType: { type: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byUser: { email: string; count: number }[];
}

interface CompanyEntry {
  name: string;
  domain: string;
  count: number;
  lastUsed: string;
}

interface TimelineEntry {
  date: string;
  count: number;
}

const ASSET_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  paper_receipt: 'Paper Receipt',
  quote: 'Quote',
  contract: 'Contract',
  hotel_folio: 'Hotel Folio',
  airline_receipt: 'Airline Receipt',
};

interface AnalyticsProps {
  open: boolean;
  onClose: () => void;
}

export function Analytics({ open, onClose }: AnalyticsProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [companies, setCompanies] = useState<CompanyEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, companiesRes, timelineRes] = await Promise.all([
        fetch('/api/analytics/summary'),
        fetch('/api/analytics/companies'),
        fetch('/api/analytics/timeline?days=30'),
      ]);

      const summaryData = await summaryRes.json();
      const companiesData = await companiesRes.json();
      const timelineData = await timelineRes.json();

      if (summaryData.success) setSummary(summaryData.data);
      if (companiesData.success) setCompanies(companiesData.data);
      if (timelineData.success) setTimeline(timelineData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const byType = summary?.byType ?? [];
  const byCategory = summary?.byCategory ?? [];
  const byUser = summary?.byUser ?? [];
  const maxTypeCount = byType.length ? Math.max(...byType.map((item) => item.count)) : 1;
  const maxCategoryCount = byCategory.length ? Math.max(...byCategory.map((item) => item.count)) : 1;
  const maxUserCount = byUser.length ? Math.max(...byUser.map((item) => item.count)) : 1;
  const maxTimelineCount = timeline.length ? Math.max(...timeline.map((item) => item.count)) : 1;
  const visibleUsers = showAllUsers ? byUser : byUser.slice(0, 10);
  const shortcut = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  return (
    <div className="fixed inset-0 z-[100] bg-ramp-sand flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-6xl my-8 mx-4">
        <div className="bg-white rounded-md border border-ramp-stone">
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-ramp-stone">
            <div>
              <h1 className="text-xl font-medium text-ramp-slate">Analytics</h1>
              <p className="mt-1 text-sm text-ramp-gray-600">Assets generated in FORGE</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close analytics"
              className="p-1.5 rounded-md text-ramp-gray-600 hover:bg-ramp-sand hover:text-ramp-slate"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-ramp-gray-500 animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <p className="text-ramp-gray-500 text-sm">{error}</p>
                <p className="text-ramp-gray-400 text-xs mt-1">
                  Make sure DATABASE_URL is configured in your environment.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-ramp-stone border border-ramp-stone rounded-md overflow-hidden">
                  <Scalar label="Total assets" value={summary?.total ?? 0} />
                  <Scalar label="Asset types" value={byType.length} />
                  <Scalar label="People" value={byUser.length} />
                  <Scalar label="Businesses" value={companies.length} />
                </div>

                <section>
                  <h2 className="text-sm font-medium text-ramp-slate mb-4">Last 30 days</h2>
                  {timeline.length > 0 ? (
                    <>
                      <div className="flex items-end gap-[3px] h-28">
                        {timeline.map((day) => (
                          <div key={day.date} className="flex-1 h-full flex items-end group relative">
                            <div
                              className="w-full bg-ramp-spring rounded-t-sm"
                              style={{
                                height: day.count === 0 ? 4 : `${(day.count / maxTimelineCount) * 100}%`,
                                minHeight: 4,
                              }}
                            />
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-ramp-slate text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                              {day.date}: {day.count}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-[11px] text-ramp-gray-500 mt-2">
                        <span>{timeline[0]?.date}</span>
                        <span>{timeline[timeline.length - 1]?.date}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-ramp-gray-400">No data yet</p>
                  )}
                </section>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <MeasurementList
                    title="By asset type"
                    rows={byType.map((item) => ({
                      key: item.type,
                      label: ASSET_LABELS[item.type] || item.type,
                      count: item.count,
                    }))}
                    max={maxTypeCount}
                  />
                  <MeasurementList
                    title="By spending category"
                    rows={byCategory.map((item) => ({
                      key: item.category,
                      label: item.category,
                      count: item.count,
                    }))}
                    max={maxCategoryCount}
                  />
                  <div>
                    <h2 className="text-sm font-medium text-ramp-slate mb-4">By user</h2>
                    {byUser.length ? (
                      <>
                        <MeasurementRows
                          rows={visibleUsers.map((item) => ({
                            key: item.email,
                            label: item.email,
                            title: item.email,
                            count: item.count,
                          }))}
                          max={maxUserCount}
                        />
                        {byUser.length > 10 && (
                          <button
                            type="button"
                            onClick={() => setShowAllUsers((value) => !value)}
                            className="mt-3 text-xs text-ramp-gray-500 hover:text-ramp-slate"
                          >
                            {showAllUsers ? 'Show top 10' : `Show all ${byUser.length}`}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-ramp-gray-400">No data yet</p>
                    )}
                  </div>
                </div>

                <section>
                  <div className="flex items-baseline gap-3 mb-4">
                    <h2 className="text-sm font-medium text-ramp-slate">Businesses analyzed</h2>
                    {companies.length > 0 && (
                      <span className="text-xs text-ramp-gray-500 ml-auto">{companies.length} unique</span>
                    )}
                  </div>
                  {companies.length ? (
                    <div className="border border-ramp-stone rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-medium text-ramp-gray-600">
                            <th className="px-3 py-2 font-medium">Company</th>
                            <th className="px-3 py-2 font-medium">Domain</th>
                            <th className="px-3 py-2 font-medium text-right">Assets</th>
                            <th className="px-3 py-2 font-medium text-right">Last used</th>
                          </tr>
                        </thead>
                        <tbody>
                          {companies.map((company, index) => (
                            <tr key={`${company.domain}-${index}`} className="border-t border-ramp-stone">
                              <td className="px-3 py-2 text-ramp-slate">{company.name}</td>
                              <td className="px-3 py-2 text-ramp-gray-600">{company.domain}</td>
                              <td className="px-3 py-2 text-ramp-slate text-right tabular-nums">{company.count}</td>
                              <td className="px-3 py-2 text-ramp-gray-600 text-right">
                                {new Date(company.lastUsed).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-ramp-gray-400">No data yet</p>
                  )}
                </section>
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-ramp-stone">
            <p className="text-xs text-ramp-gray-500 text-center">
              Press <kbd className="px-1.5 py-0.5 bg-ramp-sand border border-ramp-stone rounded text-[10px] font-mono">{shortcut}+S</kbd> to toggle
              {' · '}
              <kbd className="px-1.5 py-0.5 bg-ramp-sand border border-ramp-stone rounded text-[10px] font-mono">Esc</kbd> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Scalar({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-ramp-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-medium text-ramp-slate tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function MeasurementList({
  title,
  rows,
  max,
}: {
  title: string;
  rows: { key: string; label: string; count: number; title?: string }[];
  max: number;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium text-ramp-slate mb-4">{title}</h2>
      {rows.length ? <MeasurementRows rows={rows} max={max} /> : <p className="text-sm text-ramp-gray-400">No data yet</p>}
    </section>
  );
}

function MeasurementRows({
  rows,
  max,
}: {
  rows: { key: string; label: string; count: number; title?: string }[];
  max: number;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-center justify-between gap-3 text-sm mb-1">
            <span className="text-ramp-slate truncate" title={row.title ?? row.label}>
              {row.label}
            </span>
            <span className="text-ramp-slate tabular-nums flex-shrink-0">{row.count.toLocaleString()}</span>
          </div>
          <div className="h-1 bg-ramp-stone">
            <div
              className="h-full bg-ramp-slate"
              style={{ width: `${Math.max((row.count / max) * 100, row.count > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
