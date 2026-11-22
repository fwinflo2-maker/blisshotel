import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import RestaurantWorkspace from '@/features/restaurant/restaurant-workspace';

export const instant = false;

export default async function BarServicePage() {
  const session = await pageSession();
  if (session.user.platformAdmin || session.user.role?.code !== 'BAR_SERVER') redirect('/acces-refuse');
  await pageScope('restaurant.orders.manage');
  return <RestaurantWorkspace name={session.user.name} role="server" />;
}
