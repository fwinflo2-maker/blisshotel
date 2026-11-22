import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import HousekeepingWorkspace from './workspace';

export const instant = false;

export default async function HousekeepingPage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  const roleCode = session.user.role?.code;
  if (roleCode !== 'HOUSEKEEPER' && roleCode !== 'GOUVERNANTE') redirect('/acces-refuse');
  await pageScope(roleCode === 'GOUVERNANTE' ? 'housekeeping.tasks.assign' : 'housekeeping.tasks.execute');
  return <HousekeepingWorkspace name={session.user.name} role={roleCode} />;
}
