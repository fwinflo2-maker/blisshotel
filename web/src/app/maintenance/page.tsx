import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import OperationsCenter from '@/features/workspace/operations-center';

export const instant = false;

export default async function MaintenancePage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'MAINTENANCE_MANAGER') redirect('/acces-refuse');
  await pageScope('maintenance.view');
  return <OperationsCenter name={session.user.name} roleCode="MAINTENANCE_MANAGER" />;
}
