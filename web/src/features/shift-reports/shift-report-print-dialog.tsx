'use client';

import { useEffect } from 'react';
import styles from './shift-report-print-dialog.module.css';
import type { ShiftReport } from './types';

function formatMoney(value: string, currency: string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(value));
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: timezone })
    .format(new Date(`${value}T12:00:00Z`));
}

function shiftLabel(type: ShiftReport['shiftType']) {
  return type === 'DAY' ? 'Service de jour' : 'Service de nuit';
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    AVAILABLE: 'Disponible',
    OCCUPIED: 'Occupée',
    DIRTY: 'À nettoyer',
    OUT_OF_SERVICE: 'Hors service',
    CLEAN: 'Propre',
    TO_CLEAN: 'À nettoyer',
    IN_PROGRESS: 'En cours',
    TO_INSPECT: 'À inspecter',
    PENDING: 'En attente',
    CONFIRMED: 'Confirmée',
    CHECKED_IN: 'En séjour',
    CHECKED_OUT: 'Clôturée',
  };
  return labels[value] ?? value;
}

export default function ShiftReportPrintDialog({
  report,
  hotel,
  close,
}: {
  report: ShiftReport;
  hotel: { name: string; currency: string; timezone: string };
  close: () => void;
}) {
  useEffect(() => {
    document.body.dataset.printShiftReport = 'true';
    return () => { delete document.body.dataset.printShiftReport; };
  }, []);

  const summary = report.summary;
  const generatedAt = formatDateTime(report.createdAt, hotel.timezone);
  return <div className={styles.backdrop}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="shift-report-title">
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={close}>Fermer</button>
        <p>Dans la boîte d’impression, choisissez « Enregistrer au format PDF ».</p>
        <button type="button" className={styles.primary} onClick={() => window.print()}>Générer le PDF</button>
      </div>
      <article className={styles.document} data-shift-report-print>
        <header className={styles.header}>
          <div className={styles.brand}>
            <img className={styles.brandLogo} src="/logo.png" alt="Logo Bliss Hôtel" onError={(event) => { event.currentTarget.hidden = true; }} />
            <div><span>{hotel.name || 'BLISS HÔTEL'}</span><small>RAPPORT DE FIN DE SERVICE</small></div>
          </div>
          <div className={styles.reference}><span>Rapport n°</span><strong>{report.id.slice(-10).toUpperCase()}</strong><small>Édité le {generatedAt}</small></div>
        </header>

        <section className={styles.title}>
          <div><p>{shiftLabel(report.shiftType)}</p><h1 id="shift-report-title">{formatDate(report.shiftDate, hotel.timezone)}</h1></div>
          <span className={styles.badge}>{report.shiftType === 'DAY' ? 'JOUR' : 'NUIT'}</span>
        </section>

        <section className={styles.metadata}>
          <div><span>Réceptionniste</span><strong>{report.user.name}</strong></div>
          <div><span>Début du service</span><strong>{formatDateTime(report.startedAt, hotel.timezone)}</strong></div>
          <div><span>Fin du service</span><strong>{formatDateTime(report.endedAt, hotel.timezone)}</strong></div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>01</span><h2>Activité opérationnelle</h2></div>
          <div className={styles.metrics}>
            <div><span>Réservations créées</span><strong>{summary.operations.reservationsCreated}</strong></div>
            <div><span>Confirmations</span><strong>{summary.operations.reservationsConfirmed}</strong></div>
            <div><span>Annulations</span><strong>{summary.operations.reservationsCancelled}</strong></div>
            <div><span>Arrivées enregistrées</span><strong>{summary.operations.checkIns}</strong></div>
            <div><span>Départs enregistrés</span><strong>{summary.operations.checkOuts}</strong></div>
            <div><span>Folio(s) ouvert(s)</span><strong>{summary.openFolios.count}</strong><small>Solde ouvert : {formatMoney(summary.openFolios.balance, hotel.currency)}</small></div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>02</span><h2>Encaissements et caisse</h2></div>
          <div className={styles.cashGrid}>
            <div><span>Paiements enregistrés</span><strong>{summary.payments.count} · {formatMoney(summary.payments.total, hotel.currency)}</strong></div>
            <div><span>Fonds initial</span><strong>{formatMoney(summary.cash.openingAmount, hotel.currency)}</strong></div>
            <div><span>Recettes en espèces</span><strong>{formatMoney(summary.cash.cashReceived, hotel.currency)}</strong></div>
            <div><span>Dépenses en espèces</span><strong>− {formatMoney(summary.cash.cashExpenses, hotel.currency)}</strong></div>
            <div><span>Espèces théoriques</span><strong>{formatMoney(summary.cash.expectedCash, hotel.currency)}</strong></div>
            <div><span>Espèces comptées</span><strong>{formatMoney(summary.cash.countedAmount, hotel.currency)}</strong></div>
            <div className={styles.variance}><span>Écart de caisse</span><strong>{formatMoney(summary.cash.variance, hotel.currency)}</strong></div>
          </div>
          {summary.payments.byMethod.length > 0 && <div className={styles.methodList}>
            {summary.payments.byMethod.map((method) => <div key={method.code}><span>{method.name}</span><strong>{formatMoney(method.amount, hotel.currency)}</strong></div>)}
          </div>}
        </section>

        {summary.restaurant && <section className={styles.section}>
          <div className={styles.sectionHeading}><span>03</span><h2>Restaurant &amp; service en chambre</h2><strong>{formatMoney(summary.restaurant.total, hotel.currency)}</strong></div>
          <div className={styles.cashGrid}>
            <div><span>Commandes confirmees par la reception</span><strong>{summary.restaurant.ordersCount}</strong></div>
            <div><span>Plats et repas</span><strong>{formatMoney(summary.restaurant.foodTotal, hotel.currency)}</strong></div>
            <div><span>Boissons</span><strong>{formatMoney(summary.restaurant.drinkTotal, hotel.currency)}</strong></div>
            <div><span>Petit-dejeuner (chambre / nuit)</span><strong>{formatMoney(summary.restaurant.breakfastTotal, hotel.currency)}</strong></div>
          </div>
        </section>}
        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>{summary.restaurant ? '04' : '03'}</span><h2>Dépenses signalées</h2><strong>{formatMoney(summary.cash.totalExpenses, hotel.currency)}</strong></div>
          {report.expenses.length > 0 ? <table className={styles.table}>
            <thead><tr><th>Désignation</th><th>Moyen de paiement</th><th>Montant</th></tr></thead>
            <tbody>{report.expenses.map((expense) => <tr key={expense.id}><td>{expense.description}</td><td>{expense.paymentMethod.name}</td><td>{formatMoney(expense.amount, hotel.currency)}</td></tr>)}</tbody>
          </table> : <p className={styles.empty}>Aucune dépense signalée sur ce service.</p>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>{summary.restaurant ? '05' : '04'}</span><h2>État des chambres</h2></div>
          <div className={styles.statusColumns}>
            <div><h3>État opérationnel</h3>{summary.rooms.status.map((item) => <p key={item.status}><span>{statusLabel(item.status)}</span><strong>{item.count}</strong></p>)}</div>
            <div><h3>Service d’entretien</h3>{summary.rooms.housekeeping.map((item) => <p key={item.status}><span>{statusLabel(item.status)}</span><strong>{item.count}</strong></p>)}</div>
          </div>
        </section>

        {report.incidentNotes && <section className={styles.notes}><h2>Incidents et observations</h2><p>{report.incidentNotes}</p></section>}
        {report.handoverNotes && <section className={styles.notes}><h2>Consignes à la relève</h2><p>{report.handoverNotes}</p></section>}

        <footer className={styles.footer}>
          <span>Document généré depuis le système de gestion BLISS HÔTEL.</span>
          <span>Rapport enregistré le {generatedAt}</span>
        </footer>
        <div className={styles.signatures}><div><span>Réceptionniste sortant</span><strong>{report.user.name}</strong></div><div><span>Réceptionniste entrant / visa</span><strong /></div></div>
      </article>
    </section>
  </div>;
}