'use client';

import { useEffect, useState } from 'react';

export default function ImpersonationBanner() {
  const [details, setDetails] = useState<{ actorName: string; targetName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch('/api/god-mode/assume', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
      if (data.impersonating) setDetails({ actorName: data.actorName, targetName: data.targetName });
    }).catch(() => undefined);
  }, []);
  if (!details) return null;
  async function stop() {
    setBusy(true);
    try {
      const response = await fetch('/api/god-mode/assume/stop', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Impossible de revenir à votre compte.');
      window.location.assign(data.redirectTo);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Erreur.'); setBusy(false); }
  }
  return <aside style={{ position: 'sticky', top: 0, zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '9px 14px', background: '#8a3c32', color: '#fff', fontSize: 13 }}>
    <span>Supervision active : {details.actorName} consulte l’espace de {details.targetName}.</span>
    <button disabled={busy} onClick={() => void stop()} style={{ padding: '6px 10px', border: '1px solid #ffffff80', borderRadius: 6, background: '#fff', color: '#6e2c25', fontWeight: 700, cursor: 'pointer' }}>Revenir à mon compte</button>
  </aside>;
}
