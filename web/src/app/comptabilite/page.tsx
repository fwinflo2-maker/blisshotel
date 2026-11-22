import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import { hotelConfiguration } from '@/server/hotel';
import AccountingWorkspace from './workspace';

export const instant = false;

export default async function ComptabilitePage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'ACCOUNTANT') redirect('/acces-refuse');
  await pageScope('accounting.view');
  const configuration = await hotelConfiguration();
  return <AccountingWorkspace name={session.user.name} currency={configuration.currency} />;
}
