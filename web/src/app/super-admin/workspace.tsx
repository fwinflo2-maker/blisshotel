'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import OwnerOverview from '../proprietaire/owner-overview';
import OwnerClientRecords from '../proprietaire/owner-client-records';
import {
  Activity, BedDouble, Building2, ChevronDown, CircleHelp, ClipboardList, CreditCard, Database, Eye, FileText,
  LayoutDashboard, LockKeyhole, LogOut, Menu, Plus, Search, Settings2, Shield,
  ShieldAlert, Users, X,
} from 'lucide-react';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import ShiftReportsWorkspace from '@/features/shift-reports/shift-reports-workspace';
import AgentAccountForm from '@/features/housekeeping/agent-account-form';
import RoomAssignments from '@/features/rooms/room-assignments';
import MyRooms from '@/features/rooms/my-rooms';
import HotelAdminPermissions from '@/features/rooms/hotel-admin-permissions';
import OperationsCenter from '@/features/workspace/operations-center';
import { hotelCurrencies, hotelCurrencyLabels, type HotelCurrency } from '@/features/hotel/currency';
import { useRouter } from 'next/navigation';
import './super-admin.css';

type Section = 'overview' | 'operations' | 'clients' | 'users' | 'inventory' | 'room-assignments' | 'admin-permissions' | 'my-rooms' | 'roles' | 'settings' | 'audit' | 'reception-cancellations' | 'shift-reports' | 'diagnostics' | 'security';
type Audience = 'platform' | 'owner' | 'hotel-admin';
type User = { id: string; email: string; name: string; active: boolean; platformAdmin: boolean; lastLoginAt: string | null; createdAt: string; role: { code: string; name: string } | null };
type StaffActivity = {
  user: { id: string; name: string; email: string; active: boolean; createdAt: string; lastLoginAt: string | null; role: { code: string; name: string } | null };
  metrics: { reservationsCreated: number; clientsCreated: number; paymentsCount: number; amountCollected: string; cashSessionsOpened: number; cashSessionsClosed: number; auditEvents: number };
  cashSessions: { id: string; status: string; openingAmount: string; expectedCash: string | null; countedAmount: string | null; variance: string | null; openedAt: string; closedAt: string | null }[];
  events: { id: string; action: string; result: string; targetId: string | null; details: unknown; createdAt: string }[];
};
type Inventory = {
  currency: HotelCurrency;
  categories: { id: string; name: string; capacity: number | null; nightlyRate: string; siestaRate: string | null; active: boolean; roomCount: number }[];
  rooms: { id: string; number: string; floor: string | null; status: string; currentGuest: string | null; housekeepingStatus: string; categoryId: string; category: string; nightlyRateMin: string | null; nightlyRateMax: string | null }[];
  paymentMethods: { id: string; code: string; name: string; active: boolean }[];
};
type Permission = { code: string; group: string };
type Role = { id: string; code: string; name: string; optional: boolean; permissions: string[]; _count: { users: number } };
type HotelSettings = { name: string; currency: HotelCurrency; usdRate: { xafPerUnit: string; effectiveAt: string; source: string } | null; timezone: string; checkInTime: string | null; checkOutTime: string | null; allowCheckoutWithBalance: boolean };
type PlatformFeature = { key: string; name: string; description: string; enabled: boolean; updatedAt: string | null };
type AuditEvent = { id: string; actorId: string | null; action: string; result: string; targetId: string | null; details: unknown; createdAt: string };
type ReceptionCancellation = {
  id: string;
  createdAt: string;
  receptionist: string;
  previousStatus: string | null;
  reservation: { id: string; reference: string; client: { name: string }; room: { number: string } | null } | null;
};
type Overview = {
  counts: { users: number; activeUsers: number; suspendedUsers: number; platformAdmins: number; owners: number; hotelAdmins: number; managers: number; receptionists: number; otherStaff: number; newUsersThisWeek: number; activeSessions: number };
  restaurantModule: { activeManagers: number; activeBarStaff: number; activeMenuItems: number; lowStock: number; outOfStock: number; servedOrders24h: number };
  cashCommissions: { total: string; count: number; byReceptionist: { receptionist: string; amount: string }[] };
  security: { failedLogins24h: number; lockedAccounts: number; rateLimitAttempts: number; recentFailures: { id: string; action: string; result: string; createdAt: string; email: string | null }[]; sensitiveEvents: { id: string; actorId: string | null; actor: string; action: string; result: string; targetId: string | null; createdAt: string }[] };
  recentLogins: { id: string; name: string; email: string; platformAdmin: boolean; lastLoginAt: string | null; role: { name: string; code: string } | null }[];
  services: { backend: string; database: string; email: string; frontend: string; scheduledTasks: string; backups: string; storage: string; recentFailures: number };
  version: string; environment: string;
  availability: { monitoring: string; mfa: string; backupHistory: string; multiTenant: string };
};

const menu: { id: Section; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: 'overview', label: 'Vue globale', icon: LayoutDashboard, group: 'Plateforme' },
  { id: 'operations', label: 'Cockpit hôtel', icon: Activity, group: 'Plateforme' },
  { id: 'clients', label: 'Clients et séjours', icon: Users, group: 'Gestion' },
  { id: 'users', label: 'Utilisateurs', icon: Users, group: 'Gestion' },
  { id: 'security', label: 'Sécurité & sessions', icon: LockKeyhole, group: 'Sécurité' },
  { id: 'inventory', label: 'Inventaire hôtel', icon: BedDouble, group: 'Gestion' },
  { id: 'room-assignments', label: 'Attribution des chambres', icon: BedDouble, group: 'Gestion' },
  { id: 'admin-permissions', label: 'Permissions individuelles', icon: Shield, group: 'Accès' },
  { id: 'my-rooms', label: 'Mes chambres', icon: BedDouble, group: 'Gestion' },
  { id: 'roles', label: 'Rôles & permissions', icon: Shield, group: 'Accès' },
  { id: 'settings', label: 'Configuration', icon: Settings2, group: 'Plateforme' },
  { id: 'audit', label: 'Journal d’audit', icon: ClipboardList, group: 'Sécurité' },
  { id: 'reception-cancellations', label: 'Annulations Réception', icon: ClipboardList, group: 'Sécurité' },
  { id: 'shift-reports', label: 'Rapports de service', icon: FileText, group: 'Sécurité' },
  { id: 'diagnostics', label: 'Diagnostic', icon: Activity, group: 'Sécurité' }
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(data?.error ?? `Le serveur a refusé la requête (HTTP ${response.status}).`);
  if (!data) throw new Error('Le serveur a renvoyé une réponse invalide.');
  return data as T;
}

