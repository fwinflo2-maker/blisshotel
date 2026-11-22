'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Users } from 'lucide-react';

type Data = {
  rooms: { id: string; number: string; floor: string | null; status: string; assignedHotelAdminId: string | null; assignedHotelAdmin: { id: string; name: string; email: string } | null }[];
  administrators: { id: string; name: string; email: string }[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'La requête a échoué.');
  return payload as T;
}

export default function RoomAssignments() {
  const [data, setData] = useState<Data | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await request<Data>('/api/room-assignments');
    setData(result);
    setAssigned(Object.fromEntries(result.rooms.map((room) => [room.id, room.assignedHotelAdminId ?? ''])));
  }, []);

  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Chargement impossible.')); }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await request<{ updated: number }>('/api/room-assignments', {
        method: 'PUT',
        body: JSON.stringify({ assignments: data.rooms.map((room) => ({ roomId: room.id, administratorId: assigned[room.id] || null })) }),
      });
      await load();
      setNotice(`${result.updated} affectation${result.updated > 1 ? 's' : ''} mise${result.updated > 1 ? 's' : ''} à jour dans BLISS HOTEL.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }

  const unassignedCount = data?.rooms.filter((room) => !assigned[room.id]).length ?? 0;
  return <div className="sa-inventory-grid">
    <section className="sa-panel">
      <div className="sa-panel-heading"><div><p>BLISS HOTEL</p><h2>Attribution des chambres</h2></div><Users size={18} /></div>
      <p className="sa-inline-note">Chaque chambre reste dans l’inventaire central et ne peut avoir qu’un seul Administrateur Hôtel responsable. Les chambres non attribuées restent sans responsable.</p>
      {error && <div className="sa-alert is-error" role="alert">{error}</div>}
      {notice && <div className="sa-alert is-success" role="status">{notice}</div>}
      {!data ? <p className="sa-loading">Chargement des chambres…</p> : <>
        {!data.administrators.length && <p className="sa-inline-note">Créez d’abord des comptes « Administrateur Hôtel » dans Utilisateurs.</p>}
        <div className="sa-inventory-rooms">{data.rooms.map((room) => <div className="sa-inventory-row" key={room.id}>
          <span><strong>Ch. {room.number}</strong><small>{room.floor ? `Étage ${room.floor} · ` : ''}{room.status}{room.assignedHotelAdmin ? ` · Responsable actuel : ${room.assignedHotelAdmin.name}` : ' · Non attribuée'}</small></span>
          <select aria-label={`Administrateur responsable de la chambre ${room.number}`} value={assigned[room.id] ?? ''} onChange={(event) => setAssigned((current) => ({ ...current, [room.id]: event.target.value }))}>
            <option value="">Non attribuée</option>
            {data.administrators.map((admin) => <option value={admin.id} key={admin.id}>{admin.name} · {admin.email}</option>)}
          </select>
        </div>)}</div>
        <p className="sa-inline-note">{unassignedCount} chambre{unassignedCount === 1 ? '' : 's'} non attribuée{unassignedCount === 1 ? '' : 's'}.</p>
        <button type="button" className="sa-button primary" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? 'Enregistrement…' : 'Enregistrer les attributions'}</button>
      </>}
    </section>
  </div>;
}
