import { useState, useEffect, useCallback } from 'react';
import { X, BarChart3, Building2, Tag, FileText, Loader2, Globe, User } from 'lucide-react';

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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const maxTypeCount = summary?.byType.length
    ? Math.max(...summary.byType.map((t) => t.count))
    : 1;
  const maxCategoryCount = summary?.byCategory.length
    ? Math.max(...summary.byCategory.map((c) => c.count))
    : 1;
  // Defensive `?.` chain so older server payloads (pre-byUser deploy) don't
  // crash the dashboard during a partial rollout.
  const maxUserCount = summary?.byUser?.length
    ? Math.max(...summary.byUser.map((u) => u.count))
    : 1;
  const maxTimelineCount = timeline.length
    ? Math.max(...timeline.map((t) => t.count))
    : 1;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-6xl my-8 mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-ramp-stone">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-ramp-slate" />
              <h1 className="text-xl font-bold text-ramp-slate">Analytics</h1>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-ramp-sand transition-colors"
            >
              <X className="w-5 h-5 text-ramp-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="px-8 py-6">
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
                {/* Total */}
                <div className="text-center py-4">
                  <p className="text-5xl font-bold text-ramp-slate">
                    {summary?.total.toLocaleString() || 0}
                  </p>
                  <p className="text-sm text-ramp-sage mt-1">
                    total assets generated
                  </p>
                </div>

                {/* Grid: By Type + By Category + By User */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* By Asset Type */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="w-4 h-4 text-ramp-gray-600" />
                      <h2 className="text-sm font-semibold text-ramp-slate uppercase tracking-wide">
                        By Asset Type
                      </h2>
                    </div>
                    {summary?.byType.length ? (
                      <div className="space-y-3">
                        {summary.byType.map((item) => (
                          <div key={item.type}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-ramp-slate">
                                {ASSET_LABELS[item.type] || item.type}
                              </span>
                              <span className="font-medium text-ramp-slate">
                                {item.count}
                              </span>
                            </div>
                            <div className="h-2 bg-ramp-stone rounded-full overflow-hidden">
                              <div
                                className="h-full bg-ramp-slate rounded-full transition-all duration-500"
                                style={{ width: `${(item.count / maxTypeCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ramp-gray-400">No data yet</p>
                    )}
                  </div>

                  {/* By Spending Category */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Tag className="w-4 h-4 text-ramp-gray-600" />
                      <h2 className="text-sm font-semibold text-ramp-slate uppercase tracking-wide">
                        By Spending Category
                      </h2>
                    </div>
                    {summary?.byCategory.length ? (
                      <div className="space-y-3">
                        {summary.byCategory.map((item) => (
                          <div key={item.category}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-ramp-slate truncate mr-2">
                                {item.category}
                              </span>
                              <span className="font-medium text-ramp-slate flex-shrink-0">
                                {item.count}
                              </span>
                            </div>
                            <div className="h-2 bg-ramp-stone rounded-full overflow-hidden">
                              <div
                                className="h-full bg-ramp-spring rounded-full transition-all duration-500"
                                style={{ width: `${(item.count / maxCategoryCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ramp-gray-400">No data yet</p>
                    )}
                  </div>

                  {/* By User (Cloudflare Access email) */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <User className="w-4 h-4 text-ramp-gray-600" />
                      <h2 className="text-sm font-semibold text-ramp-slate uppercase tracking-wide">
                        By User
                      </h2>
                    </div>
                    {summary?.byUser?.length ? (
                      <>
                        <div className="space-y-3">
                          {(showAllUsers ? summary.byUser : summary.byUser.slice(0, 10)).map(
                            (item) => (
                              <div key={item.email}>
                                <div className="flex items-center justify-between text-sm mb-1 gap-2">
                                  <span
                                    className="text-ramp-slate truncate"
                                    title={item.email}
                                  >
                                    {item.email}
                                  </span>
                                  <span className="font-medium text-ramp-slate flex-shrink-0">
                                    {item.count}
                                  </span>
                                </div>
                                <div className="h-2 bg-ramp-stone rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-ramp-sage rounded-full transition-all duration-500"
                                    style={{ width: `${(item.count / maxUserCount) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                        {summary.byUser.length > 10 && (
                          <button
                            type="button"
                            onClick={() => setShowAllUsers((v) => !v)}
                            className="mt-3 text-xs text-ramp-gray-500 hover:text-ramp-slate transition-colors"
                          >
                            {showAllUsers
                              ? 'Show top 10'
                              : `Show all ${summary.byUser.length}`}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-ramp-gray-400">No data yet</p>
                    )}
                  </div>
                </div>

                {/* Timeline (last 30 days) */}
                {timeline.length > 0 && maxTimelineCount > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-4 h-4 text-ramp-gray-600" />
                      <h2 className="text-sm font-semibold text-ramp-slate uppercase tracking-wide">
                        Last 30 Days
                      </h2>
                    </div>
                    <div className="flex items-end gap-[3px] h-28">
                      {timeline.map((day) => (
                        <div
                          key={day.date}
                          className="flex-1 group relative"
                        >
                          <div
                            className="w-full bg-ramp-slate/80 rounded-t hover:bg-ramp-slate transition-colors"
                            style={{
                              height: `${Math.max((day.count / maxTimelineCount) * 100, 4)}%`,
                            }}
                          />
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-ramp-slate text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            {day.date}: {day.count}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-ramp-gray-400 mt-1">
                      <span>{timeline[0]?.date}</span>
                      <span>{timeline[timeline.length - 1]?.date}</span>
                    </div>
                  </div>
                )}

                {/* Companies */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-4 h-4 text-ramp-gray-600" />
                    <h2 className="text-sm font-semibold text-ramp-slate uppercase tracking-wide">
                      Businesses Analyzed
                    </h2>
                    {companies.length > 0 && (
                      <span className="text-xs text-ramp-gray-400 ml-auto">
                        {companies.length} unique
                      </span>
                    )}
                  </div>
                  {companies.length ? (
                    <div className="border border-ramp-stone rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-ramp-sand text-left">
                            <th className="px-4 py-2.5 font-medium text-ramp-gray-600">Company</th>
                            <th className="px-4 py-2.5 font-medium text-ramp-gray-600">Domain</th>
                            <th className="px-4 py-2.5 font-medium text-ramp-gray-600 text-right">Assets</th>
                            <th className="px-4 py-2.5 font-medium text-ramp-gray-600 text-right">Last Used</th>
                          </tr>
                        </thead>
                        <tbody>
                          {companies.map((c, i) => (
                            <tr
                              key={`${c.domain}-${i}`}
                              className="border-t border-ramp-stone"
                            >
                              <td className="px-4 py-2.5 text-ramp-slate font-medium">
                                <div className="flex items-center gap-2">
                                  <Globe className="w-3.5 h-3.5 text-ramp-gray-400 flex-shrink-0" />
                                  {c.name}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-ramp-gray-600">{c.domain}</td>
                              <td className="px-4 py-2.5 text-ramp-slate font-medium text-right">{c.count}</td>
                              <td className="px-4 py-2.5 text-ramp-gray-500 text-right">
                                {new Date(c.lastUsed).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-ramp-gray-400">No data yet</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-4 border-t border-ramp-stone bg-ramp-sand/50">
            <p className="text-xs text-ramp-gray-400 text-center">
              Press <kbd className="px-1.5 py-0.5 bg-white border border-ramp-stone rounded text-[10px] font-mono">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+S
              </kbd> to toggle &middot; <kbd className="px-1.5 py-0.5 bg-white border border-ramp-stone rounded text-[10px] font-mono">Esc</kbd> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
