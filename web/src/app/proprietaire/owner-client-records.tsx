'use client';

import { useEffect, useState } from 'react';
import { Search, Users, FileText, CalendarDays } from 'lucide-react';
import styles from './owner-client-records.module.css';

type Client = { id: string; name: string; phone: string | null; email: string | null; nationality?: string | null; idDocumentName?: string | null; createdByName?: string | null; createdAt?: string; _count?: { reservations: number } };
type Stay = { id: string; reference: string; status: string; checkInDate: string; checkOutDate: string; room: string | null; billed: string | null; paid: string | null; balance: string | null; invoiceNumber: string | null; createdByName: string | null };
type Detail = { client: Client & { address?: string | null; idType?: string | null; idNumber?: string | null; notes?: string | null; idDocument?: { name: string } | null; reservations: Stay[] } };

const money = (value: string | null) => value === null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function OwnerClientRecords() {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Detail['client'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(search = query) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/reception/clients?q=${encodeURIComponent(search)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Impossible de charger les clients.');
      setClients(result.clients);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Erreur de chargement.'); }
    finally { setBusy(false); }
  }

  async function openClient(client: Client) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/reception/clients/${client.id}`);
      const result = await response.json() as Detail & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Impossible de charger la fiche client.');
      setSelected(result.client);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Erreur de chargement.'); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(''); }, []);

  return <div className={styles.workspace}>
    <section className={styles.listPanel}>
      <header><div><p>HISTORIQUE CLIENT</p><h2>Clients et séjours</h2></div><Users size={19} /></header>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, téléphone, e-mail, pièce ou réservation" /><button>Rechercher</button></form>
      {busy && <p className={styles.message}>Chargement…</p>}{error && <p className={styles.error}>{error}</p>}
      <div className={styles.rows}>{clients.map((client) => <button key={client.id} onClick={() => void openClient(client)}><span><b>{client.name}</b><small>{[client.phone, client.email].filter(Boolean).join(' · ') || 'Coordonnées non renseignées'}</small></span><i>{client._count?.reservations ?? 0} séjour(s)</i></button>)}</div>
      {!busy && clients.length === 0 && <p className={styles.message}>Aucun client trouvé.</p>}
    </section>
    <section className={styles.detailPanel}>
      {selected ? <><header><div><p>FICHE COMPLÈTE</p><h2>{selected.name}</h2></div><FileText size={19} /></header>
        <div className={styles.identity}><span>Téléphone <b>{selected.phone ?? '—'}</b></span><span>E-mail <b>{selected.email ?? '—'}</b></span><span>Nationalité <b>{selected.nationality ?? '—'}</b></span><span>Adresse <b>{selected.address ?? '—'}</b></span><span>Pièce d’identité <b>{[selected.idType, selected.idNumber].filter(Boolean).join(' · ') || '—'}</b></span><span>Enregistré par <b>{selected.createdByName ?? '—'}</b></span></div>
        {selected.notes && <p className={styles.note}>{selected.notes}</p>}
        {selected.idDocument?.name && <a className={styles.scan} href={`/api/reception/clients/${selected.id}/document`} target="_blank" rel="noreferrer"><FileText size={15} />Ouvrir le scan : {selected.idDocument.name}</a>}
        <h3><CalendarDays size={16} />Historique complet des séjours ({selected.reservations.length})</h3>
        <div className={styles.stays}>{selected.reservations.map((stay) => <article key={stay.id}><div><b>{stay.reference} · Chambre {stay.room ?? '—'}</b><small>{stay.checkInDate} → {stay.checkOutDate} · {stay.status}</small><small>Enregistré par {stay.createdByName ?? '—'}</small></div><div className={styles.amounts}><span>Facturé <b>{money(stay.billed)}</b></span><span>Payé <b>{money(stay.paid)}</b></span><span>Solde <b>{money(stay.balance)}</b></span></div></article>)}</div>
      </> : <p className={styles.message}>Sélectionnez un client pour consulter ses informations, son scan et l’intégralité de ses séjours.</p>}
    </section>
  </div>;
}
