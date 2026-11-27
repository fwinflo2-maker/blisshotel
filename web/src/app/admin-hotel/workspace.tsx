'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BedDouble, Bell, CalendarDays, ChevronRight, ClipboardList, FileText, Home, LogOut, Menu, ShieldCheck, Wrench, X } from 'lucide-react';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import BusinessActivityExplorer from '@/components/business-activity-explorer';
import { CockpitBars, CockpitDonut } from '@/components/cockpit-charts';
import OperationsCenter from '@/features/workspace/operations-center';
import { useRouter } from 'next/navigation';
import './workspace.css';

const styles = new Proxy({} as Record<string, string>, { get: (_target, key) => `ah-${String(key)}` });

type Section = 'dashboard' | 'operations' | 'rooms' | 'reservations' | 'rates' | 'housekeeping' | 'maintenance' | 'reports' | 'activity' | 'notifications' | 'profile';
type Overview = { period: string; from: string; to: string; currency: string; counts: Record<string, number>; financial: { collected: string | null } | null; upcoming: { id: string; reference: string; status: string; checkInDate: string; checkOutDate: string; roomNumber: string; client: string | null }[] };
type Room = { id: string; number: string; floor: string | null; capacity: number | null; bedType: string | null; area: string | null; description: string | null; observations: string | null; equipment: unknown; photos: unknown; status: string; currentGuest: { name: string; expectedCheckOutAt: string | null } | null; housekeepingStatus: string; technicalStatus: string; category: string; categoryCapacity: number | null; nightlyRateMin: string | null; nightlyRateMax: string | null; reservations: { id: string; reference: string; status: string; stayType: string; checkInDate: string; checkOutDate: string; client: string | null }[]; housekeepingTasks: { id: string; title: string; status: string; createdAt: string; updatedAt: string; inspectionNote: string | null }[]; incidents: { id: string; title: string; description: string | null; status: string; createdAt: string; updatedAt: string; reportedBy: string }[]; history: { id: string; dimension: string; previousStatus: string | null; nextStatus: string; reason: string | null; source: string; actorId: string | null; createdAt: string }[] };
type Reservation = { id: string; reference: string; status: string; stayType: string; client: { id: string; name: string; phone?: string | null; email?: string | null }; room: { id: string; number: string; category: string } | null; checkInDate: string; checkOutDate: string; createdAt: string; totalAmount: string; rateReason: string | null };
type Task = { id: string; title: string; status: string; taskType: string; priority: string; dueAt: string | null; createdAt: string; updatedAt: string; inspectionNote: string | null; room: { id: string; number: string }; assignee: string | null; agents: string[]; inspector: string | null };
type Notification = { id: string; message: string; readAt: string | null; createdAt: string };
type ActivityItem = { id: string; action: string; result: string; targetId: string | null; details: unknown; createdAt: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? 'La requête a échoué.');
  return payload as T;
}

