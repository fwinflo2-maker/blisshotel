import { redirect } from 'next/navigation';
import { pageSession } from '@/server/auth';
import OwnerClientRecords from '@/app/proprietaire/owner-client-records';

export const instant = false;

export default async function AccountingClientsPage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'ACCOUNTANT') redirect('/acces-refuse');
  return <main style={{ maxWidth: 1500, margin: '0 auto', padding: 24 }}><a href="/comptabilite">← Retour au tableau comptable</a><h1>Clients et séjours</h1><OwnerClientRecords /></main>;
}
