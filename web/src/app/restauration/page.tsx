import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import RestaurantWorkspace from '@/features/restaurant/restaurant-workspace';

export const instant = false;

export default async function RestaurantPage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  if (session.user.role?.code !== 'RESTAURANT_MANAGER') redirect('/acces-refuse');
  await pageScope('dashboard.view');
  return <RestaurantWorkspace name={session.user.name} role="manager" />;
}
