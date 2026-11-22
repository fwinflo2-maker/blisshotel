import { redirect } from 'next/navigation';
import { pageSession, pageScope } from '@/server/auth';
import OperationsCenter from '@/features/workspace/operations-center';

export const instant = false;

export default async function OperationsPage() {
  const session = await pageSession();
  const roleCode = session.user.platformAdmin ? 'SUPER_ADMIN' : session.user.role?.code;
  if (!roleCode) redirect('/acces-refuse');
  if (roleCode === 'SUPER_ADMIN') redirect('/super-admin');
  if (roleCode === 'OWNER') redirect('/proprietaire');
  if (roleCode === 'GENERAL_MANAGER') redirect('/direction');
  if (roleCode === 'HOTEL_ADMIN') redirect('/admin-hotel');
  if (!session.user.platformAdmin) await pageScope('dashboard.view');
  return <OperationsCenter name={session.user.name} roleCode={roleCode} />;
}
