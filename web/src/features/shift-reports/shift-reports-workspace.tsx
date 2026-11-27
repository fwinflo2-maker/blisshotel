'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays, FileText, RefreshCw, Search } from 'lucide-react';
import ShiftReportPrintDialog from './shift-report-print-dialog';
import type { ShiftReport } from './types';

type HotelInfo = { name: string; currency: string; timezone: string };

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? 'Chargement impossible.');
  return data;
}

function formatMoney(value: string, _currency: string) {
  void _currency;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' }).format(Number(value));
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export default function ShiftReportsWorkspace() {
  const [reports, setReports] = useState<ShiftReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shiftType, setShiftType] = useState('');
  const [hotel, setHotel] = useState<HotelInfo>({ name: 'BLISS HÔTEL', currency: 'XAF', timezone: 'Africa/Brazzaville' });
  const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = 1) => {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (shiftType) params.set('shiftType', shiftType);
      const data = await loadJson<{ reports: ShiftReport[]; total: number; page: number; hotel: HotelInfo }>(`/api/shift-reports?${params}`);
      setReports(data.reports);
      setTotal(data.total);
      setPage(data.page);
      setHotel(data.hotel);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setBusy(false);
    }
  }, [from, to, shiftType]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1);
  }

  const pages = Math.max(1, Math.ceil(total / 25));
  return <section className="sa-panel sa-table-panel">
    <div className="sa-panel-heading">
      <div><p>Réception &amp; bar-restaurant · lecture et export</p><h2>Rapports de fin de service <small>{total}</small></h2></div>
      <button className="sa-button" type="button" disabled={busy} onClick={() => void load(page)}><RefreshCw size={14} /> Actualiser</button>
    </div>
    <form className="sa-audit-filters" onSubmit={applyFilters}>
      <label><span>Du</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label><span>Au</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label><span>Service</span><select value={shiftType} onChange={(event) => setShiftType(event.target.value)}><option value="">Tous</option><option value="DAY">Jour · 08 h–18 h</option><option value="NIGHT">Nuit · 18 h–08 h</option></select></label>
      <button className="sa-button primary"><Search size={14} /> Filtrer</button>
    </form>
    {error && <div className="sa-alert is-error" role="alert">{error}</div>}
    {busy && <div className="sa-loading" role="status">Chargement des rapports…</div>}
    {!busy && reports.length ? <div className="sa-table-wrap"><table className="sa-table">
      <thead><tr><th>Date / service</th><th>Responsable</th><th>Clôture</th><th>Paiements</th><th>Dépenses</th><th>Écart caisse</th><th>Document</th></tr></thead>
      <tbody>{reports.map((report) => <tr key={report.id}>
        <td><strong>{report.summary.department === 'BAR_RESTAURANT' ? 'Bar & restaurant · 08 h à 08 h le lendemain' : `Réception · ${report.shiftType === 'DAY' ? 'Jour' : 'Nuit'}`}</strong><small>{report.shiftDate}</small><small>Heures réelles : {formatDateTime(report.startedAt, hotel.timezone)} – {formatDateTime(report.endedAt, hotel.timezone)}</small></td>
        <td>{report.user.name}</td>
        <td>{formatMoney(report.summary.cash.expectedCash, hotel.currency)}<small>Compté {formatMoney(report.summary.cash.countedAmount, hotel.currency)}</small></td>
        <td>{formatMoney(report.summary.payments.total, hotel.currency)}<small>{report.summary.payments.count} règlement(s)</small></td>
        <td>{formatMoney(report.summary.cash.totalExpenses, hotel.currency)}<small>{report.expenses.length} dépense(s)</small></td>
        <td>{formatMoney(report.summary.cash.variance, hotel.currency)}</td>
        <td><button className="sa-button subtle" type="button" onClick={() => setSelectedReport(report)}><FileText size={14} /> Voir / PDF</button></td>
      </tr>)}</tbody>
    </table></div> : !busy && <div className="sa-empty"><span><CalendarDays size={18} /></span><p>Aucun rapport de fin de service pour cette période.</p></div>}
    <div className="sa-pagination"><span>Page {page} / {pages}</span><div>
      <button className="sa-button" type="button" disabled={page <= 1 || busy} onClick={() => void load(page - 1)}>Précédent</button>
      <button className="sa-button" type="button" disabled={page >= pages || busy} onClick={() => void load(page + 1)}>Suivant</button>
    </div></div>
    {selectedReport && <ShiftReportPrintDialog report={selectedReport} hotel={hotel} close={() => setSelectedReport(null)} />}
  </section>;
}
