'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { Activity, AlertTriangle, BedDouble, Building2, CalendarDays, ClipboardList, Fingerprint, LogOut, RefreshCw, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CockpitBars, CockpitDonut } from '@/components/cockpit-charts';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import GodModeProfileViewer from '@/features/god-mode/profile-viewer';
import OperationsCenter from '@/features/workspace/operations-center';
import './direction.css';

type DirectionData = {
  period: { from: string; to: string };
  rooms: { total: number; available: number; occupied: number; dirty: number; outOfService: number };
  operations: { arrivals: number; departures: number; activeStays: number; pendingReservations: number; confirmedReservations: number; openCashSessions: number; openHousekeepingTasks: number; receptionShiftReports: number };
  finance: { invoicesCount: number; invoicedAmount: string; paymentsCount: number; collectedAmount: string; openFolios: number; outstandingBalance: string; cashVariance: string; closedCashSessions: number };
  alerts: string[];
  currency: string;
};
type View = 'overview' | 'operations' | 'god-mode';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function DirectionWorkspace({ name }: { name: string }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const today = dateKey(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<DirectionData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('overview');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/direction/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Chargement impossible.');
      setData(result as DirectionData);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); }
    finally { setBusy(false); }
  }, [from, to]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const money = (amount: string | number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: data?.currency ?? 'XAF', maximumFractionDigits: 0 }).format(Number(amount));
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
  ] : [];

  return <main className="direction-shell" data-theme={theme}>
    <ProfileLauncher name={name} />
    <header className="direction-header"><div className="direction-brand"><span><Building2 size={19} /></span><div><strong>BLISS HÔTEL</strong><small>Cockpit de direction</small></div></div><div className="direction-user"><span>{name} · Directeur général</span><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /><button onClick={() => void logout()}><LogOut size={16} />Déconnexion</button></div></header>
    <nav className="direction-tabs" aria-label="Espaces de pilotage"><button className={view === 'overview' ? 'is-active' : ''} onClick={() => setView('overview')}><Activity size={16} />Cockpit de direction</button><button className={view === 'operations' ? 'is-active' : ''} onClick={() => setView('operations')}><ClipboardList size={16} />Pilotage opérationnel</button><button className={view === 'god-mode' ? 'is-active' : ''} onClick={() => setView('god-mode')}><Fingerprint size={16} />God Mode · Profils</button></nav>

    {view === 'overview' ? <section className="direction-content direction-executive">
      <div className="direction-hero"><div><p>VISION D’ENSEMBLE · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())}</p><h1>Bonjour {name.split(' ')[0]}<span>.</span></h1><span>Les indicateurs essentiels de votre établissement, réunis au même endroit.</span></div><div className="direction-hero-orbit"><span /><Building2 size={27} /></div></div>
      <form className="direction-period" onSubmit={(event) => { event.preventDefault(); void load(); }}><CalendarDays size={17} /><label>Du<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label><label>Au<input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></label><button type="submit">Appliquer la période</button><button className="direction-refresh" type="button" disabled={busy} onClick={() => void load()} aria-label="Actualiser"><RefreshCw size={15} className={busy ? 'direction-spin' : ''} /></button></form>
      {error && <div className="direction-error" role="alert">{error}</div>}
      {busy && <p className="direction-loading" role="status">Actualisation des indicateurs…</p>}
      {data && <>
        <div className="direction-kpis">{metrics.map(({ icon: Icon, label, value, tone }, index) => <article className={`direction-kpi ${tone}`} key={label} style={{ animationDelay: `${index * 70}ms` }}><span className="direction-kpi-icon"><Icon size={17} /></span><span className="direction-kpi-label">{label}</span><strong>{value}</strong><small>Sur la période sélectionnée</small></article>)}</div>
        <div className="direction-charts">
          <section className="direction-panel direction-chart-panel"><div className="direction-panel-title"><div><p>INVENTAIRE EN TEMPS RÉEL</p><h2>État des chambres</h2></div><BedDouble size={18} /></div><CockpitDonut total={data.rooms.total} centerValue={`${data.rooms.occupied}/${data.rooms.total}`} centerLabel="occupées" segments={roomSegments} /><p className="direction-chart-note">Répartition des chambres enregistrées dans l’établissement.</p></section>
          <section className="direction-panel direction-chart-panel"><div className="direction-panel-title"><div><p>ACTIVITÉ · {from === to ? from : `${from} — ${to}`}</p><h2>Rythme des opérations</h2></div><Activity size={18} /></div><CockpitBars rows={[
            { label: 'Arrivées', value: data.operations.arrivals, color: '#63a9e5' },
            { label: 'Départs', value: data.operations.departures, color: '#c6a878' },
            { label: 'Séjours actifs', value: data.operations.activeStays, color: '#51b89b' },
            { label: 'Tâches ouvertes', value: data.operations.openHousekeepingTasks, color: '#e27769' },
          ]} /><p className="direction-chart-note">Volume actuel pour les séjours et tâches ; arrivées et départs selon la période.</p></section>
        </div>
        <div className="direction-bottom-grid">
          <section className="direction-panel"><div className="direction-panel-title"><div><p>PERFORMANCE FINANCIÈRE</p><h2>Factures & encaissements</h2></div><Wallet size={18} /></div><div className="direction-finance"><div><span>Factures émises</span><strong>{money(data.finance.invoicedAmount)}</strong><small>{data.finance.invoicesCount} facture(s)</small></div><div><span>Montants encaissés</span><strong>{money(data.finance.collectedAmount)}</strong><small>{data.finance.paymentsCount} paiement(s)</small></div><div><span>Soldes clients ouverts</span><strong>{money(data.finance.outstandingBalance)}</strong><small>{data.finance.openFolios} folio(s)</small></div><div><span>Écart des caisses clôturées</span><strong>{money(data.finance.cashVariance)}</strong><small>{data.finance.closedCashSessions} clôture(s)</small></div></div><p className="direction-muted">Les dépenses ne sont pas encore suivies. Le bénéfice net n’est donc pas calculé.</p></section>
          <section className="direction-panel direction-alerts"><div className="direction-panel-title"><div><p>VIGILANCE</p><h2>Points à suivre</h2></div><AlertTriangle size={18} /></div>{data.alerts.length ? <ul>{data.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul> : <p className="direction-muted">Aucune alerte issue des données disponibles.</p>}<div className="direction-service-counts"><span>Rapports de relève <strong>{data.operations.receptionShiftReports}</strong></span><span>Réservations confirmées <strong>{data.operations.confirmedReservations}</strong></span></div></section>
        </div>
      </>}
    </section> : view === 'operations' ? <OperationsCenter name={name} roleCode="GENERAL_MANAGER" embedded /> : <section className="direction-content"><GodModeProfileViewer /></section>}
  </main>;
}
