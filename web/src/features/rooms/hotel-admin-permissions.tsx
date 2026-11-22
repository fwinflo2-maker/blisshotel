'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';

type Administrator = { id: string; name: string; email: string; active: boolean; roomCount: number; delegatedPermissionCount: number };
type Permission = { code: string; label: string; group: string };
const labels: Record<string, [string, string]> = {
  'rooms.manage': ['Modifier les informations autorisées des chambres', 'Chambres'],
  'rooms.rates.view': ['Consulter les tarifs des chambres attribuées', 'Chambres'],
  'reservations.view': ['Consulter les réservations attribuées', 'Réservations et séjours'],
  'reservations.create': ['Créer une réservation dans son périmètre', 'Réservations et séjours'],
  'reservations.update': ['Modifier une réservation dans son périmètre', 'Réservations et séjours'],
  'reservations.cancel': ['Annuler une réservation dans son périmètre', 'Réservations et séjours'],
  'reservations.confirm': ['Confirmer une réservation dans son périmètre', 'Réservations et séjours'],
  'clients.view': ['Consulter les clients liés à ses réservations', 'Réservations et séjours'],
  'clients.create': ['Créer un client', 'Réservations et séjours'],
  'clients.update': ['Modifier les informations client', 'Réservations et séjours'],
  'stays.view': ['Consulter les séjours attribués', 'Réservations et séjours'],
  'stays.checkin': ['Effectuer un check-in', 'Réservations et séjours'],
  'stays.checkout': ['Effectuer un check-out', 'Réservations et séjours'],
  'stays.extend': ['Prolonger un séjour', 'Réservations et séjours'],
  'housekeeping.tasks.view': ['Consulter les tâches d’entretien de ses chambres', 'Entretien'],
  'maintenance.view': ['Consulter les incidents et états techniques', 'Maintenance'],
  'maintenance.incidents.report': ['Signaler un incident', 'Maintenance'],
  'reports.financial.view': ['Consulter les indicateurs financiers de ses chambres', 'Rapports'],
  'reports.export': ['Exporter les rapports autorisés', 'Rapports'],
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'La requête a échoué.');
  return payload as T;
}

export default function HotelAdminPermissions() {
  const [users, setUsers] = useState<Administrator[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    const result = await request<{ administrators: Administrator[] }>('/api/hotel-admins');
    setUsers(result.administrators);
    setSelectedId((current) => current || result.administrators[0]?.id || '');
  }, []);
  const loadPermissions = useCallback(async (id: string) => {
    if (!id) { setPermissions([]); setDraft([]); return; }
    const result = await request<{ permissions: string[]; available: string[] }>(`/api/hotel-admins/${id}/permissions`);
    setDraft(result.permissions);
    setPermissions(result.available.map((code) => ({ code, label: labels[code]?.[0] ?? code, group: labels[code]?.[1] ?? 'Autres' })));
  }, []);

  useEffect(() => { void loadUsers().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Chargement impossible.')); }, [loadUsers]);
  useEffect(() => { void loadPermissions(selectedId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Chargement impossible.')); }, [selectedId, loadPermissions]);

  async function save() {
    if (!selectedId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await request(`/api/hotel-admins/${selectedId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionCodes: draft }) });
      await loadUsers();
      setNotice('Les accès individuels ont été enregistrés et journalisés.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }

  const grouped = [...new Set(permissions.map((permission) => permission.group))];
  const selected = users.find((user) => user.id === selectedId);
  return <div className="sa-inventory-grid"><section className="sa-panel sa-admin-permissions">
    <div className="sa-panel-heading"><div><p>Accès individuels · BLISS HOTEL</p><h2>Permissions des Administrateurs Hôtel</h2></div><ShieldCheck size={19} /></div>
    <p className="sa-inline-note">Le compte conserve uniquement le socle « Tableau de bord » et « Mes chambres » tant qu’aucun accès supplémentaire n’est accordé. Ces permissions ne changent pas son périmètre de chambres.</p>
    {error && <div className="sa-alert is-error" role="alert">{error}</div>}
    {notice && <div className="sa-alert is-success" role="status">{notice}</div>}
    {!users.length ? <p className="sa-inline-note">Aucun compte Administrateur Hôtel. Créez-en un dans Utilisateurs.</p> : <>
      <label className="sa-admin-permissions-user"><span>Compte à configurer</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}{user.active ? '' : ' · désactivé'}</option>)}</select></label>
      {selected && <p className="sa-inline-note">{selected.roomCount} chambre{selected.roomCount === 1 ? '' : 's'} attribuée{selected.roomCount === 1 ? '' : 's'} · {selected.active ? 'Compte actif' : 'Compte désactivé'}.</p>}
      {grouped.map((group) => <fieldset className="sa-admin-permissions-group" key={group}><legend>{group}</legend>{permissions.filter((permission) => permission.group === group).map((permission) => <label key={permission.code}><input type="checkbox" checked={draft.includes(permission.code)} onChange={() => setDraft((current) => current.includes(permission.code) ? current.filter((code) => code !== permission.code) : [...current, permission.code])} /><span>{permission.label}<small>{permission.code}</small></span></label>)}</fieldset>)}
      <button type="button" className="sa-button primary" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? 'Enregistrement…' : 'Enregistrer ces permissions'}</button>
    </>}
  </section></div>;
}