const labels: Record<string, string> = {
  AVAILABLE: 'Libre', RESERVED: 'Réservée', OCCUPIED: 'Occupée · indisponible', DIRTY: 'À nettoyer', OUT_OF_SERVICE: 'Hors service',
  CLEAN: 'Propre', TO_CLEAN: 'À nettoyer', IN_PROGRESS: 'En cours', TO_INSPECT: 'À inspecter', OPERATIONAL: 'Opérationnel',
  INTERVENTION_REQUIRED: 'Intervention requise', UNDER_MAINTENANCE: 'En maintenance', PENDING: 'En attente', CONFIRMED: 'Confirmée',
  CHECKED_IN: 'En séjour', CHECKED_OUT: 'Terminée', CANCELLED: 'Annulée', READY_FOR_INSPECTION: 'À inspecter', COMPLETED: 'Terminée',
  OPEN: 'Ouvert', RESOLVED: 'Résolu', SUCCESS: 'Réussi', FAILURE: 'Échec',
};
const label = (value: string) => labels[value] ?? value.replaceAll('_', ' ').toLocaleLowerCase('fr-FR');
const currencyLabel = (_currency: string) => {
  void _currency;
  return 'XAF';
};
const dateText = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const dateTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const oldestDashboardDate = () => { const date = new Date(); date.setFullYear(date.getFullYear() - 99); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const permissionNames: Record<string, string> = {
  'rooms.view': 'Consulter ses chambres', 'rooms.manage': 'Modifier les informations des chambres', 'rooms.rates.view': 'Consulter les tarifs',
  'reservations.view': 'Consulter les réservations', 'stays.view': 'Consulter les séjours', 'housekeeping.tasks.view': 'Consulter l’entretien',
  'maintenance.view': 'Consulter la maintenance', 'maintenance.incidents.report': 'Signaler un incident', 'reports.financial.view': 'Consulter les montants encaissés',
};

export default function AdminHotelWorkspace({ name, permissions }: { name: string; permissions: string[] }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const can = useCallback((permission: string) => permissions.includes(permission), [permissions]);
  const [section, setSection] = useState<Section>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [selectedDate, setSelectedDate] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rates, setRates] = useState<{ id: string; number: string; floor: string | null; category: string; stayMinimum: string | null; stayMaximum: string | null; siestaReference: string | null }[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [maintenance, setMaintenance] = useState<{ id: string; number: string; status: string; technicalStatus: string; incidents: Room['incidents']; statusHistory: Room['history'] }[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [incidentForm, setIncidentForm] = useState({ roomId: '', title: '', description: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });

  const menu = useMemo(() => [
    { id: 'dashboard' as const, title: 'Tableau de bord', icon: Home, show: can('dashboard.view') },
    { id: 'operations' as const, title: 'Centre de pilotage', icon: Activity, show: can('dashboard.view') },
    { id: 'rooms' as const, title: 'Mes chambres', icon: BedDouble, show: can('rooms.view') },
    { id: 'reservations' as const, title: 'Réservations et séjours', icon: CalendarDays, show: can('reservations.view') || can('stays.view') },
    { id: 'rates' as const, title: 'Tarifs de mes chambres', icon: FileText, show: can('rooms.rates.view') },
    { id: 'housekeeping' as const, title: 'Service d’entretien', icon: ClipboardList, show: can('housekeeping.tasks.view') },
    { id: 'maintenance' as const, title: 'Maintenance et incidents', icon: Wrench, show: can('maintenance.view') || can('maintenance.incidents.report') },
    { id: 'reports' as const, title: 'Rapports et statistiques', icon: Activity, show: can('dashboard.view') },
    { id: 'activity' as const, title: 'Historique de mes opérations', icon: ShieldCheck, show: true },
    { id: 'notifications' as const, title: 'Notifications', icon: Bell, show: can('dashboard.view') },
    { id: 'profile' as const, title: 'Mon profil', icon: ShieldCheck, show: true },
  ].filter((item) => item.show), [permissions]);

  const loadOverview = useCallback(async () => {
    const query = new URLSearchParams({ period, ...(selectedDate ? { date: selectedDate } : {}) });
    setOverview(await request<Overview>(`/api/admin-hotel/overview?${query}`));
  }, [period, selectedDate]);
  const loadRooms = useCallback(async () => setRooms((await request<{ rooms: Room[] }>('/api/admin-hotel/rooms')).rooms), []);
  const loadSection = useCallback(async (next: Section) => {
    setSection(next); setMobileNav(false); setError(''); setNotice(''); setBusy(true);
    try {
      if (next === 'rooms') await loadRooms();
      if (next === 'reservations') setReservations((await request<{ reservations: Reservation[] }>('/api/reception/reservations')).reservations);
      if (next === 'rates') setRates((await request<{ rooms: typeof rates }>('/api/admin-hotel/rates')).rooms);
      if (next === 'housekeeping') setTasks((await request<{ tasks: Task[] }>('/api/admin-hotel/housekeeping')).tasks);
      if (next === 'maintenance' && can('maintenance.view')) setMaintenance((await request<{ rooms: typeof maintenance }>('/api/admin-hotel/maintenance')).rooms);
      if (next === 'maintenance' && !can('maintenance.view')) await loadRooms();
      if (next === 'activity') setActivity((await request<{ events: ActivityItem[] }>('/api/admin-hotel/activity')).events);
      if (next === 'notifications') setNotifications((await request<{ notifications: Notification[] }>('/api/reception/notifications')).notifications);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger cette rubrique.'); }
    finally { setBusy(false); }
  }, [can, loadOverview, loadRooms]);

  useEffect(() => {
    if (section !== 'dashboard' && section !== 'reports') return;
    let active = true;
    setBusy(true);
    void loadOverview().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [period, selectedDate, section, loadOverview]);

  async function markNotification(id?: string) {
    try {
      await request('/api/reception/notifications', { method: 'POST', body: JSON.stringify(id ? { id } : { all: true }) });
      setNotifications((items) => items.map((item) => !id || item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de modifier la notification.'); }
  }

  async function reportIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      await request('/api/admin-hotel/incidents', { method: 'POST', body: JSON.stringify(incidentForm) });
      setNotice('Le signalement a été enregistré. La remise en service reste réservée au personnel habilité.');
      setIncidentForm({ roomId: '', title: '', description: '' });
      if (can('maintenance.view')) setMaintenance((await request<{ rooms: typeof maintenance }>('/api/admin-hotel/maintenance')).rooms);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Le signalement a échoué.'); }
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedRoom) return;
    const form = new FormData(event.currentTarget);
    try {
      await request('/api/admin-hotel/rooms', { method: 'PATCH', body: JSON.stringify({
        id: selectedRoom.id, floor: String(form.get('floor') ?? '').trim() || null,
        description: String(form.get('description') ?? '').trim() || null,
        observations: String(form.get('observations') ?? '').trim() || null,
      }) });
      setSelectedRoom(null); setNotice('Informations de la chambre mises à jour.'); await loadRooms();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.'); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      await request('/api/reception/profile/password', { method: 'POST', body: JSON.stringify(passwordForm) });
      setNotice('Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.');
      setPasswordForm({ currentPassword: '', newPassword: '' });
      window.setTimeout(() => { router.push('/connexion'); router.refresh(); }, 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de modifier le mot de passe.'); }
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/connexion'); router.refresh(); }
  const title = menu.find((item) => item.id === section)?.title ?? 'Tableau de bord';

  return <div className={styles.shell} data-theme={theme}>
    {mobileNav && <button className={styles.backdrop} onClick={() => setMobileNav(false)} aria-label="Fermer le menu" />}
    <aside className={`${styles.sidebar} ${mobileNav ? styles.sidebarOpen : ''}`}>
      <div className={styles.brand}><span className={styles.brandIcon}><BedDouble size={19} /></span><span><b>BLISS HOTEL</b><small>Espace Administrateur Hôtel</small></span><button className={styles.closeMenu} onClick={() => setMobileNav(false)} aria-label="Fermer"><X size={19} /></button></div>
      <nav className={styles.nav} aria-label="Menu administrateur">{menu.map(({ id, title: itemTitle, icon: Icon }) => <button key={id} type="button" onClick={() => void loadSection(id)} className={`${styles.navItem} ${section === id ? styles.navActive : ''}`}><Icon size={17} /><span>{itemTitle}</span><ChevronRight size={15} /></button>)}</nav>
      <div className={styles.profile}><span className={styles.avatar}>{name.slice(0, 1).toUpperCase()}</span><span><b>{name}</b><small>Administrateur Hôtel</small></span><button onClick={() => void logout()} aria-label="Déconnexion" title="Déconnexion"><LogOut size={17} /></button></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}><button className={styles.mobileMenu} onClick={() => setMobileNav(true)} aria-label="Ouvrir le menu"><Menu size={19} /></button><div><span>BLISS HOTEL</span><i>/</i><b>{title}</b></div><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /><button className={styles.topbarLogout} onClick={() => void logout()} aria-label="Déconnexion" title="Déconnexion"><LogOut size={16} /><span>Déconnexion</span></button></header>
      <div className={styles.content}>
        <div className={styles.heading}><div><p>Votre périmètre de gestion</p><h1>{title}</h1><span>Uniquement les chambres attribuées à votre compte</span></div>{(section === 'dashboard' || section === 'reports') && <div className={styles.filters}><label>Période<select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="year">Année</option></select></label><label>Date de référence<input type="date" min={oldestDashboardDate()} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label></div>}</div>
        {error && <div className={styles.alertError} role="alert"><AlertTriangle size={17} />{error}</div>}{notice && <div className={styles.alertSuccess} role="status">{notice}</div>}
        {busy && <div className={styles.loading}><span />Chargement…</div>}

        {(section === 'dashboard' || section === 'reports') && overview && <><BusinessActivityExplorer currency={overview.currency} /><DashboardSection data={overview} section={section} canFinancial={can('reports.financial.view')} canExport={can('reports.export')} openRooms={() => void loadSection('rooms')} /></>}
        {section === 'operations' && <OperationsCenter name={name} roleCode="HOTEL_ADMIN" />}
        {section === 'rooms' && <RoomsSection rooms={rooms} canEdit={can('rooms.manage')} canRates={can('rooms.rates.view')} selectRoom={setSelectedRoom} />}
        {section === 'reservations' && <ReservationsSection reservations={reservations} canSeeClients={can('clients.view')} />}
        {section === 'rates' && <RatesSection rates={rates} />}
        {section === 'housekeeping' && <HousekeepingSection tasks={tasks} />}
        {section === 'maintenance' && <MaintenanceSection rooms={maintenance} allRooms={rooms} canView={can('maintenance.view')} canReport={can('maintenance.incidents.report')} form={incidentForm} setForm={setIncidentForm} submit={reportIncident} />}
        {section === 'activity' && <ActivitySection events={activity} />}
        {section === 'notifications' && <NotificationsSection items={notifications} mark={markNotification} />}
        {section === 'profile' && <ProfileSection name={name} permissions={permissions} form={passwordForm} setForm={setPasswordForm} submit={changePassword} />}
        <footer className={styles.footer}>BLISS HOTEL · Les permissions et les chambres attribuées déterminent les informations visibles ici.</footer>
      </div>
    </main>
    {selectedRoom && <RoomDialog room={selectedRoom} canEdit={can('rooms.manage')} close={() => setSelectedRoom(null)} save={saveRoom} />}
  </div>;
}

function DashboardSection({ data, section, canFinancial, canExport, openRooms }: { data: Overview; section: 'dashboard' | 'reports'; canFinancial: boolean; canExport: boolean; openRooms: () => void }) {
  const counts = data.counts;
  const occupancy = counts.rooms ? Math.round((counts.occupied / counts.rooms) * 100) : 0;
  const metrics = [
    ['Chambres attribuées', counts.rooms, 'périmètre'], ['Libres', counts.available, 'état actuel'], ['Réservées', counts.reserved, 'sur la période'], ['Occupées', counts.occupied, 'état actuel'],
    ['À nettoyer', counts.toClean, 'entretien'], ['En cours', counts.inProgress, 'entretien'], ['À inspecter', counts.toInspect, 'entretien'], ['En maintenance', counts.maintenance, 'technique'],
    ['Arrivées prévues', counts.arrivals, 'période choisie'], ['Départs prévus', counts.departures, 'période choisie'], ['Séjours en cours', counts.inHouse, 'actuellement'], ['Réservations futures', counts.futureReservations, 'à venir'], ['Incidents ouverts', counts.incidents, 'chambres attribuées'],
  ] as [string, number, string][];
  if (section === 'dashboard') return <div className={styles.stack}>
    <section className={styles.dashboardHero}>
      <div><p>COCKPIT · VOTRE PÉRIMÈTRE</p><h2>Votre activité, en un regard</h2><span>Chambres attribuées · {dateText(data.from)} – {dateText(data.to)}</span></div>
      <div className={styles.dashboardHeroStat}><strong>{occupancy}%</strong><span>d’occupation</span></div>
    </section>
    <div className={styles.metricGrid}>
      {[
        ['Chambres attribuées', counts.rooms, 'votre inventaire'],
        ['Taux d’occupation', `${occupancy}%`, `${counts.occupied} chambre(s) occupée(s)`],
        ['Arrivées · départs', counts.arrivals + counts.departures, `${counts.arrivals} arrivée(s) · ${counts.departures} départ(s)`],
        ['Incidents actifs', counts.incidents, `${counts.maintenance} chambre(s) en maintenance`],
      ].map(([title, value, hint]) => <article className={styles.metric} key={String(title)}><span>{title}</span><strong>{value}</strong><small>{hint}</small></article>)}
      {canFinancial && data.financial && <article className={`${styles.metric} ${styles.metricAccent}`}><span>Encaissements liés</span><strong>{data.financial.collected ?? '0.00'} {currencyLabel(data.currency)}</strong><small>uniquement vos chambres</small></article>}
    </div>
    <div className={styles.cockpitGrid}>
      <section className={styles.panel}><div className={styles.panelTitle}><div><p>Disponibilité · chambres attribuées</p><h2>Équilibre de l’inventaire</h2></div><BedDouble size={18} /></div>
        <CockpitDonut total={counts.rooms} centerValue={`${occupancy}%`} centerLabel="occupation" segments={[
          { label: 'Occupées', value: counts.occupied, color: '#5896D0' },
          { label: 'Libres', value: counts.available, color: '#59A98A' },
          { label: 'Réservées', value: counts.reserved, color: '#C6A878' },
          { label: 'À préparer / bloquées', value: Math.max(0, counts.rooms - counts.occupied - counts.available - counts.reserved), color: '#B7C1CC' },
        ]} onSelect={openRooms} />
      </section>
      <section className={styles.panel}><div className={styles.panelTitle}><div><p>Entretien · votre périmètre</p><h2>Charge opérationnelle</h2></div><ClipboardList size={18} /></div>
        <CockpitBars rows={[
          { label: 'À nettoyer', value: counts.toClean, color: '#5896D0' },
          { label: 'En cours', value: counts.inProgress, color: '#C6A878' },
          { label: 'À inspecter', value: counts.toInspect, color: '#59A98A' },
          { label: 'Maintenance', value: counts.maintenance, color: '#D97868' },
        ]} />
        <div className={styles.cockpitFootnote}>{counts.incidents} incident(s) ouvert(s) · {counts.futureReservations} réservation(s) à venir</div>
      </section>
    </div>
    <section className={styles.panel}><div className={styles.panelTitle}><div><p>Suivi de période · {dateText(data.from)} – {dateText(data.to)}</p><h2>Arrivées et départs à venir</h2></div><CalendarDays size={18} /></div>
      {data.upcoming.length ? <div className={styles.tableWrap}><table><thead><tr><th>Réservation</th><th>Chambre</th><th>Arrivée</th><th>Départ</th><th>Statut</th></tr></thead><tbody>{data.upcoming.map((item) => <tr key={item.id}><td><b>{item.reference}</b>{item.client && <small>{item.client}</small>}</td><td>{item.roomNumber}</td><td>{dateText(item.checkInDate)}</td><td>{dateText(item.checkOutDate)}</td><td><span className={styles.badge}>{label(item.status)}</span></td></tr>)}</tbody></table></div> : <Empty text="Aucune réservation accessible pour cette période." />}
    </section>
    <p className={styles.cockpitScope}>Données limitées aux chambres attribuées à votre compte et aux autorisations actives.</p>
  </div>;
  return <div className={styles.stack}>
    <div className={styles.metricGrid}>{metrics.map(([title, value, hint]) => <article className={styles.metric} key={title}><span>{title}</span><strong>{value ?? 0}</strong><small>{hint}</small></article>)}{canFinancial && data.financial && <article className={`${styles.metric} ${styles.metricAccent}`}><span>Encaissements liés</span><strong>{data.financial.collected ?? '0.00'} {currencyLabel(data.currency)}</strong><small>sur les chambres attribuées</small></article>}</div>
    {section === 'reports' ? <section className={styles.panel}><div className={styles.panelTitle}><div><p>Rapport opérationnel</p><h2>{dateText(data.from)} – {dateText(data.to)}</h2></div>{canExport ? <button className={styles.secondaryButton} onClick={() => exportReport(data, metrics)}>Exporter CSV</button> : <FileText size={18} />}</div><div className={styles.reportRows}>{metrics.map(([title, value]) => <div key={title}><span>{title}</span><b>{value ?? 0}</b></div>)}</div>{canFinancial && data.financial && <div className={styles.reportRows}><div><span>Encaissements liés</span><b>{data.financial.collected ?? '0.00'} {currencyLabel(data.currency)}</b></div></div>}<p className={styles.muted}>Rapport calculé depuis l’inventaire, les réservations, l’entretien et les incidents du périmètre attribué. Aucune donnée d’un autre administrateur n’est incluse.</p></section> : <section className={styles.panel}><div className={styles.panelTitle}><div><p>Activité à venir</p><h2>Réservations de mes chambres</h2></div><CalendarDays size={18} /></div>{data.upcoming.length ? <div className={styles.tableWrap}><table><thead><tr><th>Réservation</th><th>Chambre</th><th>Arrivée</th><th>Départ</th><th>Statut</th></tr></thead><tbody>{data.upcoming.map((item) => <tr key={item.id}><td><b>{item.reference}</b>{item.client && <small>{item.client}</small>}</td><td>{item.roomNumber}</td><td>{dateText(item.checkInDate)}</td><td>{dateText(item.checkOutDate)}</td><td><span className={styles.badge}>{label(item.status)}</span></td></tr>)}</tbody></table></div> : <Empty text="Aucune réservation sur la période sélectionnée ou accès non accordé." />}</section>}
  </div>;
}

function exportReport(data: Overview, rows: [string, number, string][]) {
  const values = [['BLISS HOTEL · Rapport chambres attribuées'], ['Période', `${data.from} – ${data.to}`], ...rows.map(([title, value]) => [title, String(value ?? 0)])];
  if (data.financial) values.push(['Encaissements liés', `${data.financial.collected ?? '0.00'} ${currencyLabel(data.currency)}`]);
  const csv = `\uFEFF${values.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `rapport-chambres-${data.from}-${data.to}.csv`; link.click(); URL.revokeObjectURL(url);
}

function RoomsSection({ rooms, canEdit, canRates, selectRoom }: { rooms: Room[]; canEdit: boolean; canRates: boolean; selectRoom: (room: Room) => void }) {
  return <section className={styles.panel}><div className={styles.panelTitle}><div><p>Inventaire central de BLISS HOTEL</p><h2>{rooms.length} chambre{rooms.length === 1 ? '' : 's'} attribuée{rooms.length === 1 ? '' : 's'}</h2></div><BedDouble size={18} /></div>{rooms.length ? <div className={styles.roomGrid}>{rooms.map((room) => <button className={styles.roomCard} key={room.id} onClick={() => selectRoom(room)}><div><span className={styles.roomNumber}>Ch. {room.number}</span><span className={`${styles.badge} ${room.status === 'OUT_OF_SERVICE' ? styles.badgeWarn : ''}`}>{label(room.status)}</span></div><b>{room.category}</b>{room.currentGuest && <small><strong>Client en séjour :</strong> {room.currentGuest.name}{room.currentGuest.expectedCheckOutAt ? ` · départ prévu ${dateTime(room.currentGuest.expectedCheckOutAt)}` : ''}</small>}<small>{room.floor ? `Étage ${room.floor}` : 'Étage non renseigné'} · Propreté : {label(room.housekeepingStatus)}</small><small>Technique : {label(room.technicalStatus)}</small>{canRates && <small>Tarif séjour : {room.nightlyRateMin ?? '—'} – {room.nightlyRateMax ?? '—'}</small>}<span className={styles.cardLink}>{canEdit ? 'Voir / modifier les détails' : 'Voir la fiche'} <ChevronRight size={14} /></span></button>)}</div> : <Empty text="Aucune chambre ne vous est attribuée pour le moment." />}</section>;
}

function ReservationsSection({ reservations, canSeeClients }: { reservations: Reservation[]; canSeeClients: boolean }) {
  return <section className={styles.panel}><div className={styles.panelTitle}><div><p>Module central Réservations</p><h2>Réservations et séjours attribués</h2></div><CalendarDays size={18} /></div>{reservations.length ? <div className={styles.tableWrap}><table><thead><tr><th>Référence</th><th>Client</th><th>Chambre</th><th>Séjour</th><th>Dates</th><th>Statut</th></tr></thead><tbody>{reservations.map((item) => <tr key={item.id}><td><b>{item.reference}</b></td><td>{canSeeClients ? item.client.name : 'Masqué par permission'}</td><td>{item.room ? `${item.room.number} · ${item.room.category}` : '—'}</td><td>{item.stayType === 'SIESTA' ? 'Sieste' : 'Nuitée'}</td><td>{dateText(item.checkInDate)} – {dateText(item.checkOutDate)}</td><td><span className={styles.badge}>{label(item.status)}</span></td></tr>)}</tbody></table></div> : <Empty text="Aucune réservation dans votre périmètre, ou la consultation n’est pas déléguée." />}<p className={styles.muted}>Cette vue est en consultation. Les opérations de réservation, check-in, check-out et caisse restent soumises à leurs permissions propres.</p></section>;
}

function RatesSection({ rates }: { rates: { id: string; number: string; floor: string | null; category: string; stayMinimum: string | null; stayMaximum: string | null; siestaReference: string | null }[] }) {
  return <section className={styles.panel}><div className={styles.panelTitle}><div><p>Lecture seule · module tarifaire central</p><h2>Tarifs de mes chambres</h2></div><FileText size={18} /></div>{rates.length ? <div className={styles.tableWrap}><table><thead><tr><th>Chambre</th><th>Catégorie</th><th>Séjour · min.</th><th>Séjour · max.</th><th>Repère sieste</th></tr></thead><tbody>{rates.map((room) => <tr key={room.id}><td>Ch. {room.number}{room.floor && <small>Étage {room.floor}</small>}</td><td>{room.category}</td><td>{room.stayMinimum ?? 'Non configuré'}</td><td>{room.stayMaximum ?? 'Non configuré'}</td><td>{room.siestaReference ?? 'Tarif libre selon les règles de réservation'}</td></tr>)}</tbody></table></div> : <Empty text="Aucun tarif à afficher." />}<p className={styles.muted}>Aucune modification tarifaire ni décision de dérogation n’est disponible sans délégation et workflow central dédié.</p></section>;
}

function HousekeepingSection({ tasks }: { tasks: Task[] }) {
  const summary = ['PENDING', 'IN_PROGRESS', 'READY_FOR_INSPECTION', 'COMPLETED'].map((status) => [status, tasks.filter((task) => task.status === status).length] as const);
  return <div className={styles.stack}><div className={styles.metricGrid}>{summary.map(([status, count]) => <article className={styles.metric} key={status}><span>{label(status)}</span><strong>{count}</strong><small>tâches du périmètre</small></article>)}</div><section className={styles.panel}><div className={styles.panelTitle}><div><p>Lecture seule · supervision gouvernante</p><h2>Tâches d’entretien</h2></div><ClipboardList size={18} /></div>{tasks.length ? <div className={styles.tableWrap}><table><thead><tr><th>Chambre</th><th>Tâche</th><th>Agents</th><th>Échéance</th><th>Inspection</th><th>Statut</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>Ch. {task.room.number}</td><td>{task.title}<small>{task.taskType} · priorité {label(task.priority)}</small></td><td>{task.agents.join(', ') || task.assignee || 'Non affectée'}</td><td>{dateTime(task.dueAt)}</td><td>{task.inspector ?? 'En attente'}</td><td><span className={styles.badge}>{label(task.status)}</span></td></tr>)}</tbody></table></div> : <Empty text="Aucune tâche liée à vos chambres." />}<p className={styles.muted}>L’affectation des agents et la validation finale des inspections restent réservées à la Gouvernante.</p></section></div>;
}

function MaintenanceSection({ rooms, allRooms, canView, canReport, form, setForm, submit }: { rooms: { id: string; number: string; status: string; technicalStatus: string; incidents: Room['incidents']; statusHistory: Room['history'] }[]; allRooms: Room[]; canView: boolean; canReport: boolean; form: { roomId: string; title: string; description: string }; setForm: (form: { roomId: string; title: string; description: string }) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className={styles.stack}>{canReport && <section className={styles.panel}><div className={styles.panelTitle}><div><p>Signalement</p><h2>Déclarer un incident</h2></div><AlertTriangle size={18} /></div><form className={styles.incidentForm} onSubmit={submit}><label>Chambre<select required value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}><option value="">Sélectionner une chambre attribuée</option>{allRooms.map((room) => <option key={room.id} value={room.id}>Ch. {room.number}</option>)}</select></label><label>Problème<input required minLength={3} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. fuite sous le lavabo" /></label><label>Description<textarea maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><button className={styles.primaryButton}>Envoyer le signalement</button></form></section>}{canView && <section className={styles.panel}><div className={styles.panelTitle}><div><p>Statut technique & historique central</p><h2>Maintenance de mes chambres</h2></div><Wrench size={18} /></div>{rooms.length ? rooms.map((room) => <article className={styles.incidentRoom} key={room.id}><header><b>Ch. {room.number}</b><span className={styles.badge}>{label(room.technicalStatus)}</span><span className={styles.badge}>{label(room.status)}</span></header>{room.incidents.map((incident) => <p key={incident.id}><strong>{incident.title}</strong> · {label(incident.status)}{incident.description && <small>{incident.description}</small>}</p>)}{room.statusHistory.map((event) => <p className={styles.muted} key={event.id}>{dateTime(event.createdAt)} · {label(event.previousStatus ?? '—')} → {label(event.nextStatus)}{event.reason ? ` · ${event.reason}` : ''}</p>)}</article>) : <Empty text="Aucun incident ou statut technique à signaler dans vos chambres." />}<p className={styles.muted}>Le signalement ne remet pas une chambre en service. La validation de remise à disposition reste réservée aux rôles habilités.</p></section>}</div>;
}

function ActivitySection({ events }: { events: ActivityItem[] }) {
  return <section className={styles.panel}><div className={styles.panelTitle}><div><p>Journal personnel</p><h2>Mes opérations récentes</h2></div><ShieldCheck size={18} /></div>{events.length ? <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Opération</th><th>Cible</th><th>Résultat</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{dateTime(event.createdAt)}</td><td>{event.action}</td><td>{event.targetId ?? '—'}</td><td>{label(event.result)}</td></tr>)}</tbody></table></div> : <Empty text="Aucune opération enregistrée pour votre compte." />}</section>;
}

function NotificationsSection({ items, mark }: { items: Notification[]; mark: (id?: string) => void }) {
  return <section className={styles.panel}><div className={styles.panelTitle}><div><p>Compte personnel</p><h2>Notifications</h2></div><Bell size={18} /></div>{items.length ? <><button className={styles.secondaryButton} onClick={() => mark()}>Tout marquer comme lu</button><div className={styles.notificationList}>{items.map((item) => <article className={item.readAt ? '' : styles.unread} key={item.id}><div><p>{item.message}</p><small>{dateTime(item.createdAt)}</small></div>{!item.readAt && <button onClick={() => mark(item.id)}>Marquer comme lu</button>}</article>)}</div></> : <Empty text="Aucune notification." />}</section>;
}

function ProfileSection({ name, permissions, form, setForm, submit }: { name: string; permissions: string[]; form: { currentPassword: string; newPassword: string }; setForm: (form: { currentPassword: string; newPassword: string }) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className={styles.stack}><section className={styles.panel}><div className={styles.panelTitle}><div><p>Compte connecté</p><h2>{name}</h2></div><ShieldCheck size={18} /></div><p className={styles.muted}>Administrateur Hôtel · BLISS HOTEL</p><div className={styles.permissionSummary}><b>Permissions accordées à ce compte</b><div>{permissions.map((permission) => <span key={permission}>{permissionNames[permission] ?? permission}</span>)}</div></div></section><section className={styles.panel}><div className={styles.panelTitle}><div><p>Sécurité du compte</p><h2>Changer mon mot de passe</h2></div></div><form className={styles.passwordForm} onSubmit={submit}><label>Mot de passe actuel<input type="password" autoComplete="current-password" minLength={8} required value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label><label>Nouveau mot de passe · 12 caractères minimum<input type="password" autoComplete="new-password" minLength={12} required value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /></label><button className={styles.primaryButton}>Mettre à jour</button></form></section></div>;
}

function RoomDialog({ room, canEdit, close, save }: { room: Room; canEdit: boolean; close: () => void; save: (event: FormEvent<HTMLFormElement>) => void }) {
  const equipment = Array.isArray(room.equipment) ? room.equipment.map(String) : [];
  const photos = Array.isArray(room.photos) ? room.photos.filter((item): item is string => typeof item === 'string') : [];
  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={styles.roomDialog} role="dialog" aria-modal="true" aria-labelledby="room-dialog-title"><header><div><p>Fiche de chambre</p><h2 id="room-dialog-title">Chambre {room.number}</h2></div><button onClick={close} aria-label="Fermer"><X size={20} /></button></header>{room.currentGuest && <section className={styles.detailBlock}><h3>Client actuellement hébergé</h3><p>{room.currentGuest.name}{room.currentGuest.expectedCheckOutAt ? ` · départ prévu ${dateTime(room.currentGuest.expectedCheckOutAt)}` : ''}</p></section>}<div className={styles.roomFacts}><span><small>Catégorie</small><b>{room.category}</b></span><span><small>Étage</small><b>{room.floor ?? '—'}</b></span><span><small>Occupation</small><b>{label(room.status)}</b></span><span><small>Propreté</small><b>{label(room.housekeepingStatus)}</b></span><span><small>Technique</small><b>{label(room.technicalStatus)}</b></span><span><small>Surface</small><b>{room.area ? `${room.area} m²` : '—'}</b></span></div>{room.description && <p className={styles.detailText}>{room.description}</p>}{equipment.length > 0 && <div className={styles.chipList}>{equipment.map((item) => <span key={item}>{item}</span>)}</div>}{photos.length > 0 && <div className={styles.photoGrid}>{photos.map((src) => <a href={src} target="_blank" rel="noreferrer" key={src}><img src={src} alt={`Chambre ${room.number}`} /></a>)}</div>}{room.housekeepingTasks.length > 0 && <section className={styles.detailBlock}><h3>Dernière intervention d’entretien</h3>{room.housekeepingTasks.slice(0, 3).map((task) => <p key={task.id}>{task.title} · {label(task.status)} · {dateTime(task.updatedAt)}{task.inspectionNote ? ` · ${task.inspectionNote}` : ''}</p>)}</section>}{room.reservations.length > 0 && <section className={styles.detailBlock}><h3>Réservations associées</h3>{room.reservations.map((reservation) => <p key={reservation.id}>{reservation.reference} · {reservation.client ?? 'Client masqué'} · {dateText(reservation.checkInDate)} – {dateText(reservation.checkOutDate)} · {label(reservation.status)}</p>)}</section>}{room.incidents.length > 0 && <section className={styles.detailBlock}><h3>Incidents</h3>{room.incidents.map((incident) => <p key={incident.id}>{incident.title} · {label(incident.status)} · {dateTime(incident.createdAt)}</p>)}</section>}<section className={styles.detailBlock}><h3>Historique des changements</h3>{room.history.length ? room.history.map((event) => <p key={event.id}>{dateTime(event.createdAt)} · {event.dimension} · {label(event.previousStatus ?? '—')} → {label(event.nextStatus)}{event.reason ? ` · ${event.reason}` : ''}</p>) : <span>Aucun changement historisé.</span>}</section>{canEdit && <form className={styles.passwordForm} onSubmit={save}><h3>Modifier les informations autorisées</h3><label>Étage<input name="floor" maxLength={30} defaultValue={room.floor ?? ''} /></label><label>Description<textarea name="description" maxLength={2000} rows={3} defaultValue={room.description ?? ''} /></label><label>Observations<textarea name="observations" maxLength={2000} rows={3} defaultValue={room.observations ?? ''} /></label><button className={styles.primaryButton}>Enregistrer les détails</button></form>}</section></div>;
}

function Empty({ text }: { text: string }) { return <div className={styles.empty}><span><BedDouble size={20} /></span><p>{text}</p></div>; }
