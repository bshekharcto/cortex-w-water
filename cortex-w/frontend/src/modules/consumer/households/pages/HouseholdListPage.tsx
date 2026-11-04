import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Eye, Home, MapPin, RefreshCw, RotateCcw, Users } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { KpiCard } from '@/components/cards/KpiCard';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { DashboardLoader } from '@/modules/dashboard/components/DashboardLoader';
import { householdApi, type HouseholdSortField, type HouseholdSummary } from '@/services/api/householdApi';
import { networkApi, type NetSiteOption } from '@/services/api/networkApi';
import { SiteTreeSelect } from '@/modules/command-center/components/SiteTreeSelect';
import { formatNumber } from '@/utils/number';
import type { HouseholdDTO } from '../types/household.types';
import { HouseholdDetailDrawer } from '../components/HouseholdDetailDrawer';
import '@/modules/gis/shared/gis.css';

const PAGE_SIZE = 25;
const SITE_TONES = ['blue', 'teal', 'purple', 'orange', 'green', 'primary'] as const;
type Tone = (typeof SITE_TONES)[number];

/** A site always gets the same colour: on its card, and on the tag in every row that belongs to it. */
function toneFor(name: string | undefined | null, sites: HouseholdSummary['sites'] | undefined): Tone {
  if (!name) return 'primary';
  const i = sites?.findIndex((s) => s.name === name) ?? -1;
  if (i >= 0) return SITE_TONES[i % SITE_TONES.length];
  let h = 0; // a site below the top-level ones (not on a card): a steady colour from its name
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SITE_TONES[h % SITE_TONES.length];
}