function formatDate(value: string | null) {
  if (!value) return 'Jamais';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const activityActionLabels: Record<string, string> = {
  RECEPTION_CASH_SESSION_OPEN: 'Ouverture de caisse',
  RECEPTION_CASH_SESSION_CLOSE: 'Clôture de caisse',
  RECEPTION_SHIFT_REPORT_CREATE: 'Création du rapport de service',
  RECEPTION_CLIENT_CREATE: 'Création d’un client',
  RECEPTION_CLIENT_UPDATE: 'Modification d’un client',
  RECEPTION_CLIENT_ID_DOCUMENT_SET: 'Ajout d’une pièce d’identité',
  RECEPTION_RESERVATION_CREATE: 'Création d’une réservation',
  RECEPTION_RESERVATION_UPDATE: 'Modification d’une réservation',
  RECEPTION_RESERVATION_CONFIRM: 'Confirmation d’une réservation',
  RECEPTION_RESERVATION_CANCEL: 'Annulation d’une réservation',
  RECEPTION_STAY_CHECK_IN: 'Arrivée d’un client',
  RECEPTION_STAY_CHECK_IN_CORRECTED: 'Correction de l’arrivée d’un client',
  RECEPTION_STAY_CHECK_OUT: 'Départ d’un client',
  RECEPTION_STAY_EXTEND: 'Prolongation d’un séjour',
  RECEPTION_STAY_OCCUPANTS_UPDATE: 'Modification des occupants',
  RECEPTION_ROOM_MOVE: 'Changement de chambre',
  RECEPTION_FOLIO_SERVICE_ADD: 'Ajout d’un service à la facture',
  RECEPTION_INVOICE_ISSUE: 'Émission d’une facture',
  RECEPTION_PAYMENT_COLLECT: 'Encaissement d’un paiement',
  RECEPTION_PAYMENT_DIRECT: 'Encaissement direct',
};

function activityActionLabel(action: string) {
  return activityActionLabels[action] ?? action.replace(/^RECEPTION_/, '').toLocaleLowerCase('fr-FR').replaceAll('_', ' ');
}

function activityResultLabel(result: string) {
  return ({ SUCCESS: 'Réussi', FAILURE: 'Échec', DENIED: 'Refusé' } as Record<string, string>)[result] ?? result;
}

export default function SuperAdminWorkspace({ name, audience = 'platform', showAgentCreation = false }: { name: string; audience?: Audience; showAgentCreation?: boolean }) {
  const router = useRouter();
  const isOwnerWorkspace = audience === 'owner';
  const isHotelAdminWorkspace = audience === 'hotel-admin';
  const { theme, toggleTheme } = useDashboardTheme();
  const [section, setSection] = useState<Section>(isHotelAdminWorkspace ? 'my-rooms' : 'overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [settings, setSettings] = useState<{ settings: { support_email: string; hotel: HotelSettings }; system?: { version: string; environment: string; emailProvider: string; database: string } } | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [receptionCancellations, setReceptionCancellations] = useState<ReceptionCancellation[]>([]);
  const [receptionCancellationsTotal, setReceptionCancellationsTotal] = useState(0);
  const [receptionCancellationsPage, setReceptionCancellationsPage] = useState(1);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', capacity: '2', nightlyRate: '', siestaRate: '' });
  const [roomForm, setRoomForm] = useState({ number: '', floor: '', categoryId: '' });
  const [methodForm, setMethodForm] = useState({ code: '', name: '' });
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', roleCode: 'RECEPTIONIST' });
  const [showNewUser, setShowNewUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '', roleId: '' });
  const [staffActivity, setStaffActivity] = useState<StaffActivity | null>(null);
  const [activityUser, setActivityUser] = useState<User | null>(null);
  const [activityPeriod, setActivityPeriod] = useState({ from: '', to: '' });
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [resetLink, setResetLink] = useState<{ url: string; email: string; expiresAt: string } | null>(null);
  const [search, setSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [hotelSettings, setHotelSettings] = useState<HotelSettings>({ name: 'BLISS HOTEL', currency: 'XAF', usdRate: null, timezone: 'Africa/Brazzaville', checkInTime: null, checkOutTime: '12:00', allowCheckoutWithBalance: false });
  const [auditFilters, setAuditFilters] = useState({ actorId: '', action: '', result: '', from: '', to: '' });

  const selectedRoleData = useMemo(() => roles.find((role) => role.id === selectedRole) ?? roles[0], [roles, selectedRole]);

  const loadOverview = useCallback(async () => setOverview(await api<Overview>('/api/super-admin/overview')), []);
  const [activeSessions, setActiveSessions] = useState<{ id: string; createdAt: string; expiresAt: string; user: { id: string; name: string; email: string; platformAdmin: boolean; lastLoginAt: string | null; role: { name: string; code: string } | null } }[]>([]);
  const loadSessions = useCallback(async () => setActiveSessions((await api<{ sessions: typeof activeSessions }>('/api/super-admin/sessions')).sessions), []);
  const loadUsers = useCallback(async (query = '') => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (userRoleFilter) params.set('role', userRoleFilter);
    if (userStatusFilter) params.set('status', userStatusFilter);
    const data = await api<{ users: User[] }>(`/api/super-admin/users?${params}`);
    setUsers(data.users);
  }, [userRoleFilter, userStatusFilter]);
  const loadRoles = useCallback(async () => {
    const data = await api<{ roles: Role[]; permissions: Permission[] }>('/api/super-admin/roles');
    setRoles(data.roles);
    setPermissions(data.permissions);
    setSelectedRole((current) => current || data.roles[0]?.id || '');
  }, []);
  const loadSettings = useCallback(async () => {
    const [data, featureData] = await Promise.all([
      api<{ settings: { support_email: string; hotel: HotelSettings }; system?: { version: string; environment: string; emailProvider: string; database: string } }>('/api/super-admin/settings'),
      api<{ features: PlatformFeature[] }>('/api/super-admin/features'),
    ]);
    setSettings(data);
    setSupportEmail(data.settings.support_email);
    setHotelSettings(data.settings.hotel);
    setFeatures(featureData.features);
  }, []);
  const loadAudit = useCallback(async (
    filters = { actorId: '', action: '', result: '', from: '', to: '' },
    page = 1,
  ) => {
    const params = new URLSearchParams([...Object.entries(filters).filter(([, value]) => value), ['page', String(page)]]);
    const data = await api<{ events: AuditEvent[]; total: number }>(`/api/super-admin/audit?${params}`);
    setAudit(data.events);
    setAuditTotal(data.total);
  }, []);
  const loadReceptionCancellations = useCallback(async (page = 1) => {
    const data = await api<{ events: ReceptionCancellation[]; total: number; page: number }>(`/api/super-admin/reception-deletions?page=${page}`);
    setReceptionCancellations(data.events);
    setReceptionCancellationsTotal(data.total);
    setReceptionCancellationsPage(data.page);
  }, []);
  const loadInventory = useCallback(async () => setInventory(await api<Inventory>('/api/super-admin/inventory')), []);

  const loadSection = useCallback(async (currentSection: Section) => {
    setError('');
    setBusy(true);
    try {
      if (currentSection === 'users') await Promise.all([loadUsers(search), loadRoles()]);
      if (currentSection === 'security' && !isOwnerWorkspace) await Promise.all([loadOverview(), loadSessions()]);
      if ((currentSection === 'overview' || currentSection === 'diagnostics') && !isOwnerWorkspace) await loadOverview();
      if (currentSection === 'inventory') await Promise.all([loadInventory(), loadSettings()]);
      if (currentSection === 'roles') await loadRoles();
      if (currentSection === 'settings') await loadSettings();
      if (currentSection === 'audit') await loadAudit();
      if (currentSection === 'reception-cancellations') await loadReceptionCancellations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger cette section.');
    } finally {
      setBusy(false);
    }
  }, [loadOverview, loadUsers, loadRoles, loadSettings, loadAudit, loadReceptionCancellations, loadInventory, loadSessions, search, isOwnerWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSection(isHotelAdminWorkspace ? 'my-rooms' : 'overview'); }, 0);
    return () => window.clearTimeout(timer);
  }, [isHotelAdminWorkspace, isOwnerWorkspace, loadSection]);

  async function runAction(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (success) setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’opération a échoué.');
    } finally {
      setBusy(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(`Créer le compte individuel de ${newUserForm.name} ?`)) return;
    await runAction(async () => {
      await api('/api/super-admin/users', { method: 'POST', body: JSON.stringify(newUserForm) });
      setShowNewUser(false);
      setNewUserForm({ name: '', email: '', password: '', roleCode: 'RECEPTIONIST' });
      await loadUsers(search);
    }, 'Compte créé et action auditée.');
  }

  function beginUserEdit(user: User) {
    setEditUserForm({ name: user.name, email: user.email, roleId: roles.find((role) => role.code === user.role?.code)?.id ?? '' });
    setEditingUser(user);
  }

  async function saveUserEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    await runAction(async () => {
      await api('/api/super-admin/users', { method: 'PATCH', body: JSON.stringify({ userId: editingUser.id, name: editUserForm.name, email: editUserForm.email, roleId: editUserForm.roleId || null }) });
      setEditingUser(null);
      await loadUsers(search);
    }, 'Compte mis à jour ; sessions révoquées si le rôle a changé.');
  }

  async function createInventory(entity: 'category' | 'room' | 'method', payload: Record<string, unknown>) {
    await runAction(async () => {
      await api('/api/super-admin/inventory', { method: 'POST', body: JSON.stringify({ entity, ...payload }) });
      await loadInventory();
    }, 'Élément d’inventaire créé.');
  }

  async function patchInventory(payload: Record<string, unknown>, message = 'Inventaire mis à jour.') {
    await runAction(async () => {
      await api('/api/super-admin/inventory', { method: 'PATCH', body: JSON.stringify(payload) });
      await loadInventory();
    }, message);
  }

  async function changeUser(user: User) {
    const verb = user.active ? 'suspendre' : 'réactiver';
    if (!window.confirm(`Confirmer : ${verb} le compte de ${user.name} ?`)) return;
    await runAction(async () => {
      await api('/api/super-admin/users', { method: 'PATCH', body: JSON.stringify({ userId: user.id, active: !user.active }) });
      await loadUsers(search);
    }, `Compte ${user.active ? 'suspendu' : 'réactivé'} et action auditée.`);
  }

  async function viewStaffActivity(user: User, range = activityPeriod) {
    setActivityUser(user);
    await runAction(async () => {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      setStaffActivity(await api<StaffActivity>(`/api/super-admin/users/${user.id}/activity?${params}`));
    });
  }

  async function createResetLink(user: User) {
    if (!window.confirm(`Créer un lien de réinitialisation à usage unique pour ${user.email} ?`)) return;
    await runAction(async () => {
      const data = await api<{ resetPath: string; email: string; expiresAt: string }>(`/api/super-admin/users/${user.id}/reset`, { method: 'POST' });
      setResetLink({ url: `${window.location.origin}${data.resetPath}`, email: data.email, expiresAt: data.expiresAt });
    }, 'Lien à usage unique généré et action inscrite au journal.');
  }

  async function savePermissions() {
    if (!selectedRoleData || selectedRoleData.code === 'SUPER_ADMIN') return;
    if (!window.confirm(`Confirmer la modification des permissions du rôle « ${selectedRoleData.name} » ?`)) return;
    await runAction(async () => {
      await api(`/api/super-admin/roles/${selectedRoleData.id}`, {
        method: 'PATCH',
        headers: { 'X-Platform-Admin-Action': 'true' },
        body: JSON.stringify({ permissionCodes: selectedRoleData.permissions }),
      });
      await loadRoles();
    }, 'Permissions enregistrées et journalisées.');
  }

  async function changeFeature(feature: PlatformFeature) {
    const enabled = !feature.enabled;
    const action = enabled ? 'activer' : 'désactiver';
    if (!window.confirm(`Confirmer : ${action} « ${feature.name} » dans BLISS HOTEL ?`)) return;
    await runAction(async () => {
      await api('/api/super-admin/features', {
        method: 'PATCH',
        headers: { 'X-Platform-Admin-Action': 'true' },
        body: JSON.stringify({ key: feature.key, enabled }),
      });
      await loadSettings();
    }, `Fonctionnalité ${enabled ? 'activée' : 'désactivée'} et action auditée.`);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await api('/api/super-admin/settings', { method: 'PATCH', headers: { 'X-Platform-Admin-Action': 'true' }, body: JSON.stringify({
        supportEmail,
        currency: hotelSettings.currency,
        timezone: hotelSettings.timezone,
        checkInTime: hotelSettings.checkInTime,
        checkOutTime: hotelSettings.checkOutTime,
        allowCheckoutWithBalance: hotelSettings.allowCheckoutWithBalance,
      }) });
      await loadSettings();
    }, 'Configuration de BLISS HOTEL mise à jour.');
  }

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('La déconnexion n’a pas abouti. Réessayez.');
      router.push('/connexion');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La déconnexion a échoué.');
    }
  }

  function navigate(next: Section) {
    setSection(next);
    setMobileMenu(false);
    setNotice('');
    setError('');
    void loadSection(next);
  }

  function openUserProfile(user: User) {
    void runAction(async () => {
      const result = await api<{ redirectTo: string }>('/api/god-mode/assume', { method: 'POST', body: JSON.stringify({ userId: user.id }) });
      window.location.assign(result.redirectTo);
    });
  }

  const visibleMenu = menu.filter((item) => isHotelAdminWorkspace
    ? ['my-rooms', 'shift-reports'].includes(item.id)
    : item.id !== 'my-rooms' && (item.id !== 'clients' || isOwnerWorkspace || audience === 'platform') && (!isOwnerWorkspace || !['operations', 'diagnostics', 'security'].includes(item.id)));
  const title = visibleMenu.find((item) => item.id === section)?.label ?? (isOwnerWorkspace || isHotelAdminWorkspace ? 'Administration hôtel' : 'Administration plateforme');

  return (
    <div className="sa-shell" data-theme={theme}>
      {mobileMenu && <button className="sa-backdrop" onClick={() => setMobileMenu(false)} aria-label="Fermer la navigation" />}
      <aside className={`sa-sidebar${mobileMenu ? ' is-open' : ''}`}>
        <div className="sa-brand">
          <span className="sa-brand-mark"><Building2 size={19} /></span>
          <span><strong>BLISS HÔTEL</strong><small>{isOwnerWorkspace ? 'Espace propriétaire' : isHotelAdminWorkspace ? 'Administration hôtel' : 'SUPER ADMIN · Plateforme'}</small></span>
          <button className="sa-icon-button sa-mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fermer"><X size={18} /></button>
        </div>
        <nav className="sa-nav" aria-label="Administration de la plateforme">
          {(isHotelAdminWorkspace ? ['Gestion', 'Sécurité'] as const : isOwnerWorkspace ? ['Hôtel', 'Gestion', 'Accès', 'Sécurité'] as const : ['Plateforme', 'Gestion', 'Accès', 'Sécurité'] as const).map((group) => (
            <div className="sa-nav-group" key={group}>
              <p>{group}</p>
              {visibleMenu.filter((item) => item.group === (isOwnerWorkspace && group === 'Hôtel' ? 'Plateforme' : group)).map(({ id, label, icon: Icon }) => (
                <button key={id} className={`sa-nav-item${section === id ? ' is-active' : ''}`} onClick={() => navigate(id)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{isOwnerWorkspace && id === 'operations' ? 'Vue propriétaire' : label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sa-sidebar-foot">
          <div className="sa-profile"><span className="sa-avatar">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}</strong><small>{isOwnerWorkspace ? 'Propriétaire' : isHotelAdminWorkspace ? 'Administrateur Hôtel' : 'Super Administrateur'}</small></span></div>
          <ProfileLauncher name={name} canEditName={!isHotelAdminWorkspace} className="sa-profile-launcher" />
          <button className="sa-logout" onClick={logout}><LogOut size={16} />Déconnexion</button>
        </div>
      </aside>

      <main className="sa-main">
        <header className="sa-topbar">
          <button className="sa-icon-button sa-menu-toggle" onClick={() => setMobileMenu(true)} aria-label="Ouvrir la navigation"><Menu size={19} /></button>
          <div className="sa-breadcrumb"><span>BLISS HÔTEL</span><i>/</i><strong>{title}</strong></div>
          <div className="sa-top-actions"><span className="sa-role-chip"><Shield size={14} />{isOwnerWorkspace ? 'Propriétaire' : isHotelAdminWorkspace ? 'Administration hôtel' : 'Plateforme'}</span><DashboardThemeToggle theme={theme} onToggle={toggleTheme} />{!isOwnerWorkspace && <button className="sa-button subtle sa-topbar-logout" onClick={() => void logout()} aria-label="Déconnexion" title="Déconnexion"><LogOut size={15} /><span>Déconnexion</span></button>}{!isOwnerWorkspace && !isHotelAdminWorkspace && <button className="sa-icon-button" onClick={() => navigate('diagnostics')} aria-label="État des services"><CircleHelp size={18} /></button>}</div>
        </header>

        <section className="sa-content">
          <div className="sa-page-heading">
            <div><p className="sa-eyebrow">{isOwnerWorkspace || isHotelAdminWorkspace ? 'Gestion de l’hôtel' : 'SUPER ADMIN · Contrôle global du logiciel'}</p><h1>{title}</h1><p className="sa-subtitle">{isHotelAdminWorkspace ? section === 'my-rooms' ? 'Suivi des chambres qui vous sont confiées dans BLISS HOTEL.' : 'Consultation des rapports de fin de service de la réception.' : isOwnerWorkspace && section === 'overview' ? 'Vue d’ensemble de l’activité et des indicateurs de BLISS HOTEL.' : section === 'operations' ? isOwnerWorkspace ? 'Cockpit stratégique du même inventaire et des opérations de BLISS HOTEL.' : 'Supervision globale des opérations, de l’occupation et des alertes de BLISS HOTEL.' : isOwnerWorkspace ? 'Gestion des utilisateurs, de l’inventaire, des affectations et des accès de BLISS HOTEL.' : 'Contrôle technique et configuration de BLISS HÔTEL.'}</p></div>
            {!isOwnerWorkspace && !isHotelAdminWorkspace && <span className="sa-environment"><i />{overview?.environment ?? '…'}</span>}
          </div>
          {error && <div className="sa-alert is-error" role="alert"><ShieldAlert size={17} />{error}</div>}
          {notice && <div className="sa-alert is-success" role="status">{notice}</div>}
          {busy && <div className="sa-loading" role="status" aria-live="polite"><span className="sa-spinner" aria-hidden="true" />Chargement en cours…</div>}
          {showAgentCreation && <AgentAccountForm />}

          {section === 'overview' && (isOwnerWorkspace
            ? <OwnerOverview name={name} theme={theme} />
            : <><OverviewSection data={overview} navigate={navigate} isOwnerWorkspace={isOwnerWorkspace} />{audience === 'platform' && <OwnerOverview name={name} theme={theme} />}</>)}
          {section === 'operations' && (isOwnerWorkspace || audience === 'platform' ? <OwnerOverview name={name} theme={theme} /> : <OperationsCenter name={name} roleCode="SUPER_ADMIN" />)}
          {section === 'clients' && (isOwnerWorkspace || audience === 'platform') && <OwnerClientRecords />}
          {section === 'users' && <UsersSection data={users} roles={roles} search={search} setSearch={setSearch} roleFilter={userRoleFilter} setRoleFilter={setUserRoleFilter} statusFilter={userStatusFilter} setStatusFilter={setUserStatusFilter} submit={(event) => { event.preventDefault(); void runAction(() => loadUsers(search)); }} change={changeUser} createReset={createResetLink} beginCreate={() => setShowNewUser(true)} beginEdit={(user) => beginUserEdit(user)} viewActivity={(user) => void viewStaffActivity(user)} viewProfile={openUserProfile} isOwnerWorkspace={isOwnerWorkspace} />}
          {section === 'inventory' && <InventorySection
            data={inventory}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            roomForm={roomForm}
            setRoomForm={setRoomForm}
            methodForm={methodForm}
            setMethodForm={setMethodForm}
            create={(entity, payload) => void createInventory(entity, payload)}
            patch={(payload, message) => void patchInventory(payload, message)}
            currency={settings?.settings.hotel.currency ?? 'XAF'}
          />}
          {section === 'room-assignments' && !isHotelAdminWorkspace && <RoomAssignments />}
          {section === 'admin-permissions' && !isHotelAdminWorkspace && <HotelAdminPermissions />}
          {section === 'my-rooms' && isHotelAdminWorkspace && <MyRooms />}
          {section === 'roles' && <RolesSection roles={roles} permissions={permissions} selected={selectedRoleData} select={setSelectedRole} toggle={(code) => setRoles((items) => items.map((role) => role.id === selectedRoleData?.id ? { ...role, permissions: role.permissions.includes(code) ? role.permissions.filter((item) => item !== code) : [...role.permissions, code] } : role))} save={savePermissions} />}
          {section === 'settings' && <SettingsSection data={settings} supportEmail={supportEmail} setSupportEmail={setSupportEmail} hotel={hotelSettings} setHotel={setHotelSettings} save={saveSettings} features={features} changeFeature={changeFeature} />}
          {section === 'audit' && <AuditSection events={audit} total={auditTotal} page={auditPage} setPage={setAuditPage} filters={auditFilters} setFilters={setAuditFilters} apply={() => { setAuditPage(1); void runAction(() => loadAudit(auditFilters, 1)); }} changePage={(page) => { setAuditPage(page); void runAction(() => loadAudit(auditFilters, page)); }} />}
          {section === 'shift-reports' && <ShiftReportsWorkspace />}
          {section === 'reception-cancellations' && <ReceptionCancellationsSection
            events={receptionCancellations}
            total={receptionCancellationsTotal}
            page={receptionCancellationsPage}
            changePage={(page) => void runAction(() => loadReceptionCancellations(page))}
          />}
          {section === 'diagnostics' && !isOwnerWorkspace && <DiagnosticsSection data={overview} />}
          {section === 'security' && !isOwnerWorkspace && <SecuritySection overview={overview} sessions={activeSessions} revoke={async (user) => {
            if (!window.confirm(`Révoquer toutes les sessions de ${user.name} ?`)) return;
            await runAction(async () => {
              const result = await api<{ sessionsRevoked: number }>('/api/super-admin/sessions', { method: 'DELETE', body: JSON.stringify({ userId: user.id }) });
              await Promise.all([loadSessions(), loadOverview()]);
              setNotice(`${result.sessionsRevoked} session(s) révoquée(s), opération journalisée.`);
            });
          }} />}
          {resetLink && <ResetLinkDialog data={resetLink} close={() => setResetLink(null)} />}
          {showNewUser && <NewUserDialog form={newUserForm} setForm={setNewUserForm} roles={roles.filter((role) => role.code !== 'SUPER_ADMIN' && (!isOwnerWorkspace || role.code !== 'OWNER'))} close={() => setShowNewUser(false)} submit={createUser} />}
          {editingUser && <EditUserDialog user={editingUser} form={editUserForm} setForm={setEditUserForm} roles={roles.filter((role) => role.code !== 'SUPER_ADMIN' && (!isOwnerWorkspace || role.code !== 'OWNER'))} close={() => setEditingUser(null)} submit={saveUserEdit} />}
          {staffActivity && activityUser && <StaffActivityDialog
            data={staffActivity}
            range={activityPeriod}
            setRange={setActivityPeriod}
            apply={() => void viewStaffActivity(activityUser, activityPeriod)}
            close={() => { setStaffActivity(null); setActivityUser(null); }}
          />}
        </section>
      </main>
    </div>
  );
}

function OverviewSection({ data, navigate, isOwnerWorkspace }: { data: Overview | null; navigate: (section: Section) => void; isOwnerWorkspace: boolean }) {
  if (!data) return <EmptyState text="Les indicateurs plateforme sont indisponibles pour le moment." />;
  const inactiveUsers = data.counts.suspendedUsers;
  const platformAdminCount = data.counts.platformAdmins;
  const cards = [
    { label: 'Comptes utilisateurs', value: data.counts.users, icon: Users, link: 'users' as const },
    { label: 'Comptes Super Administrateur', value: platformAdminCount, icon: Shield, link: 'users' as const },
    { label: 'Comptes actifs', value: data.counts.activeUsers, icon: Activity, link: 'users' as const },
    { label: 'Sessions actives', value: data.counts.activeSessions, icon: LockKeyhole, link: 'security' as const },
  ];
  return <>
    <div className="sa-metrics">{cards.map(({ label, value, icon: Icon, link }) => <button className="sa-metric" key={label} onClick={() => navigate(link)}><span className="sa-metric-icon"><Icon size={18} /></span><span className="sa-metric-label">{label}</span><strong>{value.toLocaleString('fr-FR')}</strong><small>Voir les détails <ChevronDown size={13} /></small></button>)}</div>
    {!isOwnerWorkspace && <div className="sa-panel sa-table-panel"><div className="sa-panel-heading"><div><p>COMMISSIONS DE RÉCEPTION · 30 DERNIERS JOURS</p><h2>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(data.cashCommissions.total))} · {data.cashCommissions.count} retrait(s)</h2></div><CreditCard size={18} /></div>{data.cashCommissions.byReceptionist.length ? <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Réceptionniste</th><th>Total retiré de caisse</th></tr></thead><tbody>{data.cashCommissions.byReceptionist.map((entry) => <tr key={entry.receptionist}><td>{entry.receptionist}</td><td><strong>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(entry.amount))}</strong></td></tr>)}</tbody></table></div> : <EmptyState text="Aucun retrait de commission sur les 30 derniers jours." />}<p className="sa-help">Chaque commission est déduite une seule fois par réservation et n’augmente pas la facture du client.</p></div>}
    {!isOwnerWorkspace && <div className="sa-overview-grid"><article className="sa-panel"><div className="sa-panel-heading"><div><p>COMPTES PAR RÔLE</p><h2>Accès utilisateurs</h2></div><Users size={18} /></div>{[['Propriétaires', data.counts.owners], ['Administrateurs hôtel', data.counts.hotelAdmins], ['Gérants', data.counts.managers], ['Réceptionnistes', data.counts.receptionists], ['Autres employés', data.counts.otherStaff]].map(([label, value]) => <ServiceLine key={label} label={label as string} status={String(value)} />)}<p className="sa-cockpit-note">{data.counts.newUsersThisWeek} nouveau(x) compte(s) cette semaine · {inactiveUsers} compte(s) suspendu(s)</p></article><article className="sa-panel"><div className="sa-panel-heading"><div><p>SANTÉ & SÉCURITÉ</p><h2>État du logiciel</h2></div><Activity size={18} /></div><ServiceLine label="Backend API" status="Opérationnel · données servies" /><ServiceLine label="Interface frontend" status="Build disponible · disponibilité externe non mesurée" /><ServiceLine label="Base MariaDB" status={data.services.database === 'available' ? 'Connectée' : 'Indisponible'} warning={data.services.database !== 'available'} /><ServiceLine label="Échecs d’authentification / 24 h" status={String(data.security.failedLogins24h)} warning={data.security.failedLogins24h > 0} /><ServiceLine label="Sauvegardes" status="Non configurées" warning /><ServiceLine label="Tâches planifiées / MFA" status="Non configurées" /></article></div>}
    {!isOwnerWorkspace && <div className="sa-panel sa-table-panel"><div className="sa-panel-heading"><div><p>CONNEXIONS</p><h2>Dernières connexions</h2></div><button className="sa-button" onClick={() => navigate('security')}>Sécurité & sessions</button></div>{data.recentLogins.length ? <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Dernière connexion</th><th>Statut</th></tr></thead><tbody>{data.recentLogins.map((user) => <tr key={user.id}><td><b>{user.name}</b><small>{user.email}</small></td><td>{user.role?.name ?? 'Sans rôle'}</td><td>{formatDate(user.lastLoginAt)}</td><td><Status active={true} label="Compte actif" /></td></tr>)}</tbody></table></div> : <EmptyState text="Aucune connexion enregistrée." />}</div>}
    {!isOwnerWorkspace && <div className="sa-panel"><div className="sa-panel-heading"><div><p>OPÉRATIONS SENSIBLES · DERNIÈRES 24 H</p><h2>Activité administrative</h2></div><ClipboardList size={18} /></div>{data.security.sensitiveEvents.length ? data.security.sensitiveEvents.map((event) => <ServiceLine key={event.id} label={`${event.actor} · ${event.action.replaceAll('_', ' ')}`} status={`${formatDate(event.createdAt)} · ${event.result}${event.targetId ? ` · ${event.targetId}` : ''}`} />) : <EmptyState text="Aucune opération administrative sensible récente." />}</div>}
    <div className="sa-overview-grid">
      <article className="sa-panel"><div className="sa-panel-heading"><div><p>ACCÈS RAPIDES</p><h2>Administration plateforme</h2></div><Shield size={18} /></div><div className="sa-shortcuts"><button onClick={() => navigate('users')}><Users size={17} /><span>Rechercher un utilisateur</span></button><button onClick={() => navigate('roles')}><Shield size={17} /><span>Gérer les rôles et permissions</span></button><button onClick={() => navigate('security')}><LockKeyhole size={17} /><span>Gérer les sessions et alertes sécurité</span></button><button onClick={() => navigate('audit')}><ClipboardList size={17} /><span>Consulter le journal d’audit</span></button><button onClick={() => navigate('diagnostics')}><Activity size={17} /><span>Consulter les diagnostics</span></button></div></article>
    </div>
  </>;
}


const permissionGroupLabels: Record<string, string> = {
  FOUNDATION: 'Accès de base', RESERVATIONS: 'Réservations et clients', FRONT_DESK: 'Réception et séjours',
  CASHIER_OPERATIONS: 'Caisse et paiements', SHIFT_REPORTS: 'Rapports de service', ACCOUNTING: 'Comptabilité et rapports',
  SENSITIVE: 'Opérations sensibles', ROOMS: 'Chambres', HOUSEKEEPING: 'Entretien et ménage',
  RESTAURANT: 'Restaurant', MAINTENANCE: 'Maintenance', PLATFORM: 'Plateforme',
};
const permissionLabels: Record<string, string> = {
  'dashboard.view': 'Consulter le tableau de bord', 'users.view': 'Consulter les utilisateurs', 'users.manage': 'Gérer les utilisateurs',
  'roles.view': 'Consulter les rôles', 'roles.assign': 'Attribuer des rôles', 'permissions.manage': 'Gérer les permissions', 'audit.view': 'Consulter le journal d’audit',
  'reservations.view': 'Consulter les réservations', 'reservations.create': 'Créer des réservations', 'reservations.update': 'Modifier les réservations', 'reservations.cancel': 'Annuler les réservations', 'reservations.confirm': 'Confirmer les réservations',
  'clients.view': 'Consulter les clients', 'clients.create': 'Créer des fiches client', 'clients.update': 'Modifier les fiches client',
  'stays.view': 'Consulter les séjours', 'stays.checkin': 'Enregistrer les arrivées', 'stays.checkout': 'Enregistrer les départs', 'stays.extend': 'Prolonger les séjours',
  'folios.view': 'Consulter les folios', 'folios.manage': 'Gérer les folios', 'invoices.view': 'Consulter les factures', 'invoices.create': 'Créer des factures',
  'payments.view': 'Consulter les paiements', 'payments.collect': 'Enregistrer les encaissements', 'payments.refund': 'Rembourser les paiements', 'payments.reverse': 'Annuler les paiements',
  'cash_sessions.open_own': 'Ouvrir sa session de caisse', 'cash_sessions.view_own': 'Consulter sa session de caisse', 'cash_sessions.close_own': 'Clôturer sa session de caisse', 'cash_sessions.view_all': 'Consulter toutes les sessions de caisse', 'cash_sessions.reopen': 'Rouvrir une session de caisse',
  'shift_reports.view': 'Consulter les rapports de service', 'accounting.view': 'Consulter la comptabilité', 'expenses.manage': 'Gérer les dépenses', 'reconciliation.manage': 'Gérer les rapprochements', 'reports.financial.view': 'Consulter les rapports financiers', 'reports.export': 'Exporter les rapports',
  'invoices.correct': 'Corriger les factures', 'approvals.view': 'Consulter les validations', 'approvals.decide': 'Décider des validations', 'stays.checkin.correct': 'Corriger les arrivées',
  'rooms.view': 'Consulter les chambres', 'rooms.manage': 'Gérer les chambres', 'rooms.block': 'Bloquer les chambres', 'rooms.release': 'Remettre les chambres en service', 'rooms.rates.view': 'Consulter les tarifs des chambres',
  'housekeeping.tasks.view': 'Consulter les tâches de ménage', 'housekeeping.tasks.assign': 'Attribuer les tâches de ménage', 'housekeeping.tasks.execute': 'Effectuer les tâches de ménage', 'housekeeping.rooms.inspect': 'Inspecter les chambres', 'housekeeping.agents.manage': 'Gérer les agents d’entretien',
  'restaurant.menu.manage': 'Gérer la carte, les produits et les prix', 'restaurant.orders.manage': 'Gérer les commandes du restaurant', 'restaurant.folio.transfer': 'Transférer les commandes vers un folio', 'restaurant.stock.view': 'Voir le stock du restaurant', 'restaurant.stock.count': 'Faire l’inventaire physique du stock', 'restaurant.stock.manage': 'Gérer les mouvements et les réglages de stock', 'restaurant.reports.view': 'Consulter les rapports du restaurant',
  'maintenance.view': 'Consulter la maintenance', 'maintenance.incidents.report': 'Signaler des incidents', 'maintenance.tickets.manage': 'Gérer les interventions', 'maintenance.rooms.block': 'Mettre les chambres en maintenance', 'maintenance.rooms.release': 'Libérer les chambres en maintenance', 'platform.manage': 'Gérer la plateforme',
};

function RolesSection({ roles, permissions, selected, select, toggle, save }: { roles: Role[]; permissions: Permission[]; selected?: Role; select: (id: string) => void; toggle: (code: string) => void; save: () => void }) {
  const grouped = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => { (groups[permission.group] ??= []).push(permission); return groups; }, {}), [permissions]);
  return <>
    <div className="sa-role-layout"><aside className="sa-panel sa-role-list"><p>Rôles BLISS HÔTEL</p>{roles.map((role) => <button className={selected?.id === role.id ? 'is-selected' : ''} key={role.id} onClick={() => select(role.id)}><span>{role.name}{role.optional && <small>Facultatif</small>}</span><b>{role._count.users}</b></button>)}</aside><section className="sa-panel sa-permission-panel"><div className="sa-panel-heading"><div><p>Contrôle d’accès</p><h2>{selected?.name ?? 'Sélectionner un rôle'}</h2></div>{(selected?.code === 'SUPER_ADMIN' || selected?.code === 'HOTEL_ADMIN') && <span className="sa-tag">Protégé</span>}</div>{selected?.code === 'SUPER_ADMIN' ? <div className="sa-info-box">Le compte Super Administrateur conserve le contrôle technique et n’est pas un rôle hôtelier.</div> : selected?.code === 'HOTEL_ADMIN' ? <div className="sa-info-box">Ce rôle conserve uniquement l’accès de base au tableau de bord et aux chambres. Configurez chaque compte dans « Permissions individuelles ».</div> : selected ? <>{Object.entries(grouped).map(([group, items]) => <div className="sa-permission-group" key={group}><h3>{permissionGroupLabels[group] ?? group.replaceAll('_', ' ')}</h3>{items.map((permission) => <label key={permission.code}><input type="checkbox" checked={selected.permissions.includes(permission.code)} onChange={() => toggle(permission.code)} /><span><strong>{permissionLabels[permission.code] ?? permission.code}</strong></span></label>)}</div>)}<button className="sa-button primary" onClick={save}>Enregistrer les permissions</button></> : <EmptyState text="Aucun rôle disponible. Lancez le seed RBAC." />}</section></div>
  </>;
}

