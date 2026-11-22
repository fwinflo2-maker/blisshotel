import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import DirectionWorkspace from './workspace';

export const instant = false;

export default async function DirectionPage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'GENERAL_MANAGER') redirect('/acces-refuse');
  await pageScope('dashboard.view');
  return <DirectionWorkspace name={session.user.name} />;
}
