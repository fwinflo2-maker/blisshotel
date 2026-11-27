'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, X } from 'lucide-react';
import styles from './profile-settings.module.css';

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? `La requête a échoué (HTTP ${response.status}).`);
}

/** Prénom = premier mot, nom = le reste (le compte stocke « Prénom Nom »). */
function splitName(name: string) {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

/** Forms for editing the signed-in user's name, then password. */
export function ProfileForms({ name, only }: { name: string; only?: 'name' | 'password' }) {
  const router = useRouter();
  const initial = splitName(name);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNameMsg(null);
    try {
      await send('/api/profile', 'PATCH', { firstName, lastName });
      setNameMsg({ ok: true, text: 'Nom et prénom mis à jour.' });
      router.refresh();
    } catch (reason) {
      setNameMsg({ ok: false, text: reason instanceof Error ? reason.message : 'Modification impossible.' });
    } finally { setBusy(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm('Modifier votre mot de passe ? Toutes vos sessions seront déconnectées.')) return;
    setBusy(true); setPwdMsg(null);
    try {
      await send('/api/reception/profile/password', 'POST', passwords);
      setPwdMsg({ ok: true, text: 'Mot de passe modifié. Reconnexion…' });
      window.setTimeout(() => { router.push('/connexion'); router.refresh(); }, 800);
    } catch (reason) {
      setPwdMsg({ ok: false, text: reason instanceof Error ? reason.message : 'Modification impossible.' });
      setBusy(false);
    }
  }

  return <div className={styles.forms}>
    {only !== 'password' && <form className={styles.card} onSubmit={saveName}>
      <h3>Mes informations</h3>
      <label><span>Prénom</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={78} required autoComplete="given-name" /></label>
      <label><span>Nom</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={78} required autoComplete="family-name" /></label>
      <button disabled={busy}>Enregistrer</button>
      {nameMsg && <p className={nameMsg.ok ? styles.ok : styles.err} role="status">{nameMsg.text}</p>}
    </form>}
    {only !== 'name' && <form className={styles.card} onSubmit={savePassword}>
      <h3>Changer mon mot de passe</h3>
      <label><span>Mot de passe actuel</span><input type="password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} minLength={8} maxLength={128} required autoComplete="current-password" /></label>
      <label><span>Nouveau mot de passe (12 caractères min.)</span><input type="password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} minLength={12} maxLength={128} required autoComplete="new-password" /></label>
      <button disabled={busy}>Modifier le mot de passe</button>
      <p className={styles.note}>Toutes les sessions seront déconnectées après le changement.</p>
      {pwdMsg && <p className={pwdMsg.ok ? styles.ok : styles.err} role="status">{pwdMsg.text}</p>}
    </form>}
  </div>;
}

/** « Mon profil » button opening the profile dialog from the dashboard navigation. */
export function ProfileLauncher({ name, canEditName = false, className }: { name: string; canEditName?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`${styles.launcher}${className ? ` ${className}` : ''}`} onClick={() => setOpen(true)}><UserRound size={16} />Mon profil</button>
    {open && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Mon profil">
        <div className={styles.head}><h2>Mon profil</h2><button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Fermer"><X size={18} /></button></div>
        {canEditName && <ProfileForms name={name} only="name" />}
        <ProfileForms name={name} only="password" />
      </section>
    </div>}
  </>;
}
