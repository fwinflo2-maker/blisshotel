import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import AdminHotelWorkspace from './workspace';

export const instant = false;

export default async function AdminHotelPage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'HOTEL_ADMIN') redirect('/acces-refuse');
  const scope = await pageScope('dashboard.view');
  return <AdminHotelWorkspace name={session.user.name} permissions={scope.permissions} />;
}
