'use client';

import { ClipboardCheck, Users, Wallet } from 'lucide-react';
import styles from './receptionist-performance.module.css';
import { isPerformanceGranularity, type PerformanceGranularity, type ReceptionistPerformance as ReceptionistPerformanceData } from './domain';

const granularityLabels: Record<PerformanceGranularity, string> = {
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
  year: 'Année',
};

function periodLabel(key: string, granularity: PerformanceGranularity) {
  if (granularity === 'year') return key;
  const dateKey = granularity === 'month' ? `${key}-01` : key;
  const date = new Date(`${dateKey}T12:00:00Z`);
  const label = new Intl.DateTimeFormat('fr-FR', granularity === 'month'
    ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  return granularity === 'week' ? `Semaine du ${label}` : label;
}

export default function ReceptionistPerformance({
  data,
  currency,
  timezone,
  theme,
  granularity,
  onGranularityChange,
}: {
  data: ReceptionistPerformanceData;
  currency: string;
  timezone: string;
  theme: 'light' | 'dark';
  granularity: PerformanceGranularity;
  onGranularityChange: (value: PerformanceGranularity) => void;
}) {
  const formatMoney = (value: string) => new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
  const formatDateTime = (value: string) => new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));

  return (
    <section className={styles.panel} data-theme={theme}>
      <header className={styles.heading}>
        <div><p>PERFORMANCE DE LA RÉCEPTION</p><h3>Ventes et clients par réceptionniste</h3></div>
        <label className={styles.grouping}>Regrouper par
          <select value={granularity} onChange={(event) => {
            const value = event.currentTarget.value;
            if (isPerformanceGranularity(value)) onGranularityChange(value);
          }}>
            {Object.entries(granularityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </header>
      {data.staff.length ? <>
        <div className={styles.summaryGrid}>
          {data.staff.map((person) => <article className={styles.summary} key={person.id}>
            <h4>{person.name}</h4>
            <div><span><Wallet size={14} />Ventes encaissées</span><strong>{formatMoney(person.sales)}</strong></div>
            <div><span><Users size={14} />Clients enregistrés</span><strong>{person.clientsCreated.toLocaleString('fr-FR')}</strong></div>
            <div><span><ClipboardCheck size={14} />Clôtures de caisse</span><strong>{person.closedSessions.toLocaleString('fr-FR')}</strong></div>
          </article>)}
        </div>
        <div className={styles.tableSection}>
          <h4>Synthèse par {granularityLabels[granularity].toLocaleLowerCase('fr-FR')}</h4>
          <div className={styles.tableWrap}><table>
            <thead><tr><th>Période</th><th>Réceptionniste</th><th>Clients créés</th><th>Clôtures</th><th>Paiements</th><th>Ventes encaissées</th></tr></thead>
            <tbody>{data.staff.flatMap((person) => person.periods.map((period) => <tr key={`${person.id}-${period.key}`}>
              <td>{periodLabel(period.key, granularity)}</td><td>{person.name}</td><td>{period.clientsCreated}</td><td>{period.closedSessions}</td><td>{period.paymentsCount}</td><td><strong>{formatMoney(period.sales)}</strong></td>
            </tr>))}</tbody>
          </table></div>
        </div>
        <div className={styles.tableSection}>
          <h4>Détail des clôtures de caisse</h4>
          <div className={styles.tableWrap}><table>
            <thead><tr><th>Date de clôture</th><th>Réceptionniste</th><th>Service</th><th>Paiements</th><th>Ventes encaissées</th><th>Écart de caisse</th></tr></thead>
            <tbody>{data.staff.flatMap((person) => person.closures.map((closure) => <tr key={closure.id}>
              <td>{formatDateTime(closure.closedAt)}</td><td>{person.name}</td><td>{closure.shiftType === 'DAY' ? 'Jour' : closure.shiftType === 'NIGHT' ? 'Nuit' : '—'}</td><td>{closure.paymentsCount}</td><td><strong>{formatMoney(closure.sales)}</strong></td><td>{closure.variance === null ? '—' : formatMoney(closure.variance)}</td>
            </tr>))}</tbody>
          </table></div>
          {data.staff.every((person) => person.closures.length === 0) && <p className={styles.empty}>Aucune clôture de caisse sur la période sélectionnée.</p>}
        </div>
        <p className={styles.note}>Les ventes correspondent aux paiements rattachés aux caisses clôturées sur la période. Les clients sont comptés selon leur date d’enregistrement et le réceptionniste créateur.</p>
      </> : <p className={styles.empty}>Aucun compte réceptionniste à présenter.</p>}
    </section>
  );
}
