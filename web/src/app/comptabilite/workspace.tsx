'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { Banknote, Building2, CalendarDays, ChartNoAxesCombined, Download, LayoutDashboard, LogOut, PackageOpen, Printer, ReceiptText, RefreshCw, Utensils, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CockpitBars } from '@/components/cockpit-charts';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import { RevenueTrendChart, type TrendPoint } from '@/components/dashboard-charts';
import OwnerClientRecords from '@/app/proprietaire/owner-client-records';
import BusinessActivityExplorer from '@/components/business-activity-explorer';
import './accounting.css';

type AccountingData = {
  trends: TrendPoint[];
  summary: { invoicesCount: number; invoicedAmount: string; paymentsCount: number; collectedAmount: string; expensesCount: number; expensesAmount: string; openFoliosCount: number; outstandingBalance: string; receivablesAging: { count: number; amount: string }[]; closedCashSessions: number; cashVariance: string; commissions: { total: string; count: number; byReceptionist: { name: string; amount: string }[] } };
  frontDeskActivity: { action: string; at: string; receptionist: string; reservationId: string | null }[];
  recentPayments: { id: string; amount: string; reference: string | null; createdAt: string; receivedBy: string; method: string; reservation: string; client: string }[];
  recentExpenses: { id: string; description: string; amount: string; createdAt: string; method: string; shiftType: string; operator: string }[];
  cashSessions: { id: string; openedAt: string; closedAt: string | null; shiftType: 'DAY' | 'NIGHT' | null; shiftStartedAt: string | null; shiftEndedAt: string | null; openingAmount: string; expectedCash: string | null; countedAmount: string | null; variance: string | null; user: { name: string } }[];
  modules: { expenses: string; bankReconciliation: string };
  restaurant: { orderCount: number; servedCount: number; breakfastAssociations: { count: number; amount: string }; salesAmount: string; totalOrderAmount: string; lodgedSales: { orders: number; amount: string }; nonLodgedSales: { orders: number; amount: string }; paidAmount: string; salesByServer: { name: string; orders: number; served: number; sales: string; collected: string }[]; orders: { id: string; number: string; guestName: string; status: string; totalAmount: string; createdAt: string; createdByName: string; paidAt: string | null; paidByName: string | null; paymentMethod: { id: string; code: string; name: string } | null; room: string | null; lines: { name: string; quantity: number }[] }[]; stock: { id: string; name: string; deleted: boolean; quantity: string | null; unit: string | null; alertAt: string | null; counts: { quantity: string; previousQuantity: string | null; by: string; at: string; note: string | null }[] }[] };
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function AccountingWorkspace({ name }: { name: string }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const today = dateKey(new Date());
  const historyMin = `${Number(today.slice(0, 4)) - 99}${today.slice(4)}`;
  const monthStart = dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<AccountingData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [activeSection, setActiveSection] = useState('accounting-summary');
  const [periodPreset, setPeriodPreset] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('month');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/accounting/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const result = await response.json().catch(() => null) as (AccountingData & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? `Le serveur n’a pas pu charger le tableau de bord (HTTP ${response.status}).`);
      if (!result) throw new Error('Le serveur a renvoyé une réponse invalide pour le tableau de bord.');
      setData(result as AccountingData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setBusy(false);
    }
  }, [from, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const refresh = window.setInterval(() => { void load(); }, 30000);
    return () => { window.clearTimeout(timer); window.clearInterval(refresh); };
  }, [load]);
  const money = (amount: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' }).format(Number(amount));
  const barInventory = data?.restaurant.stock ?? [];
  const currentBarInventory = barInventory.filter((item) => !item.deleted);
  const countedDrinks = currentBarInventory.filter((item) => item.counts.length > 0).length;
  const uncountedDrinks = currentBarInventory.length - countedDrinks;
  const countEntriesTotal = barInventory.reduce((total, item) => total + item.counts.length, 0);
  const inventoryCountEntries = barInventory.flatMap((item) => item.counts.map((count) => ({ item, count }))).sort((a, b) => new Date(b.count.at).getTime() - new Date(a.count.at).getTime());
  const uncountedInventory = currentBarInventory.filter((item) => item.counts.length === 0);
  const lowStockDrinks = currentBarInventory.filter((item) => item.quantity !== null && (Number(item.quantity) <= 0 || (item.alertAt !== null && Number(item.quantity) <= Number(item.alertAt)))).length;
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/connexion');
    router.refresh();
  }
  const summary = data?.summary;
  function setPreset(preset: Exclude<typeof periodPreset, 'custom'>) {
    const end = new Date();
    const start = new Date(end);
    if (preset === 'day') start.setHours(0, 0, 0, 0);
    if (preset === 'week') start.setDate(end.getDate() - ((end.getDay() + 6) % 7));
    if (preset === 'month') start.setDate(1);
    if (preset === 'year') start.setMonth(0, 1);
    setFrom(dateKey(start)); setTo(dateKey(end)); setPeriodPreset(preset);
  }
  function exportReport() {
    if (!data) return;
    const rows = [
      ['Rapport comptable BLISS HÔTEL', from, to], ['Indicateur', 'Nombre', 'Montant (XAF)'],
      ['Factures émises', String(summary?.invoicesCount ?? 0), summary?.invoicedAmount ?? '0'],
      ['Paiements enregistrés', String(summary?.paymentsCount ?? 0), summary?.collectedAmount ?? '0'],
      ['Dépenses de service', String(summary?.expensesCount ?? 0), summary?.expensesAmount ?? '0'],
      ['Folios ouverts', String(summary?.openFoliosCount ?? 0), summary?.outstandingBalance ?? '0'],
      ['Écart des caisses clôturées', String(summary?.closedCashSessions ?? 0), summary?.cashVariance ?? '0'],
      ...((summary?.receivablesAging ?? []).map((item, index) => [`Créances ${['0–30 jours', '31–60 jours', '61–90 jours', '+ de 90 jours'][index]}`, String(item.count), item.amount])),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `rapport-comptable-bliss-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="accounting-shell" data-theme={theme}>
    <header className="accounting-header"><div className="accounting-brand"><span><Building2 size={19} /></span><div><strong>BLISS HÔTEL</strong><small>Espace Comptabilité</small></div></div><div className="accounting-account"><span>{name} · Comptable</span><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /></div></header>
    <div className="accounting-layout">
     <aside className="accounting-sidebar"><p className="accounting-sidebar-label">ESPACE COMPTABLE</p><nav className="accounting-sidebar-nav" aria-label="Navigation comptable">
       <a className={activeSection === 'accounting-summary' ? 'is-current' : ''} href="#accounting-summary" onClick={() => setActiveSection('accounting-summary')}><LayoutDashboard size={17} /><span>Vue d’ensemble</span></a>
       <a className={activeSection === 'accounting-receivables' ? 'is-current' : ''} href="#accounting-receivables" onClick={() => setActiveSection('accounting-receivables')}><ChartNoAxesCombined size={17} /><span>Créances clients</span></a>
       <a className={activeSection === 'accounting-payments' ? 'is-current' : ''} href="#accounting-payments" onClick={() => setActiveSection('accounting-payments')}><Banknote size={17} /><span>Paiements & caisses</span></a>
       <a className={activeSection === 'accounting-expenses' ? 'is-current' : ''} href="#accounting-expenses" onClick={() => setActiveSection('accounting-expenses')}><ReceiptText size={17} /><span>Dépenses</span></a>
       <a className={activeSection === 'accounting-restaurant' ? 'is-current' : ''} href="#accounting-restaurant" onClick={() => setActiveSection('accounting-restaurant')}><Utensils size={17} /><span>Bar & restaurant</span></a>
       <a className={activeSection === 'bar-inventory' ? 'is-current' : ''} href="#bar-inventory" onClick={() => setActiveSection('bar-inventory')}><PackageOpen size={17} /><span>Inventaire</span></a>
       <a className={activeSection === 'accounting-clients' ? 'is-current' : ''} href="#accounting-clients" onClick={() => setActiveSection('accounting-clients')}><Building2 size={17} /><span>Clients et séjours</span></a>
     </nav><div className="accounting-sidebar-user"><span className="accounting-sidebar-user-name">{name}<small>Comptable</small></span><ProfileLauncher name={name} className="accounting-profile-launcher" /><button className="accounting-sidebar-logout" onClick={() => void logout()}><LogOut size={16} /><span>Déconnexion</span></button></div><div className="accounting-sidebar-footer"><span className="accounting-status-dot" />Données actualisées à la demande</div></aside>
     <section className="accounting-content"><div className="accounting-title"><div><p>CONTRÔLE FINANCIER</p><h1>Tableau de bord comptable</h1><span>Consultation des encaissements, factures, soldes et clôtures enregistrés.</span></div><div className="accounting-actions"><button className="accounting-refresh" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />Actualiser</button><button className="accounting-refresh" onClick={exportReport} disabled={!data}><Download size={15} />Exporter CSV</button><button className="accounting-refresh" onClick={() => window.print()} disabled={!data}><Printer size={15} />Imprimer</button></div></div>
      <div className="accounting-presets" aria-label="Périodes rapides">{([['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']] as const).map(([value, label]) => <button type="button" key={value} className={periodPreset === value ? 'is-active' : ''} onClick={() => setPreset(value)}>{label}</button>)}</div><form className="accounting-period" onSubmit={(event) => { event.preventDefault(); void load(); }}><CalendarDays size={17} /><label>Du<input type="date" min={historyMin} max={today} value={from} onChange={(event) => { setFrom(event.target.value); setPeriodPreset('custom'); }} required /></label><label>Au<input type="date" min={historyMin} max={today} value={to} onChange={(event) => { setTo(event.target.value); setPeriodPreset('custom'); }} required /></label><button>Appliquer</button></form>
      {error && <div className="accounting-error" role="alert">{error}</div>}{busy && <p className="accounting-loading">Chargement des données…</p>}
       {summary && <><BusinessActivityExplorer /><div id="accounting-summary" className="accounting-cards">
        <article><ReceiptText /><span>Factures émises</span><strong>{summary.invoicesCount}</strong><small>{money(summary.invoicedAmount)} facturés sur la période</small></article>
        <article><Wallet /><span>Paiements enregistrés</span><strong>{summary.paymentsCount}</strong><small>{money(summary.collectedAmount)} encaissés sur la période</small></article>
        <article><ReceiptText /><span>Dépenses de service</span><strong>{summary.expensesCount}</strong><small>{money(summary.expensesAmount)} enregistrés par la réception</small></article>
        <article><ReceiptText /><span>Soldes ouverts</span><strong>{summary.openFoliosCount}</strong><small>{money(summary.outstandingBalance)} restant à régler</small></article>
        <article><Wallet /><span>Clôtures de caisse</span><strong>{summary.closedCashSessions}</strong><small>Écart net : {money(summary.cashVariance)}</small></article>
        <article><Wallet /><span>Commissions de réception</span><strong>{money(summary.commissions.total)}</strong><small>{summary.commissions.count} commission(s) · sortie de caisse</small></article>
       </div>
       <section className="accounting-panel"><div className="accounting-panel-title"><div><p>COMMISSIONS DE RÉCEPTION</p><h2>{money(summary.commissions.total)} · {summary.commissions.count} retrait(s)</h2></div><Wallet size={18} /></div>{summary.commissions.byReceptionist.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Réceptionniste</th><th>Retraits</th></tr></thead><tbody>{summary.commissions.byReceptionist.map((entry) => <tr key={entry.name}><td>{entry.name}</td><td><strong>{money(entry.amount)}</strong></td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucun retrait de commission sur la période sélectionnée.</p>}<p className="accounting-note">Commission déduite une fois par réservation ; elle reste hors facture client.</p></section>
       <div className="accounting-analytics-grid"><section className="accounting-panel accounting-chart-panel"><div className="accounting-panel-title"><div><p>ÉVOLUTION DE L’ACTIVITÉ</p><h2>Hébergement, facturation et bar-restaurant</h2></div><span>{data.trends.length} période(s)</span></div><RevenueTrendChart data={data.trends} currency="XAF" />{data.trends.length === 0 && <p className="accounting-note">Aucune opération sur cette période. Le graphique se remplira avec les prochaines écritures.</p>}</section>
       <section className="accounting-panel accounting-chart-panel"><div className="accounting-panel-title"><div><p>LECTURE DES FLUX · PÉRIODE SÉLECTIONNÉE</p><h2>Volumes par nature comptable</h2></div><span>XAF</span></div><CockpitBars rows={[
        { label: 'Facturation', value: Number(summary.invoicedAmount), color: '#5896d0' },
        { label: 'Encaissements', value: Number(summary.collectedAmount), color: '#4e9d7b' },
        { label: 'Dépenses de service', value: Number(summary.expensesAmount), color: '#c6a878' },
       ]} formatValue={(value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} /><p className="accounting-chart-note">Ces montants représentent des flux distincts. Ils ne sont ni additionnés ni présentés comme un résultat net.</p></section></div>
       <section id="accounting-receivables" className="accounting-panel accounting-aging"><div className="accounting-panel-title"><div><p>CRÉANCES CLIENTS · PHOTO À DATE</p><h2>Ancienneté des soldes ouverts</h2></div><span>Calculée depuis la date de facture</span></div><div className="accounting-aging-grid">{(summary.receivablesAging ?? []).map((bucket, index) => <article key={index}><span>{['0–30 jours', '31–60 jours', '61–90 jours', 'Plus de 90 jours'][index]}</span><strong>{money(bucket.amount)}</strong><small>{bucket.count} folio(s)</small></article>)}</div><p className="accounting-note">Le vieillissement est calculé depuis la date d’émission de la facture (ou la création du folio si aucune facture n’est émise). Il ne constitue pas un échéancier contractuel : aucune date d’échéance n’est enregistrée.</p></section><div id="accounting-payments" className="accounting-grid"><section className="accounting-panel"><div className="accounting-panel-title"><div><p>ENCAISSEMENTS RÉCENTS</p><h2>Paiements de la période</h2></div></div>{data.recentPayments.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Date</th><th>Client / réservation</th><th>Moyen</th><th>Référence</th><th>Montant</th></tr></thead><tbody>{data.recentPayments.map((payment) => <tr key={payment.id}><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(payment.createdAt))}</td><td>{payment.client}<small>{payment.reservation} · opérateur {payment.receivedBy}</small></td><td>{payment.method}</td><td>{payment.reference ?? '—'}</td><td><strong>{money(payment.amount)}</strong></td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucun paiement enregistré sur cette période.</p>}</section>
       <section className="accounting-panel"><div className="accounting-panel-title"><div><p>CAISSES</p><h2>Clôtures récentes</h2></div></div>{data.cashSessions.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Clôture</th><th>Service / horaires</th><th>Comptable / opérateur</th><th>Espèces théoriques</th><th>Comptées</th><th>Écart</th></tr></thead><tbody>{data.cashSessions.map((session) => <tr key={session.id}><td>{session.closedAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.closedAt)) : '—'}</td><td>{session.shiftType === 'NIGHT' ? 'Nuit' : session.shiftType === 'DAY' ? 'Jour' : '\u2014'}{session.shiftStartedAt && session.shiftEndedAt && <small>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.shiftStartedAt))} - {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.shiftEndedAt))}</small>}</td><td>{session.user.name}</td><td>{session.expectedCash ? money(session.expectedCash) : '—'}</td><td>{session.countedAmount ? money(session.countedAmount) : '—'}</td><td>{session.variance ? money(session.variance) : money('0')}</td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucune clôture pour cette période.</p>}</section></div>
       <section id="accounting-expenses" className="accounting-panel"><div className="accounting-panel-title"><div><p>DÉPENSES DE SERVICE</p><h2>Dépenses signalées par la réception</h2></div></div>{data.recentExpenses.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Date</th><th>Désignation</th><th>Service / opérateur</th><th>Moyen</th><th>Montant</th></tr></thead><tbody>{data.recentExpenses.map((expense) => <tr key={expense.id}><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(expense.createdAt))}</td><td>{expense.description}</td><td>{expense.shiftType === 'DAY' ? 'Jour' : 'Nuit'}<small>{expense.operator}</small></td><td>{expense.method}</td><td><strong>{money(expense.amount)}</strong></td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucune dépense de service sur cette période.</p>}</section>
       <section id="accounting-restaurant" className="accounting-panel"><div className="accounting-panel-title"><div><p>BAR & RESTAURANT · CALCULS DE LA PÉRIODE</p><h2>Ventes, encaissements et clientèle</h2></div><a className="accounting-refresh accounting-inventory-jump" href="#bar-inventory" onClick={() => setActiveSection("bar-inventory")}><PackageOpen size={15} />Inventaire quotidien</a></div><div className="accounting-restaurant-summary"><div><span>Commandes servies</span><strong>{data.restaurant.servedCount} · {money(data.restaurant.salesAmount)}</strong></div><div><span>Ventes non rejetées</span><strong>{data.restaurant.orderCount} · {money(data.restaurant.totalOrderAmount)}</strong></div><div><span>Clients logés · ventes servies</span><strong>{data.restaurant.lodgedSales.orders} · {money(data.restaurant.lodgedSales.amount)}</strong></div><div><span>Clients non logés · ventes servies</span><strong>{data.restaurant.nonLodgedSales.orders} · {money(data.restaurant.nonLodgedSales.amount)}</strong></div><div><span>Encaissements directs</span><strong>{money(data.restaurant.paidAmount)}</strong></div></div><p>Les ventes du restaurant sont séparées des montants facturés et encaissés pour éviter tout double comptage avec les folios des clients logés.</p>{data.restaurant.salesByServer.length > 0 && <div className="accounting-table-wrap"><table><thead><tr><th>Serveuse</th><th>Commandes</th><th>Servies</th><th>Ventes servies</th><th>Encaissements directs</th></tr></thead><tbody>{data.restaurant.salesByServer.map((server) => <tr key={server.name}><td>{server.name}</td><td>{server.orders}</td><td>{server.served}</td><td>{money(server.sales)}</td><td>{money(server.collected)}</td></tr>)}</tbody></table></div>}{data.restaurant.orders.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Date</th><th>Commande / client</th><th>Articles</th><th>Serveuse</th><th>Statut / paiement</th><th>Montant</th></tr></thead><tbody>{data.restaurant.orders.map((order) => <tr key={order.id}><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.createdAt))}</td><td>{order.number} · {order.guestName}<small>{order.room ? `Chambre ${order.room}` : 'Client non logé'}</small></td><td>{order.lines.map((line) => `${line.name} × ${line.quantity}`).join(', ')}</td><td>{order.createdByName}</td><td>{order.status}{order.paidAt && <small>Payé par {order.paidByName} · {order.paymentMethod?.name}</small>}</td><td><strong>{money(order.totalAmount)}</strong></td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucune commande restaurant sur cette période.</p>}</section>
      <section id="bar-inventory" className="accounting-panel accounting-inventory-panel"><div className="accounting-panel-title"><div><p>INVENTAIRE BAR · PÉRIODE SÉLECTIONNÉE</p><h2>Comptages quotidiens des boissons</h2></div><PackageOpen size={19} /></div>
        {barInventory.length ? <>
          <div className="accounting-inventory-summary"><div><span>Boissons au catalogue</span><strong>{currentBarInventory.length}</strong></div><div className={lowStockDrinks ? 'has-alert' : ''}><span>Stock faible actuellement</span><strong>{lowStockDrinks}</strong></div><div><span>Comptages enregistrés</span><strong>{countEntriesTotal}</strong></div><div className={uncountedDrinks ? 'has-alert' : ''}><span>Sans comptage sur la période</span><strong>{uncountedDrinks}</strong></div></div>
          <p className="accounting-inventory-caption">La période suit les dates sélectionnées en haut du tableau de bord. Chaque ligne correspond à un comptage, avec l’écart entre le stock précédent et le relevé physique.</p>
          <div className="accounting-table-wrap"><table><thead><tr><th>Date et heure</th><th>Boisson</th><th>Stock compté</th><th>Écart vs précédent</th><th>Compté par</th><th>Observation</th></tr></thead><tbody>{inventoryCountEntries.map(({ item, count }) => {
            const quantity = Number(count.quantity);
            const previous = count.previousQuantity === null ? null : Number(count.previousQuantity);
            const difference = previous === null ? null : quantity - previous;
            const state = quantity <= 0 ? 'empty' : item.alertAt !== null && quantity <= Number(item.alertAt) ? 'low' : 'available';
            const label = state === 'empty' ? 'Épuisé' : state === 'low' ? 'Stock faible' : 'Compté';
            return <tr key={`${item.id}-${count.at}`}><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(count.at))}</td><td><strong>{item.name}</strong>{item.deleted && <small>Produit supprimé de la carte</small>}<small>Seuil : {item.alertAt === null ? '—' : `${item.alertAt} ${item.unit ?? ''}`}</small></td><td><strong>{count.quantity} {item.unit ?? ''}</strong><small><span className={`accounting-stock-status is-${state}`}>{label}</span></small></td><td>{difference === null ? 'Référence initiale' : <strong className={difference < 0 ? 'accounting-variance-negative' : difference > 0 ? 'accounting-variance-positive' : ''}>{difference > 0 ? '+' : ''}{difference.toFixed(2)} {item.unit ?? ''}</strong>}</td><td>{count.by}</td><td>{count.note ?? '—'}</td></tr>;
          })}{uncountedInventory.map((item) => <tr key={`${item.id}-uncounted`}><td>—</td><td><strong>{item.name}</strong><small>Seuil : {item.alertAt === null ? '—' : `${item.alertAt} ${item.unit ?? ''}`}</small></td><td>—</td><td>—</td><td><span className="accounting-stock-status is-uncounted">Non compté sur la période</span></td><td>—</td></tr>)}</tbody></table></div>
        </> : <p className="accounting-empty">Aucune boisson n’est enregistrée dans la carte du bar-restaurant.</p>}
      </section>
      <p className="accounting-note">Les dépenses déclarées à la clôture des services alimentent cette vue comptable et les dépenses en espèces sont déduites du théorique de caisse. Le rapprochement bancaire reste à configurer.</p></>}
      <section id="accounting-clients" className="accounting-panel accounting-clients-panel"><div className="accounting-panel-title"><div><p>FICHES CLIENTS & HISTORIQUE</p><h2>Clients et séjours</h2></div><Building2 size={19} /></div><OwnerClientRecords /></section>
     </section>
    </div>
  </main>;
}