function SettingsSection({ data, supportEmail, setSupportEmail, hotel, setHotel, save, features, changeFeature }: { data: { settings: { support_email: string; hotel: HotelSettings }; system?: { version: string; environment: string; emailProvider: string; database: string } } | null; supportEmail: string; setSupportEmail: (value: string) => void; hotel: HotelSettings; setHotel: (value: HotelSettings) => void; save: (event: FormEvent<HTMLFormElement>) => void; features: PlatformFeature[]; changeFeature: (feature: PlatformFeature) => void }) {
  return <div className="sa-settings-grid">
    <form className="sa-panel sa-settings-form" onSubmit={save}>
      <div className="sa-panel-heading"><div><p>Configuration unique</p><h2>BLISS HOTEL</h2></div><Building2 size={18} /></div>
      <label><span>Nom de l’établissement</span><input value={hotel.name} readOnly /></label>
      <label><span>Devise de saisie par défaut</span><select value={hotel.currency} onChange={(event) => { const currency = hotelCurrencies.find((item) => item === event.target.value); if (currency) setHotel({ ...hotel, currency }); }}>{hotelCurrencies.map((currency) => <option key={currency} value={currency}>{hotelCurrencyLabels[currency]}</option>)}</select><small>Les montants saisis dans cette devise sont convertis en XAF. Les montants comptables existants restent en XAF.</small></label>
      {hotel.currency === 'EUR' && <p className="sa-help">Taux fixe : 1 EUR = 655,957 XAF.</p>}
      {hotel.currency === 'USD' && <p className="sa-help">{hotel.usdRate ? `Dernier taux USD/XAF : ${hotel.usdRate.xafPerUnit} · mis à jour le ${formatDate(hotel.usdRate.effectiveAt)} (${hotel.usdRate.source}).` : 'Le taux USD/XAF sera téléchargé automatiquement à la première saisie. Les saisies sont bloquées si aucun taux récent n’est disponible.'}</p>}
      <label><span>Fuseau horaire</span><input value={hotel.timezone} onChange={(event) => setHotel({ ...hotel, timezone: event.target.value })} maxLength={64} required /></label>
      <label><span>Heure indicative d’arrivée</span><input type="time" value={hotel.checkInTime ?? ''} onChange={(event) => setHotel({ ...hotel, checkInTime: event.target.value || null })} /><small>Le client peut arriver à l’heure convenue avec la réception.</small></label>
      <label><span>Heure conventionnelle de départ</span><input type="time" value={hotel.checkOutTime ?? ''} onChange={(event) => setHotel({ ...hotel, checkOutTime: event.target.value || null })} /></label>
      <label><span>E-mail de support affiché lors de la récupération d’accès</span><input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} placeholder="support@blisshotel.fr" /></label>
      <label className="sa-settings-checkbox"><input type="checkbox" checked={hotel.allowCheckoutWithBalance} onChange={(event) => setHotel({ ...hotel, allowCheckoutWithBalance: event.target.checked })} /><span>Autoriser le check-out avec un solde restant</span></label>
      <button className="sa-button primary">Enregistrer</button>
      <p className="sa-help">Le nom BLISS HOTEL est fixe. La récupération automatique n’est pas activée sans fournisseur de messagerie.</p>
    </form>
    <section className="sa-panel sa-feature-panel"><div className="sa-panel-heading"><div><p>Modules de BLISS HÔTEL</p><h2>Fonctionnalités activables</h2></div><Settings2 size={18} /></div><p className="sa-feature-note">Un module désactivé bloque immédiatement les permissions de son groupe pour BLISS HÔTEL. Les permissions attribuées sont conservées et redeviennent actives à la réactivation.</p><div className="sa-feature-list">{features.map((feature) => <label className="sa-feature-toggle" key={feature.key}><span><strong>{feature.name}</strong><small>{feature.description}</small></span><input type="checkbox" checked={feature.enabled} onChange={() => changeFeature(feature)} aria-label={`${feature.enabled ? 'Désactiver' : 'Activer'} ${feature.name} pour BLISS HÔTEL`} /></label>)}</div></section>
    <div className="sa-panel"><div className="sa-panel-heading"><div><p>Informations non sensibles</p><h2>Configuration système</h2></div><Settings2 size={18} /></div>{data?.system ? <><ServiceLine label="Version" status={data.system.version} /><ServiceLine label="Environnement" status={data.system.environment} /><ServiceLine label="Fournisseur e-mail" status={data.system.emailProvider} /><ServiceLine label="Base de données" status={data.system.database} /></> : <EmptyState text="Configuration indisponible." />}</div>
  </div>;
}