/** A small coloured tag: tinted background, soft border, text in the tone. */
function Tag({ tone, children, title, mono }: { tone: Tone | 'muted'; children: ReactNode; title?: string; mono?: boolean }) {
  const c = tone === 'muted' ? 'var(--cw-text-muted)' : `var(--cw-${tone})`;
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999,
        fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', color: c,
        fontFamily: mono ? 'monospace' : undefined,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 28%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

const isAborted = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';
const errorText = (e: unknown, fallback: string) => (e as { operatorMessage?: string; message?: string } | null)?.operatorMessage || fallback;

/** The Households page: every count, name and site on it comes from the client's own records. */
export function HouseholdListPage() {
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);
  const [households, setHouseholds] = useState<HouseholdDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(0);
  // 'ALL', or the ids of the chosen sites separated by commas: the same value the Network Explorer's site tree works with
  const [siteValue, setSiteValue] = useState<string>('ALL');
  const [sites, setSites] = useState<NetSiteOption[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HouseholdDTO | null>(null);
  const [sort, setSort] = useState<{ field: HouseholdSortField; dir: 'asc' | 'desc' } | null>(null); // null: the order the records come in
  const [refreshTick, setRefreshTick] = useState(0); // the Refresh button: asks for the counts again, past the server's kept copy
  const controller = useRef<AbortController | null>(null);

  // the counts above the table
  useEffect(() => {
    const ac = new AbortController();
    householdApi
      .summary(ac.signal, refreshTick > 0)
      .then(setSummary)
      .catch((e) => {
        if (!isAborted(e)) console.warn('[households] summary failed:', e);
      });
    return () => ac.abort();
  }, [refreshTick]);

  // the site tree: the same list the Network Explorer and the Dashboard filter by
  useEffect(() => {
    const ac = new AbortController();
    networkApi
      .listSites(ac.signal)
      .then((list) => setSites(list.filter((s) => s.id !== 'ALL')))
      .catch(() => setSites([])); // the picker then offers "All my sites" only
    return () => ac.abort();
  }, []);

  // search asks the server once the user pauses, and starts again at the first page
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    controller.current?.abort(); // a slow answer for an earlier page, search or site never replaces a newer one
    const ac = new AbortController();
    controller.current = ac;
    setIsLoading(true);
    setError(null);
    try {
      const res = await householdApi.list({ page, size: PAGE_SIZE, search: search || undefined, siteIds: siteValue !== 'ALL' ? siteValue.split(',').map(Number).filter(Number.isInteger) : undefined, sort: sort?.field, dir: sort?.dir }, ac.signal);
      if (ac.signal.aborted) return;
      const rows = Array.isArray(res?.content) ? res.content : [];
      // the list shrank (a refresh, another filter): a page past the end shows the first page instead of nothing
      if (rows.length === 0 && page > 0) {
        setPage(0);
        return;
      }
      setHouseholds(rows);
      setTotal(res?.totalElements ?? 0);
      setTotalPages(Math.max(1, res?.totalPages ?? 1));
      setFirstLoadDone(true);
    } catch (e) {
      if (ac.signal.aborted || isAborted(e)) return;
      setError(errorText(e, 'Could not load the households.'));
      setFirstLoadDone(true);
    } finally {
      if (!ac.signal.aborted) setIsLoading(false);
    }
  }, [page, search, siteValue, sort]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  // a click on a heading sorts by it (ascending, then descending); the server sorts all the households, not just this page
  const toggleSort = (field: HouseholdSortField) => {
    setSort((cur) => (cur?.field === field ? { field, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
    setPage(0);
  };
  const SortTh = ({ field, children }: { field: HouseholdSortField; children: ReactNode }) => (
    <th style={{ cursor: 'pointer' }} onClick={() => toggleSort(field)} aria-sort={sort?.field === field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
        {sort?.field !== field ? <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} /> : sort.dir === 'asc' ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />}
      </div>
    </th>
  );

  const refresh = () => {
    setRefreshTick((t) => t + 1);
    load();
  };

  const chooseSite = (value: string) => {
    setSiteValue((cur) => (cur === value ? 'ALL' : value));
    setPage(0);
  };
  const reset = () => {
    setSearchInput('');
    setSearch('');
    setSiteValue('ALL');
    setSort(null);
    setPage(0);
  };

  const filteredBySite = siteValue !== 'ALL';
  const toolbar = (
    <FilterBar
      inline
      searchValue={searchInput}
      onSearchChange={setSearchInput}
      searchPlaceholder="Search consumer ID, name or mobile..."
      onReset={searchInput || filteredBySite || sort ? reset : undefined}
    >
      <SiteTreeSelect sites={sites} value={siteValue} onChange={(v) => { setSiteValue(v); setPage(0); }} />
    </FilterBar>
  );

  const heading = (
    <div className="cw-toolbar-left">
      <h2 className="cw-section-title" style={{ margin: 0 }}>Household Records</h2>
      {toolbar}
    </div>
  );

  return (
    <div>
      {/* Page title and Refresh, like the other pages */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2 className="cw-section-title" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          Consumer Household Directory
        </h2>
        <button
          onClick={refresh}
          className="cw-button-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}
          title="Refresh households"
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'cw-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div
          className="cw-surface"
          role="alert"
          style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderColor: 'var(--cw-red, #ef4444)', borderWidth: 1, borderStyle: 'solid', background: 'var(--cw-red-subtle, rgba(239, 68, 68, 0.08))' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--cw-red, #dc2626)' }}>
            <AlertTriangle size={20} />
            <div>
              <strong>Failed to load households:</strong> {error}
            </div>
          </div>
          <button className="cw-btn" onClick={load} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            <RotateCcw size={14} style={{ marginRight: 4 }} /> Retry
          </button>
        </div>
      )}

      {!firstLoadDone ? (
        <DashboardLoader label="Loading households…" />
      ) : (
        <>
          {/* the counts: the whole client, then each top-level site (click one to filter the table to it) */}
          <div className="cw-kpi-wrap" style={{ marginBottom: 24 }}>
            <div className="cw-kpi-grid cw-kpi-grid--balanced" data-cards={1 + (summary?.sites.length ?? 0)}>
              <KpiCard
                icon={Users}
                iconTone="primary"
                label="Total Households"
                value={summary?.total != null ? formatNumber(summary.total) : '—'}
                subtitle="Registered consumers"
                selected={!filteredBySite}
                onClick={filteredBySite ? () => chooseSite(siteValue) : undefined}
              />
              {(summary?.sites ?? []).map((s) => (
                <KpiCard
                  key={s.id}
                  icon={siteValue === String(s.id) ? MapPin : Home}
                  iconTone={toneFor(s.name, summary?.sites)}
                  label={s.name}
                  value={s.count != null ? formatNumber(s.count) : '—'}
                  subtitle={siteValue === String(s.id) ? 'Showing in the table · click to clear' : 'Click to filter the table'}
                  selected={siteValue === String(s.id)}
                  onClick={() => chooseSite(String(s.id))}
                />
              ))}
            </div>
          </div>

          <section className="cw-section">
            {heading}
            {households.length === 0 && !isLoading ? (
              <EmptyState message={search || filteredBySite ? 'No households match your search.' : 'No household records found.'} />
            ) : (
              <div className="cw-surface cw-table-wrap" style={isLoading ? { opacity: 0.55, pointerEvents: 'none', transition: 'opacity 0.15s' } : undefined} aria-busy={isLoading}>
                <table className="cw-table cw-table--centered">
                  <thead>
                    <tr>
                      <SortTh field="customId">Consumer ID</SortTh>
                      <SortTh field="name">Consumer Name</SortTh>
                      <th>Site</th>
                      <SortTh field="location">Location / Ward</SortTh>
                      <SortTh field="mobile">Mobile</SortTh>
                      <SortTh field="status">Status</SortTh>
                      <SortTh field="registrationDate">Registered</SortTh>
                      <th style={{ width: 70 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {households.map((h) => (
                      <tr key={h.id ?? h.customId} className="cw-table-row--clickable" onClick={() => setSelected(h)} title={`Open 360° view for ${h.customId || h.name}`}>
                        <td>{h.customId ? <Tag tone="primary" mono>{h.customId}</Tag> : '—'}</td>
                        <td style={{ fontWeight: 500, maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.name || undefined}>{h.name || '—'}</td>
                        <td>
                          {h.siteName ? (
                            <Tag tone={toneFor(h.siteName, summary?.sites)}>
                              <MapPin size={11} /> {h.siteName}
                            </Tag>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', maxWidth: 260 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.location || undefined}>{h.location || '—'}</span>
                            {h.ward && <Tag tone="muted">Ward {h.ward}</Tag>}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{h.mobile ? `${h.countryCode || ''} ${h.mobile}`.trim() : '—'}</td>
                        <td>
                          {h.status ? (
                            <Tag tone={h.status.toUpperCase() === 'ACTIVE' ? 'green' : h.status.toUpperCase() === 'INACTIVE' ? 'muted' : 'orange'}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                              {h.status.charAt(0).toUpperCase() + h.status.slice(1).toLowerCase()}
                            </Tag>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>{h.registrationDate ? h.registrationDate.slice(0, 10) : '—'}</td>
                        <td>
                          <button
                            className="cw-icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(h);
                            }}
                            title="Inspect 360"
                            aria-label={`Open 360° view for ${h.customId || h.name}`}
                            style={{ padding: '5px 8px', display: 'inline-flex', alignItems: 'center', color: 'var(--cw-primary)', borderRadius: 6, background: 'color-mix(in srgb, var(--cw-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cw-primary) 30%, transparent)' }}
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                <button className="cw-icon-btn" disabled={page === 0 || isLoading} onClick={() => setPage(Math.max(0, page - 1))} style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronLeft size={16} /> Prev
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                  Page {page + 1} of {totalPages} · {total.toLocaleString()} {total === 1 ? 'household' : 'households'}
                </span>
                <button className="cw-icon-btn" disabled={page >= totalPages - 1 || isLoading} onClick={() => setPage(Math.min(totalPages - 1, page + 1))} style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <HouseholdDetailDrawer household={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
