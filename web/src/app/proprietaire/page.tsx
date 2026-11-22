import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import SuperAdminWorkspace from '../super-admin/workspace';

export const instant = false;

/** Hotel-management workspace for the OWNER role. It never grants platform.manage. */
export default async function ProprietairePage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'OWNER') redirect('/acces-refuse');
  await pageScope('users.manage');
  return <SuperAdminWorkspace name={session.user.name} audience="owner" />;
}