function AuditSection({ events, total, page, setPage, filters, setFilters, apply, changePage }: { events: AuditEvent[]; total: number; page: number; setPage: (page: number) => void; filters: { actorId: string; action: string; result: string; from: string; to: string }; setFilters: (value: { actorId: string; action: string; result: string; from: string; to: string }) => void; apply: () => void; changePage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 50));
  return <>
    <form className="sa-audit-filters" onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <label><span>Utilisateur ID</span><input value={filters.actorId} onChange={(event) => setFilters({ ...filters, actorId: event.target.value })} /></label>
      <label><span>Action</span><input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="Filtrer par type" /></label>
      <label><span>Résultat</span><select value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })}><option value="">Tous</option><option value="SUCCESS">Succès</option><option value="FAILURE">Échec</option><option value="DENIED">Refusé</option></select></label>
      <label><span>Du</span><input type="datetime-local" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label><span>Au</span><input type="datetime-local" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <button className="sa-button primary">Filtrer</button>
    </form>
    <div className="sa-panel sa-table-panel">
      <div className="sa-panel-heading"><div><p>Traçabilité</p><h2>Événements <small>{total}</small></h2></div></div>
      {events.length ? <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Date et heure</th><th>Action</th><th>Résultat</th><th>Acteur / cible</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td><strong>{event.action}</strong></td><td><Status active={event.result === 'SUCCESS'} label={event.result} /></td><td>{event.actorId ?? 'Système'}<small>{event.targetId ?? ''}</small><details><summary>Détails</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details></td></tr>)}</tbody></table></div> : <EmptyState text="Aucun événement pour ces filtres." />}
      <div className="sa-pagination"><span>Page {page} / {pages}</span><div><button className="sa-button" disabled={page <= 1} onClick={() => { setPage(page - 1); changePage(page - 1); }}>Précédent</button><button className="sa-button" disabled={page >= pages} onClick={() => { setPage(page + 1); changePage(page + 1); }}>Suivant</button></div></div>
    </div>
  </>;
}

