import { Suspense } from 'react';
import ResetForm from './reset-form';

export default function ResetPage() {
  return (
    <Suspense fallback={<main className="reset-loading" role="status">Vérification du lien sécurisé…</main>}>
      <ResetForm />
    </Suspense>
  );
}
