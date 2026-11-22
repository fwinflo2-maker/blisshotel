import { platformPageSession } from '@/server/auth';
import SuperAdminWorkspace from './workspace';

export const instant = false;

export default async function SuperAdminPage() {
  const session = await platformPageSession();
  return <SuperAdminWorkspace name={session.user.name} audience="platform" />;
}