function ReceptionCancellationsSection({ events, total, page, changePage }: {
  events: ReceptionCancellation[];
  total: number;
  page: number;
  changePage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 50));
  const statusLabels: Record<string, string> = {
    PENDING: 'En attente',
    CONFIRMED: 'Confirmée',
    CHECKED_IN: 'En séjour',
  };
  return <div className="sa-panel sa-table-panel">
    <div className="sa-panel-heading"><div><p>Traçabilité · lecture seule</p><h2>Annulations de réservations <small>{total}</small></h2></div><ClipboardList size={18} /></div>
    <p className="sa-subtitle">Les réservations annulées par un compte Réceptionniste restent conservées dans le système. Cet historique ne permet ni suppression définitive ni restauration.</p>
    {events.length ? <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Date et heure</th><th>Réceptionniste</th><th>Réservation / client</th><th>Chambre</th><th>Statut avant annulation</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td>{event.receptionist}</td><td>{event.reservation?.reference ?? 'Réservation non disponible'}<small>{event.reservation?.client.name ?? ''}</small></td><td>{event.reservation?.room?.number ?? '—'}</td><td>{event.previousStatus ? statusLabels[event.previousStatus] ?? event.previousStatus : '—'}</td></tr>)}</tbody></table></div> : <EmptyState text="Aucune annulation de réservation par un compte Réceptionniste n’a été journalisée." />}
    <div className="sa-pagination"><span>Page {page} / {pages}</span><div><button className="sa-button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Précédent</button><button className="sa-button" disabled={page >= pages} onClick={() => changePage(page + 1)}>Suivant</button></div></div>
  </div>;
}

