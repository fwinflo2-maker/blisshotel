'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

/** Bouton de déconnexion pour les pages sans barre de navigation (ex. accès refusé). */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('La déconnexion n’a pas abouti. Réessayez.');
      router.push('/connexion');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La déconnexion a échoué.');
      setBusy(false);
    }
  }

  return <>
    <button type="button" className={className} onClick={() => void logout()} disabled={busy}>
      <LogOut size={15} />{busy ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
    {error && <span role="alert">{error}</span>}
  </>;
}
