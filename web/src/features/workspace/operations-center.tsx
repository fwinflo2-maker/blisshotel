'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileLauncher } from '@/components/profile-settings';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BedDouble, Bell, CalendarDays, Check, ChevronRight, ClipboardCheck, Download, LogOut, RefreshCw, Search, ShieldAlert, Wallet, Wrench } from 'lucide-react';
import { CockpitBars, CockpitDonut } from '@/components/cockpit-charts';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import './operations-center.css';

type OperationsData = {
  user: { name: string; roleCode: string };
  permissions: string[];
  currency: string;
  period: { from: string; to: string };
  kpis: { rooms: number; occupied: number; ready: number; reserved: number; arrivals: number; departures: number; tasks: number; overdueTasks: number; incidents: number; activeStays: number; occupancyRate: number };
  finance: { invoiced: string; invoices: number; collected: string; payments: number; outstanding: string; expenses: string | null; expenseCount: number | null; previousInvoiced: string; previousCollected: string } | null;
  trend: { date: string; amount: string }[];
  events: { id: string; date: string; kind: string; title: string; room: string; status: string }[];
  alerts: { id: string; priority: string; type: string; title: string; detail: string; href: string }[];
  tasks: { id: string; title: string; status: string; priority: string; dueAt: string | null; room: string; assignee: string | null }[];
  incidents: { id: string; title: string; status: string; room: string; createdAt: string }[];
  notifications: { id: string; message: string; readAt: string | null; createdAt: string; priority: string; href: string }[];
  activity: { id: string; action: string; targetId: string | null; createdAt: string; actor: string | null }[];
  roomPerformance: { room: string; floor: string | null; stays: number; siestas: number; overnight: number; revenue: string }[];
  modules: { commissions: string; restaurant: string; approvals: string; staffAttendance: string; inventory: string };
};
type SearchData = { rooms: { id: string; number: string; floor: string | null; status: string; housekeepingStatus: string; currentGuest: string | null }[]; reservations: { id: string; reference: string; status: string; checkInDate: string; client: string | null; room: string | null }[]; clients: { id: string; name: string; email: string | null; phone: string | null }[] };
type View = 'summary' | 'agenda' | 'tasks' | 'alerts' | 'rooms' | 'activity';

const roleLabels: Record<string, string> = { SUPER_ADMIN: 'Super Administrateur', OWNER: 'Propriétaire', GENERAL_MANAGER: 'Directeur général', HOTEL_ADMIN: 'Administrateur Hôtel', RECEPTIONIST: 'Réceptionniste', ACCOUNTANT: 'Comptable', GOUVERNANTE: 'Gouvernante', HOUSEKEEPER: 'Agent d’entretien', MAINTENANCE_MANAGER: 'Responsable maintenance', RESTAURANT_MANAGER: 'Responsable Restaurant et Bar', BAR_SERVER: 'Servant(e) du bar' };
const kindLabels: Record<string, string> = { arrival: 'Arrivée', departure: 'Départ', housekeeping: 'Entretien', maintenance: 'Maintenance' };
const statusLabels: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', CHECKED_IN: 'En séjour', IN_PROGRESS: 'En cours', READY_FOR_INSPECTION: 'é inspecter', OPEN: 'Ouvert', OCCUPIED: 'Occupée', AVAILABLE: 'Disponible', HIGH: 'Prioritaire', URGENT: 'Urgente' };
const money = (value: string | number, _currency: string) => {
  void _currency;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' }).format(Number(value) || 0);
};
const changeLabel = (current: string, previous: string, currency: string) => {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0) return currentValue === 0 ? 'Stable · période précédente · 0' : `Nouveau · ${money(previousValue, currency)} sur la période précédente`;
  const change = ((currentValue - previousValue) / previousValue) * 100;
  return `${change > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(change)} % vs période précédente`;
};
const dateText = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const localDay = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Brazzaville', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
};
const dayShift = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Chargement impossible.');
  return body as T;
}