function SecuritySection({ overview, sessions, revoke }: {
  overview: Overview | null;
  sessions: { id: string; createdAt: string; expiresAt: string; user: { id: string; name: string; email: string; platformAdmin: boolean; lastLoginAt: string | null; role: { name: string; code: string } | null } }[];
  revoke: (user: { id: string; name: string }) => void;
}) {
  return <div className="sa-diagnostics-grid">
    <article className="sa-panel"><div className="sa-panel-heading"><div><p>AUTHENTIFICATION · 24 H</p><h2>Échecs et verrouillages</h2></div><LockKeyhole size={18} /></div><ServiceLine label="Tentatives échouées enregistrées" status={String(overview?.security.failedLogins24h ?? 0)} warning={(overview?.security.failedLogins24h ?? 0) > 0} /><ServiceLine label="Comptes sous limitation" status={String(overview?.security.lockedAccounts ?? 0)} warning={(overview?.security.lockedAccounts ?? 0) > 0} /><ServiceLine label="Tentatives (fenêtres actives)" status={String(overview?.security.rateLimitAttempts ?? 0)} /><ServiceLine label="MFA Super Admin" status="Non configurée" warning /></article>
    <article className="sa-panel sa-table-panel"><div className="sa-panel-heading"><div><p>SESSIONS EN COURS</p><h2>{sessions.length} session(s) active(s) · 500 max affichées</h2></div></div>{sessions.length ? <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Compte</th><th>Rôle</th><th>Session créée</th><th>Expiration</th><th>Action</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id}><td><b>{session.user.name}</b><small>{session.user.email}</small></td><td>{session.user.role?.name ?? (session.user.platformAdmin ? 'Super Administrateur' : 'Sans rôle')}</td><td>{formatDate(session.createdAt)}</td><td>{formatDate(session.expiresAt)}</td><td><button className="sa-button subtle" disabled={session.user.platformAdmin} onClick={() => revoke(session.user)}>{session.user.platformAdmin ? 'Compte protégé' : 'Révoquer toutes'}</button></td></tr>)}</tbody></table></div> : <EmptyState text="Aucune session active." />}</article>
    <article className="sa-panel sa-table-panel"><div className="sa-panel-heading"><div><p>AUTHENTIFICATIONS ÉCHOUÉES</p><h2>Événements enregistrés</h2></div></div>{overview?.security.recentFailures.length ? <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Date</th><th>Compte saisi</th><th>Résultat</th></tr></thead><tbody>{overview.security.recentFailures.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td>{event.email ?? 'Non enregistré'}</td><td>{event.result}</td></tr>)}</tbody></table></div> : <EmptyState text="Aucun échec de connexion sur les dernières 24 heures." />}</article>
    <article className="sa-panel"><div className="sa-panel-heading"><div><p>INFRASTRUCTURE</p><h2>Capacités non configurées</h2></div><Database size={18} /></div><ServiceLine label="Sauvegardes / restauration" status="Non configurées · aucune sauvegarde inventoriée" warning /><ServiceLine label="Stockage disponible" status="Métrique non exposée par l’hébergement" /><ServiceLine label="Monitoring serveur / erreurs HTTP" status="Non configuré · seuls les échecs d’authentification audit sont suivis" /><ServiceLine label="Déconnexion individuelle / révoquer toutes" status="Disponible · action journalisée" /></article>
  </div>;
}

function DiagnosticsSection({ data }: { data: Overview | null }) {
  if (!data?.services) return <EmptyState text="Diagnostic indisponible." />;
  return <div className="sa-diagnostics-grid"><article className="sa-panel"><div className="sa-panel-heading"><div><p>Diagnostic</p><h2>État des services</h2></div><Activity size={18} /></div><ServiceLine label="MariaDB / Prisma" status={data.services.database} /><ServiceLine label="Messagerie de récupération" status={data.services.email} /><ServiceLine label="Échecs enregistrés sur 24 h" status={data.services.recentFailures ? String(data.services.recentFailures) : 'aucun'} warning={data.services.recentFailures > 0} /><ServiceLine label="Environnement" status={data.environment ?? 'unknown'} /><ServiceLine label="Version" status={data.version ?? '0.1.0'} /></article><article className="sa-panel"><div className="sa-panel-heading"><div><p>Événements</p><h2>Erreurs récentes (24 h)</h2></div><Activity size={18} /></div>{data.security.recentFailures.length ? <ul className="sa-failure-list">{data.security.recentFailures.map((event) => <li key={event.id}><strong>Échec de connexion · {event.email ?? 'identifiant non enregistré'}</strong><time>{formatDate(event.createdAt)}</time></li>)}</ul> : <EmptyState text="Aucun échec enregistré sur les dernières 24 heures." />}</article><article className="sa-panel"><div className="sa-panel-heading"><div><p>Confidentialité</p><h2>Diagnostic sans secrets</h2></div><LockKeyhole size={18} /></div><p className="sa-diagnostic-copy">Cette vue n’affiche que les événements d’échec et leur type. Les mots de passe, jetons, adresses IP et données personnelles inutiles restent masqués.</p><div className="sa-info-box"><Database size={16} />Le détail d’un changement métier se consulte dans le journal d’audit.</div></article></div>;
}

function UsersSection({ data, roles, search, setSearch, roleFilter, setRoleFilter, statusFilter, setStatusFilter, submit, change, createReset, beginCreate, beginEdit, viewActivity, viewProfile, isOwnerWorkspace }: {
  data: User[];
  roles: Role[];
  search: string;
  setSearch: (value: string) => void;
  roleFilter: string;
  setRoleFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  change: (user: User) => void;
  createReset: (user: User) => void;
  beginCreate: () => void;
  beginEdit: (user: User) => void;
  viewActivity: (user: User) => void;
  viewProfile: (user: User) => void;
  isOwnerWorkspace: boolean;
}) {
  return <>
    <div className="sa-section-actions">
      <button className="sa-button primary" onClick={beginCreate}><Plus size={15} />{isOwnerWorkspace ? 'Créer un compte du personnel' : 'Créer un compte'}</button>
      <span className="sa-inline-note">{isOwnerWorkspace ? 'Créez plusieurs comptes Comptable ou d’autres rôles hôteliers ; chaque membre dispose de son propre identifiant.' : 'Chaque membre du personnel dispose d’un identifiant individuel ; aucun compte partagé. Les comptes désactivés ne peuvent plus se connecter.'}</span>
    </div>
    <form className="sa-search-row" onSubmit={submit}>
      <div className="sa-search-input"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, e-mail ou rôle" /></div>
      <select aria-label="Filtrer par rôle" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">Tous les rôles</option>{roles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}<option value="SUPER_ADMIN">Super Administrateur</option></select>
      <select aria-label="Filtrer par statut" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tous les statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option></select>
      <button className="sa-button primary">Rechercher</button>
    </form>
    <div className="sa-panel sa-table-panel">
      <div className="sa-panel-heading"><div><p>Comptes</p><h2>Utilisateurs <small>{data.length}</small></h2></div></div>
      {data.length ? <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Dernière connexion</th><th>Statut</th><th>Accès</th></tr></thead>
        <tbody>{data.map((user) => <tr key={user.id}>
          <td><strong>{user.name}</strong><small>{user.email}</small></td>
          <td>{user.platformAdmin ? 'Super Administrateur' : user.role?.name ?? 'Aucun rôle'}</td>
          <td>{formatDate(user.lastLoginAt)}</td>
          <td><Status active={user.active} /></td>
          <td><div className="sa-row-actions">
              <button className="sa-button subtle" onClick={() => viewProfile(user)} aria-label={`Ouvrir l’espace de ${user.name}`} title="Ouvrir l’espace utilisateur"><Eye size={15} /> Voir l’espace</button>
              {user.platformAdmin && <span className="sa-tag">Super Administrateur</span>}
              {!user.platformAdmin && <><button className="sa-button subtle" onClick={() => beginEdit(user)}>Modifier</button><button className="sa-button subtle" onClick={() => viewActivity(user)}>Activité</button><button className="sa-button subtle" disabled={!user.active} onClick={() => createReset(user)}>Réinitialiser</button></>}
              <button className="sa-button subtle" onClick={() => change(user)}>{user.active ? 'Suspendre' : 'Réactiver'}</button>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState text="Aucun compte ne correspond à la recherche." />}
    </div>
  </>;
}

function StaffActivityDialog({ data, range, setRange, apply, close }: {
  data: StaffActivity;
  range: { from: string; to: string };
  setRange: (range: { from: string; to: string }) => void;
  apply: () => void;
  close: () => void;
}) {
  const { user, metrics } = data;
  return <div className="sa-modal-backdrop" role="presentation"><section className="sa-modal sa-staff-activity" role="dialog" aria-modal="true" aria-labelledby="sa-activity-title">
    <div className="sa-panel-heading"><div><p>{user.email} · {user.role?.name ?? 'Sans rôle'}</p><h2 id="sa-activity-title">Activité et performances · {user.name}</h2></div><button className="sa-icon-button" onClick={close} aria-label="Fermer"><X size={17} /></button></div>
    <div className="sa-audit-filters"><label><span>Du</span><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label><label><span>Au</span><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label><button className="sa-button primary" onClick={apply}>Filtrer</button></div>
    <div className="sa-metrics sa-staff-metrics">
      <div className="sa-metric"><span className="sa-metric-label">Réservations créées</span><strong>{metrics.reservationsCreated}</strong></div>
      <div className="sa-metric"><span className="sa-metric-label">Clients enregistrés</span><strong>{metrics.clientsCreated}</strong></div>
      <div className="sa-metric"><span className="sa-metric-label">Paiements reçus</span><strong>{metrics.paymentsCount}</strong></div>
      <div className="sa-metric"><span className="sa-metric-label">Montant encaissé</span><strong>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' }).format(Number(metrics.amountCollected))}</strong></div>
      <div className="sa-metric"><span className="sa-metric-label">Caisses ouvertes / clôturées</span><strong>{metrics.cashSessionsOpened} / {metrics.cashSessionsClosed}</strong></div>
      <div className="sa-metric"><span className="sa-metric-label">Opérations journalisées</span><strong>{metrics.auditEvents}</strong></div>
    </div>
    <div className="sa-panel-heading"><div><p>Traçabilité</p><h3>Dernières opérations</h3></div></div>
    {data.events.length ? <div className="sa-table-wrap sa-activity-table"><table className="sa-table"><thead><tr><th>Date et heure</th><th>Opération</th><th>Résultat</th><th>Cible</th><th>Détails</th></tr></thead><tbody>{data.events.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td>{activityActionLabel(event.action)}</td><td><Status active={event.result === 'SUCCESS'} label={activityResultLabel(event.result)} /></td><td>{event.targetId ?? '—'}</td><td><details><summary>Consulter</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details></td></tr>)}</tbody></table></div> : <EmptyState text="Aucune activité réception sur cette période." />}
    <div className="sa-panel-heading"><div><p>Clôtures personnelles</p><h3>Historique des caisses</h3></div></div>
    {data.cashSessions.length ? <div className="sa-table-wrap sa-activity-table"><table className="sa-table"><thead><tr><th>Ouverture</th><th>Statut</th><th>Fonds initial (XAF)</th><th>Espèces théoriques (XAF)</th><th>Comptées (XAF)</th><th>Écart (XAF)</th></tr></thead><tbody>{data.cashSessions.map((session) => <tr key={session.id}><td>{formatDate(session.openedAt)}</td><td>{session.status === 'CLOSED' ? 'Clôturée' : 'Ouverte'}</td><td>{session.openingAmount}</td><td>{session.expectedCash ?? '—'}</td><td>{session.countedAmount ?? '—'}</td><td>{session.variance ?? '—'}</td></tr>)}</tbody></table></div> : <EmptyState text="Aucune caisse sur la période." />}
    <div className="sa-modal-actions"><button className="sa-button" onClick={close}>Fermer</button></div>
  </section></div>;
}

function NewUserDialog({ form, setForm, roles, close, submit }: {
  form: { name: string; email: string; password: string; roleCode: string };
  setForm: (value: { name: string; email: string; password: string; roleCode: string }) => void;
  roles: { code: string; name: string }[];
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="sa-modal-backdrop" role="presentation"><form className="sa-modal" role="dialog" aria-modal="true" aria-labelledby="sa-new-user-title" onSubmit={submit}>
    <div className="sa-panel-heading"><div><p>Compte individuel</p><h2 id="sa-new-user-title">Créer un compte hôtelier</h2></div><button type="button" className="sa-icon-button" onClick={close} aria-label="Fermer"><X size={17} /></button></div>
    <label><span>Nom et prénom</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required /></label>
    <label><span>E-mail (identifiant de connexion)</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={191} required /></label>
    <label><span>Mot de passe provisoire (12 caractères min.)</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} maxLength={128} required autoComplete="new-password" /></label>
    <label><span>Rôle</span><select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })} required>{roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}</select></label>
    <div className="sa-modal-actions"><button type="button" className="sa-button" onClick={close}>Annuler</button><button className="sa-button primary">Créer le compte</button></div>
  </form></div>;
}

