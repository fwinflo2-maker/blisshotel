'use client';

import { useEffect, useState } from 'react';
import { BedDouble } from 'lucide-react';

type Room = { id: string; number: string; floor: string | null; status: string; housekeepingStatus: string; technicalStatus: string; category: string; hasOpenHousekeepingTask: boolean; unavailableReason: string | null };

export default function MyRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    fetch('/api/reception/rooms').then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Impossible de charger vos chambres.');
      if (mounted) setRooms(data.rooms);
    }).catch((reason: unknown) => { if (mounted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  return <div className="sa-inventory-grid"><section className="sa-panel">
    <div className="sa-panel-heading"><div><p>BLISS HOTEL</p><h2>Mes chambres</h2></div><BedDouble size={18} /></div>
    <p className="sa-inline-note">Seules les chambres qui vous sont attribuées apparaissent dans cet espace.</p>
    {error && <div className="sa-alert is-error" role="alert">{error}</div>}
    {loading ? <p className="sa-loading">Chargement de vos chambres…</p> : rooms.length ? <div className="sa-inventory-rooms">{rooms.map((room) => <div className="sa-inventory-row" key={room.id}>
      <span><strong>Ch. {room.number} · {room.category}</strong><small>{room.floor ? `Étage ${room.floor} · ` : ''}{room.status} · Entretien : {room.housekeepingStatus}{room.unavailableReason ? ` · ${room.unavailableReason}` : ''}</small></span>
      <span className="sa-tag">{room.technicalStatus}</span>
    </div>)}</div> : !error ? <p className="sa-inline-note">Aucune chambre ne vous est attribuée pour le moment.</p> : null}
  </section></div>;
}
