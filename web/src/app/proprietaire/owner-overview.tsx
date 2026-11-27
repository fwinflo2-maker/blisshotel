'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, BedDouble, CalendarDays, CircleDollarSign, FileText, RefreshCw, Utensils, Wallet } from 'lucide-react';
import styles from './owner-overview.module.css';
import { RevenueTrendChart } from '@/components/dashboard-charts';
import ReceptionistPerformance from '@/features/reception-performance/receptionist-performance';
import type { PerformanceGranularity, ReceptionistPerformance as ReceptionistPerformanceData } from '@/features/reception-performance/domain';
import BusinessActivityExplorer from '@/components/business-activity-explorer';
import ShiftReportPrintDialog from '@/features/shift-reports/shift-report-print-dialog';
import type { ShiftReport } from '@/features/shift-reports/types';

type Overview = {
  hotel: { name: string; currency: string; timezone: string };
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  finance: { invoiced: string; invoiceCount: number; collected: string; paymentCount: number; outstanding: string; debtors: number; expenses: string; expenseCount: number; previousInvoiced: string; previousCollected: string; estimatedOperatingResult: string | null };
  commissions: { total: string; count: number; byReceptionist: { name: string; amount: string }[] };
  rooms: { total: number; occupied: number; available: number; reserved: number; dirty: number; outOfService: number; maintenance: number; occupancyRate: number };
  operations: { arrivals: number; departures: number; pendingReservations: number; confirmedReservations: number; cancelledReservations: number; activeStays: number };
  restaurant: { orderAmount: string; paidAmount: string; breakfastAssociations: { count: number; amount: string }; lodged: { orders: number; amount: string; paidAmount: string }; nonLodged: { orders: number; amount: string; paidAmount: string }; salesByServer: { name: string; orders: number; served: number; sales: string; collected: string }[]; pending: number; confirmed: number; preparing: number; ready: number; served: number; rejected: number; orders: number; note: string; recentOrders: { id: string; number: string; status: string; totalAmount: string; createdAt: string; guestName: string; createdByName: string; paidAt: string | null; paidByName: string | null; paymentMethod: { name: string } | null; room: { number: string } | null }[] };
  cash: { closedSessions: number; variance: string; discrepancies: { id: string; amount: string; closedAt: string | null; operator: string }[] };
  debts: { reference: string; client: string; room: string | null; billed: string; paid: string; balance: string }[];
  staff: { activeAccounts: number; recentAccounts: { id: string; name: string; role: string; active: boolean; lastLoginAt: string | null }[] };
  audit: { id: string; actor: string; action: string; result: string; targetId: string | null; createdAt: string }[];
  alerts: { type: string; label: string }[];
  availability: Record<string, string>;
  trends: { period: string; invoiced: number; reservations: number; lodging: number; restaurant: number }[];
  trendMode: 'day' | 'week' | 'month' | 'year';
  restaurantStock: { id: string; name: string; active: boolean; quantity: string | null; unit: string | null; alertAt: string | null; lastCount: { by: string; at: string } | null }[];
  receptionistPerformance: ReceptionistPerformanceData;
  shiftReports: ShiftReport[];
};

