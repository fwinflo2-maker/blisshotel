'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { Activity, AlertTriangle, BedDouble, Building2, CalendarDays, ClipboardList, FileText, LogOut, RefreshCw, Utensils, Users, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CockpitBars, CockpitDonut } from '@/components/cockpit-charts';
import { RevenueTrendChart, type TrendPoint } from '@/components/dashboard-charts';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import OperationsCenter from '@/features/workspace/operations-center';
import OwnerClientRecords from '../proprietaire/owner-client-records';
import ShiftReportsWorkspace from '@/features/shift-reports/shift-reports-workspace';
import ReceptionistPerformance from '@/features/reception-performance/receptionist-performance';
import BusinessActivityExplorer from '@/components/business-activity-explorer';
import type { PerformanceGranularity, ReceptionistPerformance as ReceptionistPerformanceData } from '@/features/reception-performance/domain';
import './direction.css';

type DirectionData = {
  period: { from: string; to: string };
  timezone: string;
  trends: TrendPoint[];
  rooms: { total: number; available: number; occupied: number; dirty: number; outOfService: number };
  operations: { arrivals: number; departures: number; activeStays: number; pendingReservations: number; confirmedReservations: number; openCashSessions: number; openHousekeepingTasks: number; receptionShiftReports: number };
  commissions: { total: string; count: number; byReceptionist: { name: string; amount: string }[] };
  frontDeskActivity: { action: string; at: string; receptionist: string; reservationId: string | null }[];
  finance: { invoicesCount: number; invoicedAmount: string; paymentsCount: number; collectedAmount: string; openFolios: number; outstandingBalance: string; cashVariance: string; closedCashSessions: number };
  restaurant: { totalAmount: string; paidAmount: string; breakfastAssociations: { count: number; amount: string }; lodged: { orders: number; amount: string; paidAmount: string }; nonLodged: { orders: number; amount: string; paidAmount: string }; stock: { id: string; name: string; category: string; quantity: string | null; unit: string | null; alertAt: string | null }[]; salesByServer: { name: string; orders: number; served: number; sales: string; collected: string }[]; recentOrders: { id: string; number: string; guestName: string; reservationId: string | null; status: string; totalAmount: string; createdAt: string; createdByName: string; paidAt: string | null; paymentMethod: { name: string } | null; room: string | null; lines: { name: string; quantity: number }[] }[] };
  receptionistPerformance: ReceptionistPerformanceData;
  alerts: string[];
  currency: string;
};
type View = 'overview' | 'operations' | 'clients' | 'shift-reports';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function DirectionWorkspace({ name }: { name: string }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const today = dateKey(new Date());
  const historyMin = `${Number(today.slice(0, 4)) - 99}${today.slice(4)}`;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<PerformanceGranularity>('day');
  const [data, setData] = useState<DirectionData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('overview');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/direction/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&groupBy=${granularity}`);
      const result = await response.json().catch(() => null) as (DirectionData & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? `Le serveur n’a pas pu charger le tableau de bord (HTTP ${response.status}).`);
      if (!result) throw new Error('Le serveur a renvoyé une réponse invalide pour le tableau de bord.');
      setData(result as DirectionData);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); }
    finally { setBusy(false); }
  }, [from, to, granularity]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); const refresh = window.setInterval(() => { void load(); }, 30000); return () => { window.clearTimeout(timer); window.clearInterval(refresh); }; }, [load]);
  const money = (amount: string | number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(amount));
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/connexion'); router.refresh(); }
  const rooms = data?.rooms;
  const knownRoomStates = rooms ? rooms.available + rooms.occupied + rooms.dirty + rooms.outOfService : 0;
  const roomSegments = data ? [
    { label: 'Occupées', value: data.rooms.occupied, color: '#51b89b' },
    { label: 'Disponibles', value: data.rooms.available, color: '#8dc9a3' },
    { label: 'À préparer', value: data.rooms.dirty, color: '#e5b466' },
    { label: 'Hors service', value: data.rooms.outOfService, color: '#e27769' },
    { label: 'Autres états', value: Math.max(0, data.rooms.total - knownRoomStates), color: '#73879a' },
  ] : [];
  const metrics = data ? [
    { icon: CalendarDays, label: 'Arrivées prévues', value: data.operations.arrivals, tone: 'mint' },
    { icon: Activity, label: 'Séjours en cours', value: data.operations.activeStays, tone: 'blue' },
    { icon: ClipboardList, label: 'Réservations à traiter', value: data.operations.pendingReservations, tone: 'gold' },
    { icon: Wallet, label: 'Caisses ouvertes', value: data.operations.openCashSessions, tone: 'violet' },
    { icon: Utensils, label: 'Encaissements directs bar-restaurant', value: money(data.restaurant.paidAmount), tone: 'gold' },
    { icon: Wallet, label: 'Commissions déduites de caisse', value: money(data.commissions.total), tone: 'violet' },
  ] : [];

  return <main className="direction-shell" data-theme={theme}>
    <header className="direction-header"><div className="direction-brand"><span><Building2 size={19} /></span><div><strong>BLISS HÔTEL</strong><small>Cockpit de direction</small></div></div><div className="direction-user"><span>{name} · Directeur général</span><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /><ProfileLauncher name={name} className="direction-profile-launcher" /><button onClick={() => void logout()}><LogOut size={16} />Déconnexion</button></div></header>
    <nav className="direction-tabs" aria-label="Espaces de pilotage"><button className={view === 'overview' ? 'is-active' : ''} onClick={() => setView('overview')}><Activity size={16} />Cockpit de direction</button><button className={view === 'operations' ? 'is-active' : ''} onClick={() => setView('operations')}><ClipboardList size={16} />Pilotage opérationnel</button><button className={view === 'clients' ? 'is-active' : ''} onClick={() => setView('clients')}><Users size={16} />Clients et séjours</button><button className={view === 'shift-reports' ? 'is-active' : ''} onClick={() => setView('shift-reports')}><FileText size={16} />Rapports de service</button></nav>

    {view === 'overview' ? <section className="direction-content direction-executive">
      <div className="direction-hero"><div><p>VISION D’ENSEMBLE · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())}</p><h1>Bonjour {name.split(' ')[0]}<span>.</span></h1><span>Les indicateurs essentiels de votre établissement, réunis au même endroit.</span></div><div className="direction-hero-orbit"><span /><Building2 size={27} /></div></div>
      <form className="direction-period" onSubmit={(event) => { event.preventDefault(); void load(); }}><CalendarDays size={17} /><label>Du<input type="date" min={historyMin} max={today} value={from} onChange={(event) => setFrom(event.target.value)} required /></label><label>Au<input type="date" min={historyMin} max={today} value={to} onChange={(event) => setTo(event.target.value)} required /></label><button type="submit">Appliquer la période</button><button className="direction-refresh" type="button" disabled={busy} onClick={() => void load()} aria-label="Actualiser"><RefreshCw size={15} className={busy ? 'direction-spin' : ''} /></button></form>
      {error && <div className="direction-error" role="alert">{error}</div>}
      {busy && <p className="direction-loading" role="status">Actualisation des indicateurs…</p>}
      {data && <>
        <BusinessActivityExplorer currency={data.currency} timezone={data.timezone} />
        <div className="direction-kpis">{metrics.map(({ icon: Icon, label, value, tone }, index) => <article className={`direction-kpi ${tone}`} key={label} style={{ animationDelay: `${index * 70}ms` }}><span className="direction-kpi-icon"><Icon size={17} /></span><span className="direction-kpi-label">{label}</span><strong>{value}</strong><small>Sur la période sélectionnée</small></article>)}</div>
        <section className="direction-panel"><div className="direction-panel-title"><div><p>COMMISSIONS DE RÉCEPTION</p><h2>{money(data.commissions.total)} · {data.commissions.count} retrait(s)</h2></div><Wallet size={18} /></div>{data.commissions.byReceptionist.length ? <div className="direction-finance">{data.commissions.byReceptionist.map((entry) => <div key={entry.name}><span>{entry.name}</span><strong>{money(entry.amount)}</strong><small>Retiré de caisse sur la période</small></div>)}</div> : <p className="direction-muted">Aucun retrait de commission sur la période sélectionnée.</p>}<p className="direction-muted">La commission est comptabilisée une seule fois par réservation, sans être ajoutée à la facture du client.</p></section>
        <section className="direction-panel"><div className="direction-panel-title"><div><p>CHECK-IN / CHECK-OUT · ACTUALISATION AUTO 30 S</p><h2>Activité récente de la réception</h2></div><Activity size={18} /></div>{data.frontDeskActivity.length ? data.frontDeskActivity.map((item) => <div className="direction-service-counts" key={`${item.action}-${item.at}`}><span>{item.action === 'RECEPTION_STAY_CHECK_IN' ? 'Check-in' : 'Check-out'} · {item.receptionist} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.at))}</span><strong>{item.reservationId ?? ''}</strong></div>) : <p className="direction-muted">Aucun check-in/check-out sur la période.</p>}</section>
        <section className="direction-panel"><div className="direction-panel-title"><div><p>TENDANCES · PÉRIODE SÉLECTIONNÉE</p><h2>Hébergement, facturation et bar-restaurant</h2></div><Activity size={18} /></div><RevenueTrendChart data={data.trends} currency={data.currency} />{data.trends.length === 0 && <p className="direction-chart-note">Aucune écriture sur la période ; les courbes apparaîtront au fil des opérations enregistrées.</p>}</section>
        <div className="direction-charts">
          <section className="direction-panel direction-chart-panel"><div className="direction-panel-title"><div><p>INVENTAIRE EN TEMPS RÉEL</p><h2>État des chambres</h2></div><BedDouble size={18} /></div><CockpitDonut total={data.rooms.total} centerValue={`${data.rooms.occupied}/${data.rooms.total}`} centerLabel="occupées" segments={roomSegments} /><p className="direction-chart-note">Répartition des chambres enregistrées dans l’établissement.</p></section>
          <section className="direction-panel direction-chart-panel"><div className="direction-panel-title"><div><p>ACTIVITÉ · {from === to ? from : `${from} — ${to}`}</p><h2>Rythme des opérations</h2></div><Activity size={18} /></div><CockpitBars rows={[
            { label: 'Arrivées', value: data.operations.arrivals, color: '#63a9e5' },
            { label: 'Départs', value: data.operations.departures, color: '#c6a878' },
            { label: 'Séjours actifs', value: data.operations.activeStays, color: '#51b89b' },
            { label: 'Tâches ouvertes', value: data.operations.openHousekeepingTasks, color: '#e27769' },
          ]} /><p className="direction-chart-note">Volume actuel pour les séjours et tâches ; arrivées et départs selon la période.</p></section>
        </div>
        <section className="direction-panel"><div className="direction-panel-title"><div><p>BAR-RESTAURANT · {from === to ? from : `${from} — ${to}`}</p><h2>Chiffre d’affaires par type de clientèle</h2></div><Wallet size={18} /></div><div className="direction-finance direction-restaurant-stats"><div><span>Clients logés · {data.restaurant.lodged.orders} commande(s)</span><strong>{money(data.restaurant.lodged.amount)}</strong><small>{money(data.restaurant.lodged.paidAmount)} encaissé · reste porté aux folios après validation</small></div><div><span>Clients non logés · {data.restaurant.nonLodged.orders} commande(s)</span><strong>{money(data.restaurant.nonLodged.amount)}</strong><small>{money(data.restaurant.nonLodged.paidAmount)} encaissé directement</small></div><div><span>Total bar-restaurant</span><strong>{money(data.restaurant.totalAmount)}</strong><small>Commandes non rejetées sur la période</small></div><div><span>Encaissements immédiats</span><strong>{money(data.restaurant.paidAmount)}</strong><small>Ajoutés aux encaissements comptables</small></div></div><p className="direction-muted">Les ventes du bar-restaurant sont suivies séparément des encaissements d’hébergement pour éviter tout double comptage.</p>{data.restaurant.salesByServer.length > 0 && <><div className="direction-panel-title"><div><p>ACTIVITÉ DES SERVEUSES</p><h2>Ventes par opératrice</h2></div><Utensils size={18} /></div><div className="direction-finance direction-restaurant-stats">{data.restaurant.salesByServer.map((server) => <div key={server.name}><span>{server.name} · {server.orders} commande(s) · {server.served} servie(s)</span><strong>{money(server.sales)}</strong><small>{money(server.collected)} encaissé immédiatement</small></div>)}</div></>}{data.restaurant.recentOrders.length > 0 && <div className="direction-restaurant-orders">{data.restaurant.recentOrders.map((order) => <article key={order.id}><div><strong>{order.number} · {order.guestName}</strong><small>{order.createdByName} · {order.room ? `Chambre ${order.room}` : 'Client non logé'} · {order.status}{order.paidAt ? ` · Payé ${order.paymentMethod?.name ?? ''}` : ''}</small><small>{order.lines.map((line) => `${line.name} × ${line.quantity}`).join(', ')}</small></div><strong>{money(order.totalAmount)}</strong></article>)}</div>}</section>
        <section className="direction-panel"><div className="direction-panel-title"><div><p>INVENTAIRE BAR-RESTAURANT</p><h2>Produits et niveaux de stock</h2></div><Utensils size={18} /></div><div className="direction-restaurant-orders">{data.restaurant.stock.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.category} · Seuil : {item.alertAt ?? '—'} {item.unit ?? ''}</small></div><strong>{item.quantity === null ? 'Non compté' : `${item.quantity} ${item.unit ?? ''}`}</strong></article>)}</div></section>
        <div className="direction-bottom-grid">
          <section className="direction-panel"><div className="direction-panel-title"><div><p>PERFORMANCE FINANCIÈRE</p><h2>Factures & encaissements</h2></div><Wallet size={18} /></div><div className="direction-finance"><div><span>Factures émises</span><strong>{money(data.finance.invoicedAmount)}</strong><small>{data.finance.invoicesCount} facture(s)</small></div><div><span>Montants encaissés</span><strong>{money(data.finance.collectedAmount)}</strong><small>{data.finance.paymentsCount} paiement(s)</small></div><div><span>Soldes clients ouverts</span><strong>{money(data.finance.outstandingBalance)}</strong><small>{data.finance.openFolios} folio(s)</small></div><div><span>Écart des caisses clôturées</span><strong>{money(data.finance.cashVariance)}</strong><small>{data.finance.closedCashSessions} clôture(s)</small></div></div><p className="direction-muted">Les dépenses ne sont pas encore suivies. Le bénéfice net n’est donc pas calculé.</p></section>
          <ReceptionistPerformance data={data.receptionistPerformance} currency={data.currency} timezone={data.timezone} theme={theme} granularity={granularity} onGranularityChange={setGranularity} />
          <section className="direction-panel direction-alerts"><div className="direction-panel-title"><div><p>VIGILANCE</p><h2>Points à suivre</h2></div><AlertTriangle size={18} /></div>{data.alerts.length ? <ul>{data.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul> : <p className="direction-muted">Aucune alerte issue des données disponibles.</p>}<div className="direction-service-counts"><span>Rapports de relève <strong>{data.operations.receptionShiftReports}</strong></span><span>Réservations confirmées <strong>{data.operations.confirmedReservations}</strong></span></div></section>
        </div>
      </>}
    </section> : view === 'operations' ? <OperationsCenter name={name} roleCode="GENERAL_MANAGER" embedded /> : view === 'clients' ? <section className="direction-content"><OwnerClientRecords /></section> : <section className="direction-content"><ShiftReportsWorkspace /></section>}
  </main>;
}