function EditUserDialog({ user, form, setForm, roles, close, submit }: {
  user: User;
  form: { name: string; email: string; roleId: string };
  setForm: (value: { name: string; email: string; roleId: string }) => void;
  roles: { id: string; code: string; name: string }[];
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="sa-modal-backdrop" role="presentation"><form className="sa-modal" role="dialog" aria-modal="true" aria-labelledby="sa-edit-user-title" onSubmit={submit}>
    <div className="sa-panel-heading"><div><p>{user.email}</p><h2 id="sa-edit-user-title">Modifier le compte</h2></div><button type="button" className="sa-icon-button" onClick={close} aria-label="Fermer"><X size={17} /></button></div>
    <label><span>Nom et prénom</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required /></label>
    <label><span>Adresse e-mail (identifiant)</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={191} required /></label>
    <label><span>Rôle</span><select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    <p className="sa-help">Le changement de rôle révoque immédiatement les sessions de ce compte. La réinitialisation du mot de passe passe par « Réinitialiser ».</p>
    <div className="sa-modal-actions"><button type="button" className="sa-button" onClick={close}>Annuler</button><button className="sa-button primary">Enregistrer</button></div>
  </form></div>;
}

function InventorySection({ data, categoryForm, setCategoryForm, roomForm, setRoomForm, methodForm, setMethodForm, create, patch, currency }: {
  data: Inventory | null;
  categoryForm: { name: string; capacity: string; nightlyRate: string; siestaRate: string };
  setCategoryForm: (value: { name: string; capacity: string; nightlyRate: string; siestaRate: string }) => void;
  roomForm: { number: string; floor: string; categoryId: string };
  setRoomForm: (value: { number: string; floor: string; categoryId: string }) => void;
  methodForm: { code: string; name: string };
  setMethodForm: (value: { code: string; name: string }) => void;
  create: (entity: 'category' | 'room' | 'method', payload: Record<string, unknown>) => void;
  patch: (payload: Record<string, unknown>, message?: string) => void;
  currency: string;
}) {
  const firstCategory = data?.categories[0]?.id ?? '';
  const displayCurrency = data?.currency ?? currency;
  const currencyName = displayCurrency === 'XAF' ? 'FCFA' : displayCurrency;
  const [catalogView, setCatalogView] = useState<'groups' | 'floors'>('groups');
  const [catalogGroup, setCatalogGroup] = useState('all');
  const [catalogFloor, setCatalogFloor] = useState('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const rateKey = (room: Inventory['rooms'][number]) => room.nightlyRateMin === null || room.nightlyRateMax === null
    ? 'unconfigured'
    : room.number === '107' && Number(room.nightlyRateMin) === Number(room.nightlyRateMax)
      ? 'fixed-20000'
      : `${Number(room.nightlyRateMin)}-${Number(room.nightlyRateMax)}`;
  const rateLabel = (key: string) => ({
    'fixed-20000': 'Tarif fixe · 20 000', '20000-25000': '20 000 – 25 000', '20000-30000': '20 000 – 30 000',
    '25000-30000': '25 000 – 30 000', '25000-35000': '25 000 – 35 000', '30000-35000': '30 000 – 35 000',
    '30000-40000': '30 000 – 40 000', '35000-40000': '35 000 – 40 000', '50000-80000': 'Suite · 50 000 – 80 000',
    unconfigured: 'Tarif non configuré',
  } as Record<string, string>)[key] ?? key;
  const catalogRooms = (data?.rooms ?? []).filter((room) =>
    (catalogGroup === 'all' || rateKey(room) === catalogGroup)
    && (catalogFloor === 'all' || (room.floor ?? 'Non renseigné') === catalogFloor)
    && room.number.toLocaleLowerCase('fr-FR').includes(catalogSearch.trim().toLocaleLowerCase('fr-FR')),
  ).sort((a, b) => Number(a.number) - Number(b.number) || a.number.localeCompare(b.number));
  const rateGroups = [...new Set((data?.rooms ?? []).map(rateKey))].sort((a, b) => {
    const order = ['fixed-20000','20000-25000','20000-30000','25000-30000','25000-35000','30000-35000','30000-40000','35000-40000','50000-80000','unconfigured'];
    return order.indexOf(a) - order.indexOf(b);
  });
  const floors = [...new Set((data?.rooms ?? []).map((room) => room.floor ?? 'Non renseigné'))].sort((a,b) => a.localeCompare(b, 'fr'));
  return <>
    <section className="sa-panel sa-rate-catalog">
      <div className="sa-panel-heading"><div><p>Catalogue commercial</p><h2>Tarifs de séjour par chambre</h2></div><BedDouble size={18} /></div>
      <p className="sa-inline-note">Classification calculée depuis les tarifs enregistrés pour les chambres. Les tarifs de sieste restent indépendants.</p>
      <div className="sa-rate-summary">
        {rateGroups.map((key) => {
          const members = (data?.rooms ?? []).filter((room) => rateKey(room) === key);
          const prices = members.flatMap((room) => [room.nightlyRateMin, room.nightlyRateMax].filter((value): value is string => value !== null).map(Number));
          return <button type="button" key={key} className={`sa-rate-summary-card${catalogGroup === key ? ' is-selected' : ''}`} onClick={() => setCatalogGroup(catalogGroup === key ? 'all' : key)}>
            <span>{rateLabel(key)}</span><strong>{members.length} <small>ch.</small></strong>
            <small>{prices.length ? `${Math.min(...prices).toLocaleString('fr-FR')} – ${Math.max(...prices).toLocaleString('fr-FR')} ${currencyName}` : 'Aucun tarif communiqué'}</small>
          </button>;
        })}
      </div>
      <div className="sa-rate-toolbar">
        <div className="sa-rate-tabs" role="tablist" aria-label="Organisation du catalogue">
          <button type="button" className={catalogView === 'groups' ? 'is-active' : ''} onClick={() => setCatalogView('groups')}>Par groupe tarifaire</button>
          <button type="button" className={catalogView === 'floors' ? 'is-active' : ''} onClick={() => setCatalogView('floors')}>Par étage</button>
        </div>
        <label className="sa-search-input"><Search size={14} /><input aria-label="Rechercher une chambre" placeholder="N° de chambre" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} /></label>
        <select aria-label="Filtrer par groupe tarifaire" value={catalogGroup} onChange={(event) => setCatalogGroup(event.target.value)}><option value="all">Tous les groupes</option>{rateGroups.map((key) => <option key={key} value={key}>{rateLabel(key)}</option>)}</select>
        <select aria-label="Filtrer par étage" value={catalogFloor} onChange={(event) => setCatalogFloor(event.target.value)}><option value="all">Tous les étages</option>{floors.map((floor) => <option key={floor} value={floor}>{floor}</option>)}</select>
      </div>
      {catalogView === 'groups' ? rateGroups.filter((key) => catalogGroup === 'all' || key === catalogGroup).map((key) => {
        const members = catalogRooms.filter((room) => rateKey(room) === key);
        if (!members.length) return null;
        return <div className="sa-rate-group" key={key}><div className="sa-rate-group-heading"><strong>{rateLabel(key)}</strong><span>{members.length} chambre{members.length > 1 ? 's' : ''}</span></div>
          <div className="sa-rate-room-grid">{members.map((room) => <details className="sa-rate-room" key={room.id}><summary><strong>Ch. {room.number}</strong><span>{room.nightlyRateMin === null || room.nightlyRateMax === null ? 'TARIF NON CONFIGURÉ' : `${Number(room.nightlyRateMin).toLocaleString('fr-FR')} – ${Number(room.nightlyRateMax).toLocaleString('fr-FR')} ${currencyName}`}</span></summary><div><span>{room.category} · étage {room.floor ?? 'non renseigné'}</span><span>{room.status} · {room.housekeepingStatus}</span><button type="button" className="sa-button subtle" onClick={() => { const minimum = window.prompt(`Tarif séjour minimum · chambre ${room.number} (${currencyName})`, room.nightlyRateMin ?? ''); if (minimum === null) return; const maximum = window.prompt(`Tarif séjour maximum · chambre ${room.number} (${currencyName})`, room.nightlyRateMax ?? ''); if (maximum === null) return; patch({ entity: 'room', id: room.id, nightlyRateMin: minimum, nightlyRateMax: maximum }, 'Tarifs de séjour enregistrés et journalisés.'); }}>Modifier le tarif</button></div></details>)}</div>
        </div>;
      }) : floors.map((floor) => {
        const members = catalogRooms.filter((room) => (room.floor ?? 'Non renseigné') === floor);
        if (!members.length) return null;
        return <div className="sa-rate-group" key={floor}><div className="sa-rate-group-heading"><strong>Étage {floor}</strong><span>{members.length} chambre{members.length > 1 ? 's' : ''}</span></div><div className="sa-rate-room-grid">{members.map((room) => <details className="sa-rate-room" key={room.id}><summary><strong>Ch. {room.number}</strong><span>{rateLabel(rateKey(room))}</span></summary><div><span>{room.nightlyRateMin === null || room.nightlyRateMax === null ? 'Aucun tarif de séjour configuré.' : `${Number(room.nightlyRateMin).toLocaleString('fr-FR')} – ${Number(room.nightlyRateMax).toLocaleString('fr-FR')} ${currencyName}`}</span><span>{room.category} · {room.status}</span></div></details>)}</div></div>;
      })}
      {!catalogRooms.length && <EmptyState text="Aucune chambre ne correspond à ces filtres." />}
    </section>
    <div className="sa-inventory-grid">
      <section className="sa-panel"><div className="sa-panel-heading"><div><p>Catégories</p><h2>Types de chambre & tarifs</h2></div><BedDouble size={18} /></div>
        {(data?.categories.length ?? 0) ? data!.categories.map((category) => <div className="sa-inventory-row" key={category.id}>
          <span><strong>{category.name}</strong><small>{category.capacity === null ? 'Sans limite' : `${category.capacity} pers.`} · {Number(category.nightlyRate).toLocaleString('fr-FR')} {currencyName}/nuit{category.siestaRate ? ` · sieste ${Number(category.siestaRate).toLocaleString('fr-FR')} ${currencyName}` : ' · sieste non tarifée'} · {category.roomCount} chambre(s)</small></span>
          <div className="sa-row-actions"><button className="sa-button subtle" onClick={() => patch({ entity: 'category', id: category.id, active: !category.active }, category.active ? 'Catégorie désactivée.' : 'Catégorie activée.')}>{category.active ? 'Désactiver' : 'Activer'}</button></div>
        </div>) : <EmptyState text="Aucune catégorie configurée." />}
        <form className="sa-inventory-form" onSubmit={(event) => { event.preventDefault(); create('category', { name: categoryForm.name, capacity: categoryForm.capacity === '' ? null : Number(categoryForm.capacity), nightlyRate: categoryForm.nightlyRate, ...(categoryForm.siestaRate ? { siestaRate: categoryForm.siestaRate } : {}) }); setCategoryForm({ name: '', capacity: '2', nightlyRate: '', siestaRate: '' }); }}>
          <label><span>Nom</span><input value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} minLength={2} maxLength={100} required /></label>
          <label><span>Capacité max. (vide = sans limite)</span><input type="number" min={1} max={2147483647} value={categoryForm.capacity} onChange={(event) => setCategoryForm({ ...categoryForm, capacity: event.target.value })} /></label>
          <label><span>Tarif nuit ({currencyName})</span><input inputMode="decimal" value={categoryForm.nightlyRate} onChange={(event) => setCategoryForm({ ...categoryForm, nightlyRate: event.target.value })} pattern="^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$" required /></label>
          <label><span>Tarif sieste ({currencyName}, facultatif)</span><input inputMode="decimal" value={categoryForm.siestaRate} onChange={(event) => setCategoryForm({ ...categoryForm, siestaRate: event.target.value })} pattern="^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$" /></label>
          <button className="sa-button primary"><Plus size={14} />Ajouter</button>
        </form>
      </section>
      <section className="sa-panel"><div className="sa-panel-heading"><div><p>Chambres</p><h2>Inventaire <small>{data?.rooms.length ?? 0}</small></h2></div><Building2 size={18} /></div>
        {(data?.rooms.length ?? 0) ? <div className="sa-inventory-rooms">{data!.rooms.map((room) => <div className="sa-inventory-row" key={room.id}><span><strong>Ch. {room.number}</strong><small>{room.category}{room.floor ? ` · étage ${room.floor}` : ''} · {room.status} / {room.housekeepingStatus}{room.currentGuest && <> · Client en séjour : <strong>{room.currentGuest}</strong></>}<br />Séjour : {room.nightlyRateMin && room.nightlyRateMax ? `${Number(room.nightlyRateMin).toLocaleString('fr-FR')} – ${Number(room.nightlyRateMax).toLocaleString('fr-FR')} ${currencyName}` : 'non configuré'}{room.number === '107' ? ' · tarif fixe à confirmer' : ''}</small></span><div className="sa-row-actions"><button className="sa-button subtle" onClick={() => { const minimum = window.prompt(`Tarif séjour minimum · chambre ${room.number} (${currencyName})`, room.nightlyRateMin ?? ''); if (minimum === null) return; const maximum = window.prompt(`Tarif séjour maximum · chambre ${room.number} (${currencyName})`, room.nightlyRateMax ?? ''); if (maximum === null) return; patch({ entity: 'room', id: room.id, nightlyRateMin: minimum, nightlyRateMax: maximum }, 'Tarifs de séjour enregistrés et journalisés.'); }}>Tarifs</button>{room.status === 'OUT_OF_SERVICE' ? <button className="sa-button subtle" onClick={() => patch({ entity: 'room', id: room.id, status: 'AVAILABLE' }, 'Chambre remise en service.')}>Fin maintenance</button> : <button className="sa-button subtle" disabled={room.status === 'OCCUPIED'} onClick={() => patch({ entity: 'room', id: room.id, status: 'OUT_OF_SERVICE' }, 'Chambre mise en maintenance.')}>{room.status === 'OCCUPIED' ? 'Client hébergé' : 'Maintenance'}</button>}</div></div>)}</div> : <EmptyState text="Aucune chambre configurée." />}
        <form className="sa-inventory-form" onSubmit={(event) => { event.preventDefault(); create('room', { number: roomForm.number, floor: roomForm.floor, categoryId: roomForm.categoryId || firstCategory }); setRoomForm({ number: '', floor: '', categoryId: '' }); }}>
          <label><span>Numéro</span><input value={roomForm.number} onChange={(event) => setRoomForm({ ...roomForm, number: event.target.value })} minLength={1} maxLength={30} required /></label>
          <label><span>Étage</span><input value={roomForm.floor} onChange={(event) => setRoomForm({ ...roomForm, floor: event.target.value })} maxLength={30} /></label>
          <label><span>Catégorie</span><select value={roomForm.categoryId || firstCategory} onChange={(event) => setRoomForm({ ...roomForm, categoryId: event.target.value })} required>{data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <button className="sa-button primary" disabled={!firstCategory}><Plus size={14} />Ajouter</button>
        </form>
      </section>
      <section className="sa-panel"><div className="sa-panel-heading"><div><p>Encaissements</p><h2>Moyens de paiement</h2></div><CreditCard size={18} /></div>
        {(data?.paymentMethods.length ?? 0) ? data!.paymentMethods.map((method) => <div className="sa-inventory-row" key={method.id}><span><strong>{method.name}</strong><small>{method.code}</small></span><div className="sa-row-actions"><button className="sa-button subtle" onClick={() => { const name = window.prompt(`Nom affiché pour le moyen ${method.code}`, method.name); if (name === null || name.trim() === method.name) return; patch({ entity: 'method', id: method.id, name: name.trim() }, 'Nom du moyen de paiement modifié.'); }}>Modifier</button><button className="sa-button subtle" onClick={() => patch({ entity: 'method', id: method.id, active: !method.active }, method.active ? 'Moyen désactivé.' : 'Moyen activé.')}>{method.active ? 'Désactiver' : 'Activer'}</button></div></div>) : <EmptyState text="Aucun moyen de paiement : les encaissements sont indisponibles." />}
        <form className="sa-inventory-form" onSubmit={(event) => { event.preventDefault(); create('method', { code: methodForm.code.toUpperCase(), name: methodForm.name }); setMethodForm({ code: '', name: '' }); }}>
          <label><span>Code (ex. MOMO)</span><input value={methodForm.code} onChange={(event) => setMethodForm({ ...methodForm, code: event.target.value.toUpperCase() })} minLength={2} maxLength={40} pattern="[A-Z0-9_]+" required /></label>
          <label><span>Nom affiché</span><input value={methodForm.name} onChange={(event) => setMethodForm({ ...methodForm, name: event.target.value })} minLength={2} maxLength={80} required /></label>
          <button className="sa-button primary"><Plus size={14} />Ajouter</button>
        </form>
        <p className="sa-help">Le code CASH identifie les espèces pour la clôture de caisse ; ne pas le renommer.</p>
      </section>
    </div>
  </>;
}

function ServiceLine({ label, status, warning = false }: { label: string; status: string; warning?: boolean }) {
  const ok = ['available', 'configured', 'aucun'].includes(status);
  return <div className="sa-service-line"><span>{label}</span><strong className={warning ? 'is-warning' : ok ? 'is-ok' : ''}><i />{status === 'available' ? 'Disponible' : status === 'configured' ? 'Configuré' : status === 'not_configured' ? 'Non configuré' : status === 'not_implemented' ? 'Non intégré' : status}</strong></div>;
}

function Status({ active, label }: { active: boolean; label?: string }) {
  return <span className={`sa-status${active ? ' is-active' : ' is-inactive'}`}><i />{label ?? (active ? 'Actif' : 'Suspendu')}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="sa-empty"><span><Search size={19} /></span><p>{text}</p></div>;
}

function ResetLinkDialog({ data, close }: { data: { url: string; email: string; expiresAt: string }; close: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  async function copy() {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
    } catch {
      setCopyError('Impossible de copier automatiquement. Sélectionnez le lien pour le copier manuellement.');
    }
  }
  return <div className="sa-modal-backdrop" role="presentation"><section className="sa-modal" role="dialog" aria-modal="true" aria-labelledby="sa-reset-title"><div className="sa-panel-heading"><div><p>Action sensible</p><h2 id="sa-reset-title">Lien de récupération</h2></div><button className="sa-icon-button" onClick={close} aria-label="Fermer"><X size={17} /></button></div><p className="sa-modal-copy">Transmettez ce lien uniquement à <strong>{data.email}</strong> par un canal de confiance. Il ne sera plus consultable après fermeture et expirera le {formatDate(data.expiresAt)}.</p><input className="sa-reset-url" readOnly value={data.url} onFocus={(event) => event.currentTarget.select()} />{copyError && <p className="sa-help" role="alert">{copyError}</p>}<div className="sa-modal-actions"><button className="sa-button" onClick={close}>Fermer</button><button className="sa-button primary" onClick={() => void copy()}>{copied ? 'Copié' : 'Copier le lien'}</button></div></section></div>;
}
