import { redirect } from 'next/navigation';
import { pageScope, pageSession } from '@/server/auth';
import { hotelConfiguration } from '@/server/hotel';
import ReceptionWorkspace from './workspace';

export const instant = false;

export default async function ReceptionPage() {
  const session = await pageSession();
  if (session.user.platformAdmin) redirect('/super-admin');
  await pageScope('dashboard.view');
  if (session.user.role?.code !== 'RECEPTIONIST') redirect('/acces-refuse');
  const configuration = await hotelConfiguration();
  return (
    <ReceptionWorkspace
      name={session.user.name}
      configuration={configuration}
      account={{
        id: session.user.id,
        email: session.user.email,
        role: session.user.role?.name ?? 'Réceptionniste',
        activeFrom: session.user.lastLoginAt?.toISOString() ?? null,
        createdAt: session.user.createdAt.toISOString(),
      }}
    />
  );
}
