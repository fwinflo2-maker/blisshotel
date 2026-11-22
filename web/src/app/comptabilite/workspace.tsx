'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { Building2, CalendarDays, LogOut, ReceiptText, RefreshCw, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CockpitBars } from '@/components/cockpit-charts';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import './accounting.css';

type AccountingData = {
  summary: { invoicesCount: number; invoicedAmount: string; paymentsCount: number; collectedAmount: string; expensesCount: number; expensesAmount: string; openFoliosCount: number; outstandingBalance: string; closedCashSessions: number; cashVariance: string };
  recentPayments: { id: string; amount: string; reference: string | null; createdAt: string; receivedBy: string; method: string; reservation: string; client: string }[];
  recentExpenses: { id: string; description: string; amount: string; createdAt: string; method: string; shiftType: string; operator: string }[];
  cashSessions: { id: string; openedAt: string; closedAt: string | null; openingAmount: string; expectedCash: string | null; countedAmount: string | null; variance: string | null; user: { name: string } }[];
  modules: { expenses: string; bankReconciliation: string };
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function AccountingWorkspace({ name, currency }: { name: string; currency: string }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const today = dateKey(new Date());
  const monthStart = dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<AccountingData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/accounting/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Chargement impossible.');
      setData(result as AccountingData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setBusy(false);
    }
  }, [from, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const money = (amount: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(amount));
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/connexion');
    router.refresh();
  }
  const summary = data?.summary;
  return <main className="accounting-shell" data-theme={theme}>
    <ProfileLauncher name={name} />
    <header className="accounting-header"><div className="accounting-brand"><span><Building2 size={19} /></span><div><strong>BLISS HÔTEL</strong><small>Espace Comptabilité</small></div></div><div className="accounting-account"><span>{name} · Comptable</span><a href="/pilotage" className="accounting-operations-link">Centre de pilotage</a><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /><button onClick={() => void logout()}><LogOut size={16} />Déconnexion</button></div></header>
    <section className="accounting-content"><div className="accounting-title"><div><p>CONTRÔLE FINANCIER</p><h1>Tableau de bord comptable</h1><span>Consultation des encaissements, factures, soldes et clôtures enregistrés.</span></div><button className="accounting-refresh" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />Actualiser</button></div>
      <form className="accounting-period" onSubmit={(event) => { event.preventDefault(); void load(); }}><CalendarDays size={17} /><label>Du<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label><label>Au<input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></label><button>Appliquer</button></form>
      {error && <div className="accounting-error" role="alert">{error}</div>}{busy && <p className="accounting-loading">Chargement des données…</p>}
      {summary && <><div className="accounting-cards">
        <article><ReceiptText /><span>Factures émises</span><strong>{summary.invoicesCount}</strong><small>{money(summary.invoicedAmount)} facturés sur la période</small></article>
        <article><Wallet /><span>Paiements enregistrés</span><strong>{summary.paymentsCount}</strong><small>{money(summary.collectedAmount)} encaissés sur la période</small></article>
        <article><ReceiptText /><span>Dépenses de service</span><strong>{summary.expensesCount}</strong><small>{money(summary.expensesAmount)} enregistrés par la réception</small></article>
        <article><ReceiptText /><span>Soldes ouverts</span><strong>{summary.openFoliosCount}</strong><small>{money(summary.outstandingBalance)} restant à régler</small></article>
        <article><Wallet /><span>Clôtures de caisse</span><strong>{summary.closedCashSessions}</strong><small>Écart net : {money(summary.cashVariance)}</small></article>
      </div>
      <section className="accounting-panel accounting-chart-panel"><div className="accounting-panel-title"><div><p>LECTURE DES FLUX · PÉRIODE SÉLECTIONNÉE</p><h2>Volumes par nature comptable</h2></div><span>{currency}</span></div><CockpitBars rows={[
        { label: 'Facturation', value: Number(summary.invoicedAmount), color: '#5896d0' },
        { label: 'Encaissements', value: Number(summary.collectedAmount), color: '#4e9d7b' },
        { label: 'Dépenses de service', value: Number(summary.expensesAmount), color: '#c6a878' },
      ]} formatValue={(value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} /><p className="accounting-chart-note">Ces montants représentent des flux distincts. Ils ne sont ni additionnés ni présentés comme un résultat net.</p></section>
      <div className="accounting-grid"><section className="accounting-panel"><div className="accounting-panel-title"><div><p>ENCAISSEMENTS RÉCENTS</p><h2>Paiements de la période</h2></div></div>{data?.recentPayments.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Date</th><th>Client / réservation</th><th>Moyen</th><th>Référence</th><th>Montant</th></tr></thead><tbody>{data.recentPayments.map((payment) => <tr key={payment.id}><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(payment.createdAt))}</td><td>{payment.client}<small>{payment.reservation} · opérateur {payment.receivedBy}</small></td><td>{payment.method}</td><td>{payment.reference ?? '—'}</td><td><strong>{money(payment.amount)}</strong></td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucun paiement enregistré sur cette période.</p>}</section>
      <section className="accounting-panel"><div className="accounting-panel-title"><div><p>CAISSES</p><h2>Clôtures récentes</h2></div></div>{data?.cashSessions.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Clôture</th><th>Comptable / opérateur</th><th>Espèces théoriques</th><th>Comptées</th><th>Écart</th></tr></thead><tbody>{data.cashSessions.map((session) => <tr key={session.id}><td>{session.closedAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.closedAt)) : '—'}</td><td>{session.user.name}</td><td>{session.expectedCash ? money(session.expectedCash) : '—'}</td><td>{session.countedAmount ? money(session.countedAmount) : '—'}</td><td>{session.variance ? money(session.variance) : money('0')}</td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucune clôture pour cette période.</p>}</section></div>
      <section className="accounting-panel"><div className="accounting-panel-title"><div><p>DÉPENSES DE SERVICE</p><h2>Dépenses signalées par la réception</h2></div></div>{data?.recentExpenses.length ? <div className="accounting-table-wrap"><table><thead><tr><th>Date</th><th>Désignation</th><th>Service / opérateur</th><th>Moyen</th><th>Montant</th></tr></thead><tbody>{data.recentExpenses.map((expense) => <tr key={expense.id}><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(expense.createdAt))}</td><td>{expense.description}</td><td>{expense.shiftType === 'DAY' ? 'Jour' : 'Nuit'}<small>{expense.operator}</small></td><td>{expense.method}</td><td><strong>{money(expense.amount)}</strong></td></tr>)}</tbody></table></div> : <p className="accounting-empty">Aucune dépense de service sur cette période.</p>}</section>
      <p className="accounting-note">Les dépenses déclarées à la clôture des services alimentent cette vue comptable et les dépenses en espèces sont déduites du théorique de caisse. Le rapprochement bancaire reste à configurer.</p></>}
    </section>
  </main>;
}
