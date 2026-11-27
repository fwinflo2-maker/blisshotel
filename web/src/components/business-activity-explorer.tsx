'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Search } from 'lucide-react';
import styles from './business-activity-explorer.module.css';

type Order = { id: string; number: string; guestName: string; status: string; totalAmount: string; createdAt: string; paidAt: string | null; createdByName: string; room: { number: string } | null; reservation: { reference: string } | null };
type Client = { id: string; name: string; phone: string | null; createdAt: string };
type Result = { summary: { orders: number; salesCount: number; salesAmount: string; clients: number }; orders: Order[]; clients: Client[]; canSeeClients: boolean; error?: string };
type Grouping = 'day' | 'week' | 'month' | 'year';
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftYear = (date: Date, years: number) => { const next = new Date(date); next.setFullYear(next.getFullYear() + years); return next; };

export default function BusinessActivityExplorer({ currency = 'XAF', timezone = 'Africa/Brazzaville' }: { currency?: string; timezone?: string }) {
  const today = dateKey(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('day');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const earliest = dateKey(shiftYear(new Date(), -99));
  const money = useCallback((amount: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(amount) || 0), [currency]);

  const search = useCallback(async () => {
    if (!from || !to || from > to) { setError('Vérifiez les dates de la période.'); return; }
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ from, to, q: query });
      const response = await fetch(`/api/dashboard/activity-search?${params}`);
      const payload = await response.json().catch(() => null) as Result | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? 'Recherche indisponible.');
      setResult(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Recherche indisponible.'); }
    finally { setBusy(false); }
  }, [from, to, query]);

  useEffect(() => { const timer = window.setTimeout(() => { void search(); }, 250); return () => window.clearTimeout(timer); }, [search]);

  const buckets = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of result?.orders ?? []) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(order.createdAt));
      const y = parts.find((part) => part.type === 'year')?.value ?? '0000';
      const m = parts.find((part) => part.type === 'month')?.value ?? '01';
      const d = parts.find((part) => part.type === 'day')?.value ?? '01';
      let key = `${y}-${m}-${d}`;
      if (grouping === 'week') { const monday = new Date(`${key}T12:00:00Z`); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); key = monday.toISOString().slice(0, 10); }
      else if (grouping === 'month') key = `${y}-${m}`;
      else if (grouping === 'year') key = y;
      map.set(key, [...(map.get(key) ?? []), order]);
    }
    return [...map.entries()];
  }, [result, grouping, timezone]);

  function quickRange(value: Grouping | '99years') {
    const end = new Date();
    let start = new Date(end);
    if (value === 'day') start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (value === 'week') { start = new Date(end.getFullYear(), end.getMonth(), end.getDate()); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); }
    if (value === 'month') start = new Date(end.getFullYear(), end.getMonth(), 1);
    if (value === 'year') start = new Date(end.getFullYear(), 0, 1);
    if (value === '99years') start = shiftYear(end, -99);
    setFrom(dateKey(start)); setTo(dateKey(end));
    if (value !== '99years') setGrouping(value);
    else setGrouping('year');
  }

  function bucketTitle(key: string) {
    if (grouping === 'year') return key;
    const date = new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00Z`);
    if (grouping === 'week') return `Semaine du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: timezone }).format(date)}`;
    if (grouping === 'month') return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: timezone }).format(date);
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: timezone }).format(date);
  }

  return <section className={styles.explorer}>
    <header className={styles.heading}><span><Activity size={18} /></span><div><p>RECHERCHE D’ACTIVITÉ</p><h2>Commandes, ventes et clients</h2><small>Retrouvez les opérations par référence, client ou période (jusqu’à 99 ans).</small></div></header>
    <div className={styles.controls}>
      <label>Du<input type="date" min={earliest} max={today} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Au<input type="date" min={earliest} max={today} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label className={styles.search}><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="N° commande, nom du client…" /></label>
      <button type="button" onClick={() => void search()} disabled={busy}><CalendarDays size={15} />{busy ? 'Recherche…' : 'Rechercher'}</button>
    </div>
    <div className={styles.quickRanges}>{(['day', 'week', 'month', 'year', '99years'] as const).map((value) => <button key={value} type="button" onClick={() => quickRange(value)}>{({ day: 'Aujourd’hui', week: 'Cette semaine', month: 'Ce mois', year: 'Cette année', '99years': '99 ans' })[value]}</button>)}<span>Regrouper :</span>{(['day', 'week', 'month', 'year'] as const).map((value) => <button key={value} type="button" className={grouping === value ? styles.active : ''} onClick={() => setGrouping(value)}>{{ day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' }[value]}</button>)}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <>
      <div className={styles.metrics}><article><span>Commandes sur la période</span><strong>{result.summary.orders}</strong></article><article><span>Ventes restaurant servies</span><strong>{money(result.summary.salesAmount)}</strong><small>{result.summary.salesCount} vente(s) servie(s)</small></article><article><span>Clients enregistrés</span><strong>{result.canSeeClients ? result.summary.clients : '—'}</strong></article></div>
      {query && result.canSeeClients && result.clients.length > 0 && <div className={styles.clientResults}><h3>Clients correspondants</h3>{result.clients.map((client) => <div key={client.id}><strong>{client.name}</strong><span>{client.phone ?? 'Téléphone non renseigné'} · inscrit le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: timezone }).format(new Date(client.createdAt))}</span></div>)}</div>}
      {buckets.length > 0 ? <div className={styles.results}>{buckets.map(([key, orders]) => <section key={key}><h3>{bucketTitle(key)} <small>{orders.length} résultat(s) affiché(s)</small></h3>{orders.map((order) => <article key={order.id}><div><strong>{order.number} · {order.guestName}</strong><span>{order.reservation?.reference ? `Séjour ${order.reservation.reference} · ` : ''}{order.room ? `Ch. ${order.room.number} · ` : ''}{order.createdByName} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(order.createdAt))}</span></div><div><b>{money(order.totalAmount)}</b><small>{order.status === 'SERVED' ? 'Servie' : order.status === 'REJECTED' ? 'Refusée' : order.status === 'READY' ? 'Prête' : 'En cours'}{order.paidAt ? ' · Payée' : ''}</small></div></article>)}</section>)}</div> : <p className={styles.empty}>{query ? 'Aucune commande ou fiche client ne correspond à cette recherche.' : 'Aucune commande sur cette période.'}</p>}
      {result.orders.length === 50 && <p className={styles.hint}>50 commandes affichées au maximum. Affinez la période ou la recherche pour réduire la liste.</p>}
    </>}
  </section>;
}