const todayKey = (timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find((item) => item.type === 'year')?.value}-${parts.find((item) => item.type === 'month')?.value}-${parts.find((item) => item.type === 'day')?.value}`;
};
const shift = (key: string, amount: number) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const money = (amount: string | number, _currency: string) => {
  void _currency;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(amount) || 0);
};
const dateTime = (value: string, timezone: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));

export default function OwnerOverview({ name, theme }: { name: string; theme: 'light' | 'dark' }) {
  const [data, setData] = useState<Overview | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState('today');
  const [granularity, setGranularity] = useState<PerformanceGranularity>('day');
  const [appliedPeriod, setAppliedPeriod] = useState<{ from: string; to: string } | null>(null);
  const [selectedShiftReport, setSelectedShiftReport] = useState<ShiftReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      query.set('groupBy', granularity);
      const response = await fetch(`/api/owner/overview?${query}`);
      const result = await response.json().catch(() => null) as (Overview & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? `Le serveur n’a pas pu charger le tableau de bord (HTTP ${response.status}).`);
      if (!result) throw new Error('Le serveur a renvoyé une réponse invalide pour le tableau de bord.');
      setData(result as Overview);
      setAppliedPeriod({ from: (result as Overview).period.from, to: (result as Overview).period.to });
      if (!from && !to) { setFrom((result as Overview).period.from); setTo((result as Overview).period.to); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger le tableau de bord.'); }
    finally { setBusy(false); }
  }, [from, to, granularity]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); const refresh = window.setInterval(() => { void load(); }, 30000); return () => { window.clearTimeout(timer); window.clearInterval(refresh); }; }, [load]);

  function selectPreset(value: string) {
    const today = todayKey(data?.hotel.timezone ?? 'Africa/Brazzaville');
    let start = today;
    if (value === 'yesterday') start = shift(today, -1);
    if (value === 'week') start = shift(today, -6);
    if (value === 'month') start = `${today.slice(0, 7)}-01`;
    if (value === 'quarter') { const month = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1; start = `${today.slice(0, 4)}-${String(month).padStart(2, '0')}-01`; }
    if (value === 'year') start = `${today.slice(0, 4)}-01-01`;
    if (value === '99-years') start = `${Number(today.slice(0, 4)) - 99}${today.slice(4)}`;
    setPreset(value); setFrom(start); setTo(value === 'yesterday' ? shift(today, -1) : today);
      setGranularity(value === 'week' ? 'week' : value === 'month' || value === 'quarter' ? 'month' : value === 'year' || value === '99-years' ? 'year' : 'day');
  }

  const fmt = (value: string) => data ? money(value, data.hotel.currency) : '—';
  const restaurantServerSales = data?.restaurant.salesByServer ?? [];
  const restaurantRecentOrders = data?.restaurant.recentOrders ?? [];
  const trendPoints = data?.trends ?? [];
  const trendMode = data?.trendMode ?? 'month';
  const historyMin = `${Number(todayKey(data?.hotel.timezone ?? 'Africa/Brazzaville').slice(0, 4)) - 99}${todayKey(data?.hotel.timezone ?? 'Africa/Brazzaville').slice(4)}`;
  const historyMax = todayKey(data?.hotel.timezone ?? 'Africa/Brazzaville');
  const change = (current: string, previous: string) => {
    const a = Number(current); const b = Number(previous);
    if (!b) return a ? 'Aucune donnée comparable sur la période précédente' : 'Stable';
    const percent = (a - b) / b * 100;
    return `${percent > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(percent)} % vs période précédente`;
  };

  return <div className={styles.shell} data-theme={theme}>
    <header className={styles.hero}><div><p>BLISS HOTEL · ESPACE PROPRIÉTAIRE</p><h2>Bonjour {name}</h2><span>Une vision fiable de l’activité de votre établissement.</span></div><span className={styles.live}><i />Données réelles</span></header>
    <section className={styles.toolbar}><div className={styles.presets}>{[['today', "Aujourd’hui"], ['yesterday', 'Hier'], ['week', '7 jours'], ['month', 'Ce mois'], ['quarter', 'Ce trimestre'], ['year', 'Cette année']].map(([key, label]) => <button key={key} className={preset === key ? styles.selected : ''} onClick={() => selectPreset(key)}>{label}</button>)}</div><label>Du<input type="date" min={historyMin} max={historyMax} value={from} onChange={(event) => { setFrom(event.target.value); setPreset('custom'); }} /></label><label>Au<input type="date" min={historyMin} max={historyMax} value={to} onChange={(event) => { setTo(event.target.value); setPreset('custom'); }} /></label><button className={styles.refresh} disabled={busy} onClick={() => void load()} aria-label="Actualiser"><RefreshCw size={16} /></button></section>
    <button className={styles.historyButton} onClick={() => selectPreset('99-years')}>Afficher les 99 dernières années</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {busy && !data && <p className={styles.loading}>Chargement des données propriétaires…</p>}
    {data && <>
      <BusinessActivityExplorer currency={data.hotel.currency} timezone={data.hotel.timezone} />
      <section className={styles.kpis} aria-label="Indicateurs financiers">
        <article className={styles.kpi}><span><CircleDollarSign size={16} />Chiffre d’affaires facturé</span><strong>{fmt(data.finance.invoiced)}</strong><small>{data.finance.invoiceCount} facture(s) · {change(data.finance.invoiced, data.finance.previousInvoiced)}</small></article>
        <article className={styles.kpi}><span><Wallet size={16} />Réellement encaissé</span><strong>{fmt(data.finance.collected)}</strong><small>{data.finance.paymentCount} paiement(s) · {change(data.finance.collected, data.finance.previousCollected)}</small></article>
        <article className={styles.kpi}><span><Activity size={16} />Dépenses enregistrées</span><strong>{fmt(data.finance.expenses)}</strong><small>{data.finance.expenseCount} dépense(s) · rapports de clôture uniquement</small></article>
        <article className={styles.kpi}><span><Wallet size={16} />Commissions déduites de caisse</span><strong>{fmt(data.commissions.total)}</strong><small>{data.commissions.count} commission(s) enregistrée(s)</small></article>
        <article className={styles.kpi}><span><AlertTriangle size={16} />Créances ouvertes</span><strong>{fmt(data.finance.outstanding)}</strong><small>{data.finance.debtors} folio(s) avec solde à payer</small></article>
      </section>
      <section className={styles.panel + ' ' + styles.trendPanel}><div className={styles.panelHead}><div><p>TENDANCES · {trendMode === 'day' ? 'PAR JOUR' : trendMode === 'week' ? 'PAR SEMAINE' : trendMode === 'month' ? 'PAR MOIS' : 'PAR ANNÉE'}</p><h3>Hébergement, facturation et bar-restaurant</h3></div><Activity size={18} /></div><RevenueTrendChart data={trendPoints} currency={data.hotel.currency} />{trendPoints.length === 0 && <p className={styles.note}>Aucun mouvement enregistré sur cette période. Le graphique reste prêt à afficher les prochaines opérations.</p>}</section>
      <section className={styles.panel + ' ' + styles.trendPanel}><div className={styles.panelHead}><div><p>BAR · INVENTAIRE</p><h3>Niveaux de stock et seuils d’alerte</h3></div><Utensils size={18} /></div>{data.restaurantStock.length ? <div className={styles.tableWrap}><table><thead><tr><th>Produit</th><th>Stock</th><th>Seuil</th><th>Dernier comptage</th></tr></thead><tbody>{data.restaurantStock.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity === null ? 'Non compté' : `${item.quantity} ${item.unit ?? ''}`}</td><td>{item.alertAt === null ? '—' : `${item.alertAt} ${item.unit ?? ''}`}</td><td>{item.lastCount ? `${item.lastCount.by} · ${dateTime(item.lastCount.at, data.hotel.timezone)}` : '—'}</td></tr>)}</tbody></table></div> : <p className={styles.note}>Aucun produit de bar inventorié.</p>}</section>
      <section className={styles.panel}><div className={styles.panelHead}><div><p>COMMISSIONS DE RÉCEPTION</p><h3>{fmt(data.commissions.total)} · {data.commissions.count} commission(s)</h3></div><Wallet size={18} /></div>{data.commissions.byReceptionist.length ? <div className={styles.tableWrap}><table><thead><tr><th>Réceptionniste</th><th>Total déduit de caisse</th></tr></thead><tbody>{data.commissions.byReceptionist.map((entry) => <tr key={entry.name}><td>{entry.name}</td><td><strong>{fmt(entry.amount)}</strong></td></tr>)}</tbody></table></div> : <p className={styles.note}>Aucune commission enregistrée sur cette période.</p>}<p className={styles.note}>Ces montants diminuent la caisse et ne sont pas ajoutés aux factures des clients.</p></section>
      <section className={styles.grid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>EXPLOITATION</p><h3>État de l’hôtel</h3></div><BedDouble size={18} /></div><div className={styles.roomStats}><div><b>{data.rooms.occupancyRate}%</b><span>Taux d’occupation</span></div><div><b>{data.rooms.occupied} / {data.rooms.total}</b><span>Chambres occupées</span></div><div><b>{data.rooms.available}</b><span>Disponibles</span></div><div><b>{data.rooms.reserved}</b><span>Réservées</span></div><div><b>{data.rooms.dirty}</b><span>À nettoyer / inspecter</span></div><div><b>{data.rooms.outOfService}</b><span>Hors service</span></div><div><b>{data.rooms.maintenance}</b><span>Maintenance technique</span></div></div><div className={styles.operations}><span><CalendarDays size={15} />{data.operations.arrivals} arrivées</span><span>{data.operations.departures} départs</span><span>{data.operations.activeStays} séjours actifs</span><span>{data.operations.pendingReservations} réservations en attente</span></div></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>ANALYSE FINANCIÈRE</p><h3>Résultat opérationnel estimé</h3></div><CircleDollarSign size={18} /></div><strong className={styles.result}>{data.finance.estimatedOperatingResult === null ? 'Données non disponibles' : fmt(data.finance.estimatedOperatingResult)}</strong><p className={styles.note}>Calcul indicatif : factures émises − dépenses de clôture enregistrées. Ce n’est pas un bénéfice net certifié : les charges générales et les écritures comptables ne sont pas configurées.</p><div className={styles.compare}><span>Facturé période précédente <b>{fmt(data.finance.previousInvoiced)}</b></span><span>Encaissé période précédente <b>{fmt(data.finance.previousCollected)}</b></span><span>Période comparée <b>{data.period.previousFrom} – {data.period.previousTo}</b></span></div></article>
      </section>
      <section className={styles.grid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>RESTAURANT</p><h3>Ventes et activité des serveuses</h3></div><Utensils size={18} /></div><div className={styles.restaurantSegments}><div className={styles.restaurantTotal}>{fmt(data.restaurant.lodged.amount)}<small>Clients logés · {data.restaurant.lodged.orders} commande(s) · {fmt(data.restaurant.lodged.paidAmount)} encaissé</small></div><div className={styles.restaurantTotal}>{fmt(data.restaurant.nonLodged.amount)}<small>Clients non logés · {data.restaurant.nonLodged.orders} commande(s) · {fmt(data.restaurant.nonLodged.paidAmount)} encaissé</small></div></div><div className={styles.operations}><span>{data.restaurant.orders} commandes</span><span>{data.restaurant.pending} en attente</span><span>{data.restaurant.preparing + data.restaurant.confirmed + data.restaurant.ready} en cours</span><span>{data.restaurant.served} servies</span><span>{data.restaurant.rejected} rejetées</span><span>Commandes non rejetées : {fmt(data.restaurant.orderAmount)}</span></div>{restaurantServerSales.length > 0 && <div className={styles.tableWrap}><table><thead><tr><th>Serveuse</th><th>Commandes</th><th>Servies</th><th>Ventes servies</th><th>Encaissements directs</th></tr></thead><tbody>{restaurantServerSales.map((server) => <tr key={server.name}><td>{server.name}</td><td>{server.orders}</td><td>{server.served}</td><td>{fmt(server.sales)}</td><td>{fmt(server.collected)}</td></tr>)}</tbody></table></div>}<div className={styles.tableWrap}><table><thead><tr><th>Commande / client</th><th>Serveuse</th><th>État / règlement</th><th>Montant</th></tr></thead><tbody>{restaurantRecentOrders.map((order) => <tr key={order.id}><td>{order.number} · {order.guestName}<small>{order.room ? `Ch. ${order.room.number}` : 'Client non logé'}</small></td><td>{order.createdByName}</td><td>{order.status}{order.paidAt ? <small>Payé par {order.paymentMethod?.name ?? 'moyen désactivé'}</small> : <small>À imputer au folio</small>}</td><td>{fmt(order.totalAmount)}</td></tr>)}</tbody></table></div><p className={styles.note}>{data.restaurant.note}</p></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>CAISSE</p><h3>Rapprochements de la période</h3></div><Wallet size={18} /></div><div className={styles.roomStats}><div><b>{data.cash.closedSessions}</b><span>Clôtures</span></div><div><b>{fmt(data.cash.variance)}</b><span>Écart cumulé signé</span></div></div>{data.cash.discrepancies.length > 0 ? <ul className={styles.list}>{data.cash.discrepancies.slice(0, 4).map((entry) => <li key={entry.id}><b>{fmt(entry.amount)}</b><span>{entry.operator} · {entry.closedAt ? dateTime(entry.closedAt, data.hotel.timezone) : '—'}</span></li>)}</ul> : <p className={styles.note}>Aucun écart de clôture sur cette période.</p>}</article>
      </section>
      <section className={styles.panel}><div className={styles.panelHead}><div><p>RÉCEPTION & BAR-RESTAURANT · {data.shiftReports.length} rapport(s) sur la période</p><h3>Rapports de fin de service</h3></div><FileText size={18} /></div>{data.shiftReports.length ? <div className={styles.tableWrap}><table><thead><tr><th>Service / date</th><th>Responsable</th><th>Clients réservés</th><th>Factures soldées</th><th>Paiements</th><th>Document</th></tr></thead><tbody>{data.shiftReports.map((report) => { const rooms = [...new Set(report.summary.reservations?.clients.flatMap((client) => client.rooms ?? []) ?? [])]; return <tr key={report.id}><td>{report.summary.department === 'BAR_RESTAURANT' ? 'Bar & restaurant · 08 h à 08 h le lendemain' : `Réception · ${report.shiftType === 'DAY' ? 'Jour' : 'Nuit'}`}<small>Heures réelles : {dateTime(report.startedAt, data.hotel.timezone)} – {dateTime(report.endedAt, data.hotel.timezone)}</small></td><td>{report.user.name}</td><td>{report.summary.reservations?.clientsCount ?? '—'}{report.summary.reservations && <small>{report.summary.reservations.paidClients} payés · {report.summary.reservations.unpaidClients} non payés</small>}{rooms.length > 0 && <small>Chambres : {rooms.join(', ')}</small>}</td><td>{report.summary.invoicesSettled?.count ?? '—'}</td><td>{report.summary.payments.count}</td><td><button className={styles.refresh} type="button" onClick={() => setSelectedShiftReport(report)}>Voir / PDF</button></td></tr>; })}</tbody></table></div> : <p className={styles.note}>Aucun rapport de service sur cette période.</p>}</section>
      <ReceptionistPerformance data={data.receptionistPerformance} currency={data.hotel.currency} timezone={data.hotel.timezone} theme={theme} granularity={granularity} onGranularityChange={setGranularity} />
      <section className={styles.grid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>CRÉANCES</p><h3>Soldes à suivre</h3></div><AlertTriangle size={18} /></div>{data.debts.length ? <div className={styles.tableWrap}><table><thead><tr><th>Client / séjour</th><th>Chambre</th><th>Facturé</th><th>Payé</th><th>Solde</th></tr></thead><tbody>{data.debts.map((debt) => <tr key={debt.reference}><td>{debt.client}<small>{debt.reference}</small></td><td>{debt.room ?? '—'}</td><td>{fmt(debt.billed)}</td><td>{fmt(debt.paid)}</td><td><b>{fmt(debt.balance)}</b></td></tr>)}</tbody></table></div> : <p className={styles.note}>Aucune créance ouverte à signaler.</p>}</article>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>ALERTES</p><h3>Points de vigilance</h3></div><AlertTriangle size={18} /></div>{data.alerts.length ? <ul className={styles.alerts}>{data.alerts.map((item) => <li key={item.type}>{item.label}</li>)}</ul> : <p className={styles.note}>Aucune alerte issue des données disponibles.</p>}<p className={styles.note}>Les réservations annulées de la période : {data.operations.cancelledReservations}.</p></article>
      </section>
      <section className={styles.grid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>PERSONNEL</p><h3>Comptes et connexions</h3></div><Activity size={18} /></div><p className={styles.note}>{data.staff.activeAccounts} comptes actifs · suivi de présence non configuré.</p><ul className={styles.list}>{data.staff.recentAccounts.map((user) => <li key={user.id}><b>{user.name}</b><span>{user.role} · {user.active ? 'Actif' : 'Suspendu'} · {user.lastLoginAt ? dateTime(user.lastLoginAt, data.hotel.timezone) : 'Jamais connecté'}</span></li>)}</ul></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>JOURNAL D’AUDIT</p><h3>Opérations récentes</h3></div><Activity size={18} /></div>{data.audit.length ? <ul className={styles.list}>{data.audit.map((event) => <li key={event.id}><b>{event.action.replaceAll('_', ' ')}</b><span>{event.actor} · {dateTime(event.createdAt, data.hotel.timezone)} · {event.result}{event.targetId ? ` · ${event.targetId}` : ''}</span></li>)}</ul> : <p className={styles.note}>Aucune opération journalisée sur cette période.</p>}</article>
      </section>
      <section className={styles.unavailable}><b>Données / fonctionnalités non disponibles dans le système actuel</b><span>Grand livre général et bancaire · dépenses hors rapports de clôture · historique tarifaire · présence du personnel · rentabilité complète par chambre · rapprochements bancaires · export Excel · assistant IA.</span></section>
      <footer className={styles.footer}>Période affichée : {appliedPeriod?.from ?? data.period.from} – {appliedPeriod?.to ?? data.period.to}. Les factures ne sont pas des encaissements. Les montants du restaurant sont présentés à part pour éviter de les compter deux fois avec les folios. Aucun solde de trésorerie n’est déduit du chiffre d’affaires.</footer>
    </>}
    {busy && data && <p className={styles.loading}>Actualisation des données…</p>}
    {selectedShiftReport && data && <ShiftReportPrintDialog report={selectedShiftReport} hotel={{ name: data.hotel.name, currency: data.hotel.currency, timezone: data.hotel.timezone }} close={() => setSelectedShiftReport(null)} />}
  </div>;
}
