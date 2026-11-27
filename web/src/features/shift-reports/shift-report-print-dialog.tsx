'use client';

import { useEffect } from 'react';
import styles from './shift-report-print-dialog.module.css';
import type { ShiftReport } from './types';

function formatMoney(value: string, _currency: string) {
  void _currency;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF' }).format(Number(value));
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

function shiftLabel(report: ShiftReport) {
  if (report.summary.department === 'BAR_RESTAURANT') return 'Service serveuse · 08 h à 08 h le lendemain';
  return report.shiftType === 'DAY' ? 'Service de jour' : 'Service de nuit';
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
  const stayOperations = summary.stayOperations ?? { checkIns: [], checkOuts: [] };
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
          <div><p>{shiftLabel(report)}</p><h1 id="shift-report-title">{formatDate(report.shiftDate, hotel.timezone)}</h1></div>
          <span className={styles.badge}>{report.summary.department === 'BAR_RESTAURANT' ? '08 H → 08 H' : report.shiftType === 'DAY' ? 'JOUR' : 'NUIT'}</span>
        </section>

        <section className={styles.metadata}>
          <div><span>{summary.department === 'BAR_RESTAURANT' ? 'Serveuse' : 'Réceptionniste'}</span><strong>{report.user.name}</strong></div>
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
          {summary.department !== 'BAR_RESTAURANT' && (stayOperations.checkIns.length > 0 || stayOperations.checkOuts.length > 0) && <table className={styles.table}>
            <thead><tr><th>Operation</th><th>Client / reservation</th><th>Chambre</th><th>Date et heure</th></tr></thead>
            <tbody>
              {stayOperations.checkIns.map((stay, index) => <tr key={`check-in-${stay.reference}-${index}`}><td>Check-in</td><td>{stay.clientName}<small>{stay.reference}</small></td><td>{stay.roomNumber ?? 'Non attribuee'}</td><td>{formatDateTime(stay.recordedAt, hotel.timezone)}</td></tr>)}
              {stayOperations.checkOuts.map((stay, index) => <tr key={`check-out-${stay.reference}-${index}`}><td>Check-out</td><td>{stay.clientName}<small>{stay.reference}</small></td><td>{stay.roomNumber ?? 'Non attribuee'}</td><td>{formatDateTime(stay.recordedAt, hotel.timezone)}</td></tr>)}
            </tbody>
          </table>}
        </section>

        {summary.commissions && <section className={styles.section}>
          <div className={styles.sectionHeading}><span>COM</span><h2>Commissions déduites de la caisse</h2></div>
          <div className={styles.metrics}><div><span>Total des commissions</span><strong>{formatMoney(summary.commissions.total, hotel.currency)}</strong></div><div><span>Nombre</span><strong>{summary.commissions.count}</strong></div><div><span>Enregistrées par</span><strong>{summary.commissions.registeredBy}</strong></div></div>
          {summary.commissions.entries?.length ? <table className={styles.table}>
            <thead><tr><th>Réservation</th><th>Date et heure du retrait</th><th>Montant retiré</th></tr></thead>
            <tbody>{summary.commissions.entries.map((entry, index) => <tr key={`${entry.reservationReference}-${entry.createdAt}-${index}`}><td>{entry.reservationReference}</td><td>{formatDateTime(entry.createdAt, hotel.timezone)}</td><td><strong>{formatMoney(entry.amount, hotel.currency)}</strong></td></tr>)}</tbody>
          </table> : <p className={styles.empty}>Aucun retrait de commission pendant ce service.</p>}
        </section>}

        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>02</span><h2>Clients réservés et factures réglées</h2></div>
          <div className={styles.metrics}>
            <div><span>Réservations enregistrées</span><strong>{summary.reservations?.reservationsCount ?? summary.operations.reservationsCreated}</strong></div>
            <div><span>Clients ayant réservé</span><strong>{summary.reservations?.clientsCount ?? 0}</strong></div>
            <div><span>Clients avec facture payée</span><strong>{summary.reservations?.paidClients ?? 0}</strong></div>
            <div><span>Clients restant à payer</span><strong>{summary.reservations?.unpaidClients ?? 0}</strong></div>
            <div><span>Factures soldées pendant ce service</span><strong>{summary.invoicesSettled?.count ?? 0}</strong></div>
          </div>
          {summary.reservations?.clients.length ? <table className={styles.table}>
            <thead><tr><th>Client / réservation</th><th>Chambre(s)</th><th>Client enregistré par</th><th>Règlement à la clôture</th></tr></thead>
            <tbody>{summary.reservations.clients.map((client) => <tr key={`${client.name}-${client.references.join('-')}`}><td>{client.name}<small>{client.references.join(', ')}</small></td><td>{client.rooms?.join(', ') || 'Non attribuée'}</td><td>{client.registeredBy}</td><td>{client.paymentStatus === 'PAYE' ? 'Payé' : 'Non payé'}</td></tr>)}</tbody>
          </table> : <p className={styles.empty}>Aucun client n’a effectué de réservation pendant ce service.</p>}
          {summary.invoicesSettled?.clients.length ? <>
            <h3>Clients ayant soldé une facture pendant le service</h3>
            <table className={styles.table}>
              <thead><tr><th>Client / facture</th><th>Chambre</th><th>Enregistré par</th><th>Facture réglée à</th></tr></thead>
              <tbody>{summary.invoicesSettled.clients.map((client) => <tr key={client.invoiceNumber}><td>{client.clientName}<small>{client.invoiceNumber} · réservation {client.reference}</small></td><td>{client.roomNumber ?? 'Non attribuée'}</td><td>{client.registeredBy}</td><td>{formatDateTime(client.settledAt, hotel.timezone)}</td></tr>)}</tbody>
            </table>
          </> : <p className={styles.empty}>Aucune ancienne facture n’a été soldée pendant ce service.</p>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>03</span><h2>Encaissements et caisse</h2></div>
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
          <div className={styles.sectionHeading}><span>04</span><h2>Restaurant &amp; service en chambre</h2><strong>{formatMoney(summary.restaurant.total, hotel.currency)}</strong></div>
          <div className={styles.cashGrid}>
            <div><span>{summary.department === 'BAR_RESTAURANT' ? 'Commandes enregistrées' : 'Commandes confirmées par la réception'}</span><strong>{summary.restaurant.ordersCount}</strong></div>
            {summary.restaurant.servedCount !== undefined && <div><span>Commandes servies</span><strong>{summary.restaurant.servedCount}</strong></div>}
            <div><span>Plats et repas</span><strong>{formatMoney(summary.restaurant.foodTotal, hotel.currency)}</strong></div>
            <div><span>Boissons</span><strong>{formatMoney(summary.restaurant.drinkTotal, hotel.currency)}</strong></div>
            <div><span>Petit-dejeuner (chambre / nuit)</span><strong>{formatMoney(summary.restaurant.breakfastTotal, hotel.currency)}</strong></div>
          </div>
        </section>}
        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>{summary.restaurant ? '05' : '04'}</span><h2>Dépenses signalées</h2><strong>{formatMoney(summary.cash.totalExpenses, hotel.currency)}</strong></div>
          {report.expenses.length > 0 ? <table className={styles.table}>
            <thead><tr><th>Désignation</th><th>Moyen de paiement</th><th>Montant</th></tr></thead>
            <tbody>{report.expenses.map((expense) => <tr key={expense.id}><td>{expense.description}</td><td>{expense.paymentMethod.name}</td><td>{formatMoney(expense.amount, hotel.currency)}</td></tr>)}</tbody>
          </table> : <p className={styles.empty}>Aucune dépense signalée sur ce service.</p>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><span>{summary.restaurant ? '06' : '05'}</span><h2>État des chambres</h2></div>
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
        <div className={styles.signatures}><div><span>{summary.department === 'BAR_RESTAURANT' ? 'Serveuse sortante' : 'Réceptionniste sortant'}</span><strong>{report.user.name}</strong></div><div><span>{summary.department === 'BAR_RESTAURANT' ? 'Relève / visa' : 'Réceptionniste entrant / visa'}</span><strong /></div></div>
      </article>
    </section>
  </div>;
}