export default function OperationsCenter({ name, roleCode, embedded = false, hideRefresh = false }: { name?: string; roleCode?: string; embedded?: boolean; hideRefresh?: boolean }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const [data, setData] = useState<OperationsData | null>(null);
  const [view, setView] = useState<View>('summary');
  const [from, setFrom] = useState(localDay);
  const [to, setTo] = useState(localDay);
  const [query, setQuery] = useState('');
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [periodPreset, setPeriodPreset] = useState<'today' | 'week' | 'month' | 'custom'>('today');

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const result = await request<OperationsData>(`/api/workspace/operations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setData(result); setUpdatedAt(new Date().toISOString());
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger le centre de pilotage.'); }
    finally { setBusy(false); }
  }, [from, to]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { const timer = window.setTimeout(() => setSearchData(null), 0); return () => window.clearTimeout(timer); }
    const timer = window.setTimeout(() => {
      void request<SearchData>(`/api/workspace/search?q=${encodeURIComponent(trimmed)}`).then(setSearchData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Recherche impossible.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const permissions = useMemo(() => new Set(data?.permissions ?? []), [data?.permissions]);
  const effectiveRoleCode = data?.user.roleCode ?? roleCode;
  const can = useCallback((permission: string) => permissions.has(permission) || effectiveRoleCode === 'SUPER_ADMIN', [permissions, effectiveRoleCode]);
  const title = roleLabels[data?.user.roleCode ?? roleCode ?? ''] ?? 'Espace de travail';
  const activeName = name ?? data?.user.name ?? 'équipe BLISS HOTEL';
  const visiblePerformance = useMemo(() => data?.roomPerformance.filter((room) => `${room.room} ${room.floor ?? ''}`.toLowerCase().includes(tableSearch.toLowerCase())) ?? [], [data?.roomPerformance, tableSearch]);
  const chartMax = Math.max(1, ...(data?.trend.map((point) => Number(point.amount)) ?? [1]));
  const chartPoints = data?.trend.map((point, index) => `${data!.trend.length <= 1 ? 50 : (index / (data!.trend.length - 1)) * 100},${88 - (Number(point.amount) / chartMax) * 78}`).join(' ') ?? '';

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('La déconnexion n’a pas abouti. Réessayez.');
      router.push('/connexion');
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'La déconnexion a échoué.'); }
  }

  async function markRead(id: string) {
    try { await request('/api/reception/notifications', { method: 'POST', body: JSON.stringify({ id }) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Action impossible.'); }
  }

  function exportReport() {
    if (!data) return;
    const rows = [['Rapport BLISS HOTEL', data.period.from, data.period.to], ['Chambres', String(data.kpis.rooms)], ['Occupées', String(data.kpis.occupied)], ['Prétes', String(data.kpis.ready)], ['Arrivées', String(data.kpis.arrivals)], ['Départs', String(data.kpis.departures)], ['Tâches ouvertes', String(data.kpis.tasks)], ['Incidents ouverts', String(data.kpis.incidents)], ...(data.finance ? [['Facturé', data.finance.invoiced, data.currency], ['Encaissé', data.finance.collected, data.currency], ['Solde client', data.finance.outstanding, data.currency]] : [])];
    const content = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `pilotage-bliss-${data.period.from}-${data.period.to}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const views: [View, string, number][] = [
    ['summary', 'Vue d’ensemble', 0],
    ...((can('reservations.view') || can('stays.view') || can('housekeeping.tasks.view') || can('housekeeping.tasks.assign') || can('maintenance.view') || can('maintenance.incidents.report')) ? [['agenda', 'Agenda', data?.events.length ?? 0] as [View, string, number]] : []),
    ...(can('housekeeping.tasks.view') || can('housekeeping.tasks.assign') || can('housekeeping.tasks.execute') ? [['tasks', 'Tâches', data?.tasks.length ?? 0] as [View, string, number]] : []),
    ...((data?.alerts.length ?? 0) > 0 || can('rooms.view') ? [['alerts', 'Alertes', data?.alerts.length ?? 0] as [View, string, number]] : []),
    ...(can('rooms.view') ? [['rooms', 'Chambres', data?.kpis.rooms ?? 0] as [View, string, number]] : []),
    ...((can('audit.view') || can('accounting.view') || can('shift_reports.view')) ? [['activity', 'Activité', data?.activity.length ?? 0] as [View, string, number]] : []),
  ];

  const Root = embedded ? 'div' : 'main';
  return <Root className={`ops-shell${embedded ? ' ops-embedded' : ''}`} data-theme={theme} data-role={effectiveRoleCode}>
    <header className="ops-header">
      <div><p>BLISS HOTEL · CENTRE DE PILOTAGE</p><h1>Bonjour {activeName}</h1><span>{title} · données opérationnelles de la période</span></div>
      <div className="ops-header-actions"><span className="ops-live"><i />Données en direct</span>{!hideRefresh && <button className="ops-button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'ops-spin' : ''} />Actualiser</button>}{!embedded && <DashboardThemeToggle theme={theme} onToggle={toggleTheme} />}{!embedded && name && <ProfileLauncher name={name} className="ops-profile-launcher" />}{!embedded && <button className="ops-button" onClick={() => void logout()}><LogOut size={15} />Déconnexion</button>}{can('reports.export') || can('reports.financial.view') || can('shift_reports.view') ? <button className="ops-button ops-primary" onClick={exportReport}><Download size={15} />Exporter</button> : null}</div>
    </header>
    <section className="ops-toolbar">
      <div className="ops-search"><Search size={17} /><input placeholder="Rechercher un client, une chambre ou une réservation" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Recherche globale" />{query && <button onClick={() => setQuery('')} aria-label="Effacer la recherche">é</button>}</div>
      <div className="ops-period-presets" aria-label="Période du tableau de bord">
        <button className={periodPreset === 'today' ? 'is-active' : ''} onClick={() => { const today = localDay(); setFrom(today); setTo(today); setPeriodPreset('today'); }}>Aujourd’hui</button>
        <button className={periodPreset === 'week' ? 'is-active' : ''} onClick={() => { const today = localDay(); setFrom(dayShift(today, -6)); setTo(today); setPeriodPreset('week'); }}>7 jours</button>
        <button className={periodPreset === 'month' ? 'is-active' : ''} onClick={() => { const today = localDay(); setFrom(dayShift(today, -29)); setTo(today); setPeriodPreset('month'); }}>30 jours</button>
      </div>
      <label>Du<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPeriodPreset('custom'); }} /></label><label>Au<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPeriodPreset('custom'); }} /></label>
    </section>
    {searchData && <section className="ops-search-results"><div className="ops-panel-head"><div><p>RECHERCHE AUTORISéE</p><h2>Résultats</h2></div><button onClick={() => { setQuery(''); setSearchData(null); }}>Fermer</button></div><div className="ops-search-columns">{searchData.rooms.length > 0 && <div><h3>Chambres</h3>{searchData.rooms.map((room) => <a key={room.id} href={room.status === 'OCCUPIED' && roleCode === 'HOTEL_ADMIN' ? '/admin-hotel' : '/reception'}><b>Ch. {room.number}</b><small>{room.floor ? `étage ${room.floor} · ` : ''}{statusLabels[room.status] ?? room.status}{room.currentGuest ? ` · ${room.currentGuest}` : ''}</small></a>)}</div>}{searchData.reservations.length > 0 && <div><h3>Réservations</h3>{searchData.reservations.map((item) => <a key={item.id} href={roleCode === 'HOTEL_ADMIN' ? '/admin-hotel' : '/reception'}><b>{item.reference}</b><small>{item.client ?? 'Nom soumis · permission'} · Ch. {item.room ?? 'à attribuer'} · {statusLabels[item.status] ?? item.status}</small></a>)}</div>}{searchData.clients.length > 0 && <div><h3>Clients</h3>{searchData.clients.map((client) => <a key={client.id} href="/reception"><b>{client.name}</b><small>{[client.email, client.phone].filter(Boolean).join(' · ')}</small></a>)}</div>}{!searchData.rooms.length && !searchData.reservations.length && !searchData.clients.length && <p className="ops-empty">Aucun résultat accessible pour cette recherche.</p>}</div></section>}
    {error && <p className="ops-error" role="alert">{error}</p>}
    <nav className="ops-tabs" aria-label="Sections du centre de pilotage">{views.map(([key, label, count]) => <button key={key} className={view === key ? 'is-active' : ''} onClick={() => setView(key)}>{label}{key !== 'summary' && <span>{count}</span>}</button>)}</nav>

    {view === 'summary' && <>
      <section className="ops-kpis">
        {can('rooms.view') && <button onClick={() => setView('rooms')}><span><BedDouble size={17} />Occupation</span><strong>{data?.kpis.occupancyRate ?? 0}%</strong><small>{data?.kpis.occupied ?? 0} occupées · {data?.kpis.ready ?? 0} prétes</small></button>}
        {(can('reservations.view') || can('stays.view')) && <button onClick={() => setView('agenda')}><span><CalendarDays size={17} />Arrivées · départs</span><strong>{(data?.kpis.arrivals ?? 0) + (data?.kpis.departures ?? 0)}</strong><small>{data?.kpis.arrivals ?? 0} arrivées · {data?.kpis.departures ?? 0} départs</small></button>}
        {(can('housekeeping.tasks.view') || can('housekeeping.tasks.assign') || can('housekeeping.tasks.execute')) && <button onClick={() => setView('tasks')}><span><ClipboardCheck size={17} />Tâches ouvertes</span><strong>{data?.kpis.tasks ?? 0}</strong><small>{data?.kpis.overdueTasks ?? 0} en retard</small></button>}
        <button onClick={() => setView('alerts')} className={(data?.alerts.length ?? 0) > 0 ? 'has-alerts' : ''}><span><ShieldAlert size={17} />Alertes · traiter</span><strong>{data?.alerts.length ?? 0}</strong><small>{data?.kpis.incidents ?? 0} incidents ouverts</small></button>
        {data?.finance && <button onClick={() => setView('activity')}><span><Wallet size={17} />Encaissements</span><strong>{money(data.finance.collected, data.currency)}</strong><small>{data.finance.payments} paiement(s) · solde {money(data.finance.outstanding, data.currency)}</small></button>}
      </section>

      {can('rooms.view') && <section className="ops-cockpit-charts">
        <article className="ops-panel ops-visual-panel"><div className="ops-panel-head"><div><p>ÉTAT DE L’INVENTAIRE</p><h2>Occupation de l’hôtel</h2></div><button className="ops-chart-link" onClick={() => setView('rooms')}>Détails <ChevronRight size={14} /></button></div>
          <CockpitDonut total={data?.kpis.rooms ?? 0} centerValue={`${data?.kpis.occupancyRate ?? 0}%`} centerLabel="occupation" segments={[
            { label: 'Occupées', value: data?.kpis.occupied ?? 0, color: '#5896D0' },
            { label: 'Prêtes', value: data?.kpis.ready ?? 0, color: '#59A98A' },
            { label: 'Réservées', value: data?.kpis.reserved ?? 0, color: '#C6A878' },
            { label: 'À préparer / bloquées', value: Math.max(0, (data?.kpis.rooms ?? 0) - (data?.kpis.occupied ?? 0) - (data?.kpis.ready ?? 0) - (data?.kpis.reserved ?? 0)), color: '#B7C1CC' },
          ]} onSelect={() => setView('rooms')} />
        </article>
        <article className="ops-panel ops-visual-panel"><div className="ops-panel-head"><div><p>RYTHME OPÉRATIONNEL</p><h2>Activité sur la période</h2></div><Activity size={18} /></div>
          <CockpitBars rows={[
            { label: 'Arrivées', value: data?.kpis.arrivals ?? 0, color: '#5896D0' },
            { label: 'Départs', value: data?.kpis.departures ?? 0, color: '#C6A878' },
            { label: 'Tâches ouvertes', value: data?.kpis.tasks ?? 0, color: '#59A98A' },
            { label: 'Incidents actifs', value: data?.kpis.incidents ?? 0, color: '#D97868' },
          ]} />
          <button className="ops-chart-link" onClick={() => setView('agenda')}>Ouvrir l’agenda <ChevronRight size={14} /></button>
        </article>
      </section>}

      <div className="ops-grid">
        <section className="ops-panel ops-chart-panel"><div className="ops-panel-head"><div><p>ANALYSE DES RECETTES</p><h2>Encaissements · 7 derniers jours</h2></div><span className="ops-live"><i />Données caisse</span></div>{data?.trend.length ? <div className="ops-chart"><div className="ops-chart-scale"><span>{money(chartMax, data.currency)}</span><span>{money(chartMax / 2, data.currency)}</span><span>0</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="évolution des encaissements par jour"><polyline points={chartPoints} fill="none" vectorEffect="non-scaling-stroke" />{data.trend.map((point, index) => <circle key={point.date} cx={data.trend.length <= 1 ? 50 : (index / (data.trend.length - 1)) * 100} cy={88 - (Number(point.amount) / chartMax) * 78} r="1.6"><title>{dateText(point.date)} · {money(point.amount, data.currency)}</title></circle>)}</svg></div> : <p className="ops-empty">Aucune donnée financière accessible.</p>}<div className="ops-chart-labels">{data?.trend.map((point) => <span key={point.date}>{new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(new Date(`${point.date}T12:00:00`))}<b>{money(point.amount, data.currency)}</b></span>)}</div></section>
        <section className="ops-panel"><div className="ops-panel-head"><div><p>é SURVEILLER</p><h2>Alertes prioritaires</h2></div><AlertTriangle size={18} /></div>{data?.alerts.slice(0, 5).map((alert) => <a className={`ops-alert ${alert.priority}`} href={alert.href} key={alert.id}><span><b>{alert.title}</b><small>{alert.detail}</small></span><ChevronRight size={16} /></a>)}{!data?.alerts.length && <p className="ops-empty">Aucune anomalie opérationnelle détectée sur les données disponibles.</p>}<button className="ops-text-button" onClick={() => setView('alerts')}>Ouvrir le centre d’alertes <ChevronRight size={14} /></button></section>
        {(can('reservations.view') || can('stays.view') || can('housekeeping.tasks.view') || can('housekeeping.tasks.assign') || can('housekeeping.tasks.execute') || can('maintenance.view') || can('maintenance.incidents.report')) && <section className="ops-panel"><div className="ops-panel-head"><div><p>AGENDA</p><h2>Prochaines opérations</h2></div><CalendarDays size={18} /></div>{data?.events.slice(0, 6).map((event) => <div className="ops-event" key={event.id}><span className={`ops-event-mark ${event.kind}`} /><div><small>{kindLabels[event.kind] ?? event.kind} · chambre {event.room}</small><b>{event.title}</b><span>{dateTime(event.date)}</span></div><em>{statusLabels[event.status] ?? event.status}</em></div>)}{!data?.events.length && <p className="ops-empty">Aucune opération planifiée pendant cette période.</p>}<button className="ops-text-button" onClick={() => setView('agenda')}>Voir l’agenda <ChevronRight size={14} /></button></section>}
        {(can('housekeeping.tasks.view') || can('housekeeping.tasks.assign') || can('housekeeping.tasks.execute')) && <section className="ops-panel"><div className="ops-panel-head"><div><p>À FAIRE</p><h2>Mes tâches</h2></div><ClipboardCheck size={18} /></div>{data?.tasks.slice(0, 6).map((task) => <div className="ops-task" key={task.id}><span className={task.priority === 'URGENT' ? 'urgent' : ''}>{statusLabels[task.priority] ?? task.priority}</span><div><b>{task.title}</b><small>Ch. {task.room}{task.assignee ? ` · ${task.assignee}` : ''}{task.dueAt ? ` · échéance ${dateTime(task.dueAt)}` : ''}</small></div><a href="/housekeeping" aria-label="Ouvrir les tâches"><ChevronRight size={16} /></a></div>)}{!data?.tasks.length && <p className="ops-empty">Aucune tâche assignée ou accessible.</p>}<button className="ops-text-button" onClick={() => setView('tasks')}>Voir le centre des tâches <ChevronRight size={14} /></button></section>}
      </div>
      {data?.finance && <section className="ops-panel ops-finance"><div className="ops-panel-head"><div><p>CONTRÔLE FINANCIER · {data.currency === 'XAF' ? 'FCFA' : data.currency}</p><h2>Activité de la période</h2></div><Wallet size={18} /></div><div className="ops-finance-metrics"><div><span>Facturé</span><b>{money(data.finance.invoiced, data.currency)}</b><small>{data.finance.invoices} facture(s) · {changeLabel(data.finance.invoiced, data.finance.previousInvoiced, data.currency)}</small></div><div><span>Encaissé</span><b>{money(data.finance.collected, data.currency)}</b><small>{data.finance.payments} paiement(s) · {changeLabel(data.finance.collected, data.finance.previousCollected, data.currency)}</small></div><div><span>Créances ouvertes</span><b>{money(data.finance.outstanding, data.currency)}</b><small>folios non réglés</small></div>{data.finance.expenses !== null && <div><span>Dépenses enregistrées</span><b>{money(data.finance.expenses, data.currency)}</b><small>{data.finance.expenseCount} dépense(s) dans les rapports de service</small></div>}</div></section>}
      {data?.roomPerformance.length ? <RoomPerformance rows={visiblePerformance} search={tableSearch} setSearch={setTableSearch} currency={data.currency} /> : null}
    </>}

    {view === 'agenda' && <section className="ops-panel"><div className="ops-panel-head"><div><p>CALENDRIER OPéRATIONNEL</p><h2>{dateText(from)} – {dateText(to)}</h2></div><CalendarDays size={18} /></div><div className="ops-list">{data?.events.map((event) => <a href={event.kind === 'housekeeping' ? '/housekeeping' : event.kind === 'maintenance' ? '/maintenance' : '/reception'} className="ops-list-row" key={event.id}><span>{dateTime(event.date)}</span><b>{event.title}</b><span>Ch. {event.room}</span><em>{kindLabels[event.kind]} · {statusLabels[event.status] ?? event.status}</em></a>)}{!data?.events.length && <p className="ops-empty">Aucun événement sur cette période.</p>}</div></section>}
    {view === 'tasks' && <section className="ops-panel"><div className="ops-panel-head"><div><p>TRAVAIL EN ATTENTE</p><h2>Tâches d’entretien</h2></div><ClipboardCheck size={18} /></div><div className="ops-list">{data?.tasks.map((task) => <a href="/housekeeping" className="ops-list-row" key={task.id}><span>{task.dueAt ? dateTime(task.dueAt) : 'Sans échéance'}</span><b>{task.title}</b><span>Ch. {task.room}</span><em>{statusLabels[task.status] ?? task.status} · {statusLabels[task.priority] ?? task.priority}{task.assignee ? ` · ${task.assignee}` : ''}</em></a>)}{!data?.tasks.length && <p className="ops-empty">Aucune tâche accessible pour votre profil.</p>}</div></section>}
    {view === 'alerts' && <section className="ops-panel"><div className="ops-panel-head"><div><p>ANOMALIES ET RETARDS</p><h2>Centre de résolution</h2></div><AlertTriangle size={18} /></div><div className="ops-list">{data?.alerts.map((alert) => <a href={alert.href} className={`ops-list-row ${alert.priority}`} key={alert.id}><span>{alert.priority === 'high' ? 'Prioritaire' : 'é traiter'}</span><b>{alert.title}</b><span>{alert.detail}</span><em>Ouvrir <ChevronRight size={13} /></em></a>)}{!data?.alerts.length && <p className="ops-empty">Aucune alerte · traiter.</p>}</div></section>}
    {view === 'rooms' && <><section className="ops-kpis"><button><span><BedDouble size={17} />Inventaire visible</span><strong>{data?.kpis.rooms ?? 0}</strong><small>dans votre périmétre</small></button><button><span><ArrowUpRight size={17} />Occupées</span><strong>{data?.kpis.occupied ?? 0}</strong><small>clients présents</small></button><button><span><Check size={17} />Prétes</span><strong>{data?.kpis.ready ?? 0}</strong><small>propres et disponibles</small></button><button><span><ArrowDownRight size={17} />Réservées</span><strong>{data?.kpis.reserved ?? 0}</strong><small>sur la période</small></button></section><section className="ops-panel"><div className="ops-panel-head"><div><p>INDICATEURS ACCESSIBLES</p><h2>Performance des chambres</h2></div><BedDouble size={18} /></div>{data?.roomPerformance.length ? <RoomPerformance rows={visiblePerformance} search={tableSearch} setSearch={setTableSearch} currency={data.currency} /> : <p className="ops-empty">Les montants par chambre nécessitent une permission financière et des paiements associés aux folios.</p>}</section></>}
    {view === 'activity' && <div className="ops-grid"><section className="ops-panel"><div className="ops-panel-head"><div><p>OPéRATIONS RéUSSIES</p><h2>Journal de la période</h2></div><Activity size={18} /></div>{data?.activity.map((item) => <div className="ops-event" key={item.id}><span className="ops-event-mark activity" /><div><b>{item.action.replaceAll('_', ' ')}</b><span>{item.actor ?? 'Compte'} · {dateTime(item.createdAt)}{item.targetId ? ` · ${item.targetId}` : ''}</span></div></div>)}{!data?.activity.length && <p className="ops-empty">Aucune opération enregistrée sur la période ou journal non accessible.</p>}</section><section className="ops-panel"><div className="ops-panel-head"><div><p>MESSAGES PERSISTéS</p><h2>Notifications</h2></div><Bell size={18} /></div>{data?.notifications.map((notification) => <article className={`ops-notification${notification.readAt ? '' : ' unread'}`} key={notification.id}><div><p>{notification.message}</p><small>{dateTime(notification.createdAt)}</small></div>{!notification.readAt && <button onClick={() => void markRead(notification.id)} aria-label="Marquer comme lue"><Check size={15} /></button>}</article>)}{!data?.notifications.length && <p className="ops-empty">Aucune notification.</p>}</section></div>}

    {data && ['RESTAURANT_MANAGER', 'MAINTENANCE_MANAGER'].includes(data.user.roleCode) && <section className="ops-module-note"><Wrench size={17} /><span>{data.user.roleCode === 'MAINTENANCE_MANAGER' ? 'Le registre des incidents et chambres en maintenance est alimenté par les données existantes.' : 'Le projet ne contient pas encore de module de commandes, ventes ou stocks de restauration ; aucun chiffre fictif ne s’affiche.'}</span></section>}
    {data && <footer className="ops-footer"><span>Derniére actualisation {updatedAt ? dateTime(updatedAt) : '—'}</span><span>Les données sont filtrées selon le réle et le périmétre de cet utilisateur.</span>{data.modules.commissions === 'not_configured' && <span>Commissions et validations générales : module non configuré.</span>}</footer>}
    {busy && <div className="ops-loading" role="status">Mise · jour des données…</div>}
  </Root>;
}

function RoomPerformance({ rows, search, setSearch, currency }: { rows: OperationsData['roomPerformance']; search: string; setSearch: (value: string) => void; currency: string }) {
  return <section className="ops-panel ops-performance"><div className="ops-panel-head"><div><p>FICHE ANALYTIQUE</p><h2>Comparaison par chambre</h2></div><BedDouble size={18} /></div><label className="ops-table-search"><Search size={15} /><input placeholder="Filtrer numéro ou étage" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="ops-table-wrap"><table><thead><tr><th>Chambre</th><th>étage</th><th>Séjours</th><th>Siestes</th><th>Nuitées</th><th>Encaissements liés</th></tr></thead><tbody>{rows.map((room) => <tr key={room.room}><td><b>Ch. {room.room}</b></td><td>{room.floor ?? '—'}</td><td>{room.stays}</td><td>{room.siestas}</td><td>{room.overnight}</td><td><strong>{money(room.revenue, currency)}</strong></td></tr>)}{!rows.length && <tr><td colSpan={6}>Aucune chambre trouvée.</td></tr>}</tbody></table></div></section>;
}
