'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, Eye, Search, Shield, UserRound } from 'lucide-react';
import styles from './profile-viewer.module.css';

type ProfileRow = {
  id: string;
  name: string;
  active: boolean;
  platformAdmin: boolean;
  lastLoginAt: string | null;
  role: { code: string; name: string } | null;
};
type ProfileDetail = ProfileRow & {
  createdAt: string;
  role: { code: string; name: string; permissions: string[] } | null;
  delegatedPermissions: string[];
};
type ProfileList = { profiles: ProfileRow[]; page: number; total: number; pageCount: number };

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    if (response.status === 401) throw new Error('Votre session a expiré ou a été révoquée. Reconnectez-vous.');
    throw new Error(`Réponse invalide du serveur (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : response.status === 401 ? 'Votre session a expiré ou a été révoquée. Reconnectez-vous.' : `La requête a échoué (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (payload === null) throw new Error(`Le serveur a renvoyé une réponse vide (HTTP ${response.status}).`);
  return payload as T;
}

function dateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Jamais connecté';
}

export default function GodModeProfileViewer() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ProfileList | null>(null);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError('');
      const params = new URLSearchParams({ page: String(page) });
      if (query.trim()) params.set('q', query.trim());
      void request<ProfileList>(`/api/god-mode/profiles?${params}`)
        .then((result) => { if (active) setList(result); })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); })
        .finally(() => { if (active) setBusy(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, query]);

  async function openProfile(id: string) {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ profile: ProfileDetail }>(`/api/god-mode/profiles?profileId=${encodeURIComponent(id)}`);
      setProfile(result.profile);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’ouvrir ce profil.');
    } finally {
      setBusy(false);
    }
  }

  const permissions = [...new Set([...(profile?.role?.permissions ?? []), ...(profile?.delegatedPermissions ?? [])])];

  return <section className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroIcon}><Eye size={21} /></div>
      <div><p>CONSOLE DE SUPERVISION</p><h2>God Mode <span>· consultation des profils</span></h2><small>Accès de supervision, sans demander les identifiants du compte consulté.</small></div>
      <span className={styles.readOnly}><Shield size={14} />Lecture seule</span>
    </header>

    <div className={styles.notice} role="note">
      Aucun mot de passe ni jeton n’est consulté. Cette vue n’ouvre pas de session sous l’identité du profil et ne permet pas d’effectuer ses actions.
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}

    <div className={styles.layout}>
      <section className={styles.listPanel} aria-label="Profils disponibles">
        <div className={styles.listHeading}><div><p>COMPTES ACCESSIBLES</p><h3>{list?.total ?? 0} profils</h3></div><UserRound size={18} /></div>
        <label className={styles.search}><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setProfile(null); }} placeholder="Rechercher un nom ou un rôle" aria-label="Rechercher un profil" /></label>
        {busy && <p className={styles.loading} role="status">{profile ? 'Chargement du profil…' : 'Chargement des profils…'}</p>}
        <div className={styles.profileList}>
          {list?.profiles.map((item) => <button key={item.id} type="button" disabled={busy} className={`${styles.profileRow}${profile?.id === item.id ? ` ${styles.selected}` : ''}`} onClick={() => void openProfile(item.id)}>
            <span className={styles.avatar}>{item.name.slice(0, 1).toLocaleUpperCase('fr-FR')}</span>
            <span className={styles.profileCopy}><strong>{item.name}</strong><small>{item.role?.name ?? (item.platformAdmin ? 'Super Administrateur' : 'Profil plateforme')}</small></span>
            <i className={item.active ? styles.activeDot : styles.inactiveDot} aria-label={item.active ? 'Actif' : 'Suspendu'} />
          </button>)}
          {!busy && list?.profiles.length === 0 && <p className={styles.empty}>Aucun profil pour cette recherche.</p>}
        </div>
        {list && list.pageCount > 1 && <div className={styles.pagination}>
          <button type="button" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)} aria-label="Page précédente"><ChevronLeft size={16} /></button>
          <span>Page {page} / {list.pageCount}</span>
          <button type="button" disabled={page >= list.pageCount || busy} onClick={() => setPage((value) => value + 1)} aria-label="Page suivante"><ChevronRight size={16} /></button>
        </div>}
      </section>

      <section className={styles.detailPanel} aria-live="polite">
        {profile ? <>
          <div className={styles.detailHeading}>
            <span className={styles.detailAvatar}>{profile.name.slice(0, 1).toLocaleUpperCase('fr-FR')}</span>
            <div><p>APERÇU DU PROFIL</p><h3>{profile.name}</h3><span>{profile.role?.name ?? (profile.platformAdmin ? 'Super Administrateur' : 'Profil plateforme')}</span></div>
            <span className={`${styles.status}${profile.active ? ` ${styles.statusActive}` : ''}`}>{profile.active ? 'Actif' : 'Suspendu'}</span>
          </div>
          <div className={styles.facts}>
            <div><span>Dernière connexion</span><strong>{dateTime(profile.lastLoginAt)}</strong></div>
            <div><span>Compte créé le</span><strong>{dateTime(profile.createdAt)}</strong></div>
          </div>
          <div className={styles.permissions}>
            <div className={styles.listHeading}><div><p>ACCÈS CONFIGURÉS</p><h3>{permissions.length} permissions</h3></div><BadgeCheck size={18} /></div>
            {permissions.length ? <div className={styles.permissionList}>{permissions.map((permission) => <span key={permission}>{permission}</span>)}</div> : <p className={styles.empty}>Aucune permission de rôle à afficher.</p>}
          </div>
          <p className={styles.auditHint}>La consultation de ce profil est inscrite au journal d’audit.</p>
        </> : <div className={styles.placeholder}><span><Eye size={22} /></span><h3>Sélectionnez un profil</h3><p>Les données affichées sont limitées aux informations de compte et aux permissions. Les identifiants restent privés.</p></div>}
      </section>
    </div>
  </section>;
}
