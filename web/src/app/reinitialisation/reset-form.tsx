'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

export default function ResetForm() {
  const token = useSearchParams().get('token');
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [supportError, setSupportError] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/recovery-info')
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossible de charger le contact.');
        return response.json() as Promise<{ supportEmail: string | null }>;
      })
      .then((data) => {
        if (active) setSupportEmail(data.supportEmail);
      })
      .catch(() => {
        if (active) setSupportError(true);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) return;
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'La réinitialisation a échoué.');
        return;
      }
      setComplete(true);
    } catch {
      setError('Le service de récupération est temporairement indisponible. Réessayez dans quelques instants.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page reset-page">
      <section className="login-brand" aria-label="BLISS HÔTEL">
        <Link className="login-brand-inner" href="/" aria-label="Revenir à l’accueil Bliss Hôtel">
          <div className="brand-mark"><Building2 size={24} /></div>
          <div><strong>BLISS HÔTEL</strong><span>Gestion hôtelière</span></div>
        </Link>
        <div className="login-message">
          <p className="login-eyebrow"><span />Accès sécurisé</p>
          <h1>Retrouvez l’accès<br /><em>à votre espace.</em></h1>
          <p className="login-lede">La récupération de votre compte est protégée par un lien personnel, unique et temporaire.</p>
        </div>
        <div className="login-trust"><ShieldCheck size={16} /><span>Vos identifiants restent confidentiels</span></div>
      </section>

      <section className="login-form-panel reset-panel">
        <Link className="login-back" href="/connexion"><ArrowLeft size={15} />Retour à la connexion</Link>
        <div className="reset-content">
          <div className="reset-icon"><KeyRound size={20} /></div>
          <p className="reset-eyebrow">RÉCUPÉRATION DU COMPTE</p>
          <h2>{complete ? 'Mot de passe modifié' : !token ? 'Besoin d’aide pour vous connecter ?' : 'Créer un nouveau mot de passe'}</h2>

          {!token && (
            <>
              <p className="reset-description">Un lien de réinitialisation personnel est nécessaire pour changer votre mot de passe. Pour protéger votre compte, demandez-le à l’administrateur de BLISS HÔTEL.</p>
              <div className="reset-assistance" role="status">
                <ShieldCheck size={19} aria-hidden="true" />
                <div>
                  <strong>Votre compte reste protégé</strong>
                  <span>Le lien est à usage unique et expire après 30 minutes.</span>
                </div>
              </div>
              {supportEmail ? (
                <a className="reset-contact" href={`mailto:${supportEmail}`}><Mail size={16} />Contacter le support<ArrowRight size={15} /></a>
              ) : (
                <p className="reset-support-note">
                  {supportError ? 'Le contact de support ne peut pas être chargé pour le moment. Contactez directement l’administrateur hôtelier.' : 'Contactez directement l’administrateur hôtelier pour obtenir un lien de récupération.'}
                </p>
              )}
            </>
          )}

          {token && complete && (
            <div className="reset-success" role="status">
              <CheckCircle2 size={20} />
              <p>Votre mot de passe a été modifié. Les autres sessions ont été déconnectées.</p>
              <Link className="reset-submit" href="/connexion">Retourner à la connexion<ArrowRight size={16} /></Link>
            </div>
          )}

          {token && !complete && (
            <>
              <p className="reset-description">Choisissez un mot de passe robuste d’au moins 12 caractères.</p>
              <form className="reset-form" onSubmit={submit}>
                <label htmlFor="reset-password">Nouveau mot de passe</label>
                <div className="reset-input"><LockKeyhole size={17} aria-hidden="true" /><input id="reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
                <label htmlFor="reset-confirmation">Confirmer le mot de passe</label>
                <div className="reset-input"><LockKeyhole size={17} aria-hidden="true" /><input id="reset-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
                {error && <div className="reset-error" role="alert">{error}</div>}
                <button className="reset-submit" type="submit" disabled={loading}>{loading ? 'Enregistrement…' : <>Modifier le mot de passe<ArrowRight size={16} /></>}</button>
              </form>
              <p className="reset-footnote">Lien à usage unique, valable 30 minutes.</p>
            </>
          )}
        </div>
        <p className="login-footer">© Bliss Hôtel</p>
      </section>
    </main>
  );
}
