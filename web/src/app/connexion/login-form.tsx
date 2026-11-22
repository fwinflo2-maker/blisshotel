"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

export default function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Impossible de vous connecter.");
        return;
      }
      const redirectTo = data.redirectTo;
      if (
        typeof redirectTo !== "string" ||
        !["/super-admin", "/proprietaire", "/admin-hotel", "/reception", "/comptabilite", "/direction", "/maintenance", "/restauration", "/bar-service", "/housekeeping", "/acces-refuse"].some((path) => path === redirectTo)
      ) {
        setError("Impossible de déterminer l’espace associé à ce compte. Veuillez réessayer.");
        return;
      }
      window.location.replace(redirectTo);
    } catch {
      setError("Le service est temporairement indisponible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="BLISS HÔTEL">
        <div className="login-particles" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
        <Link className="login-brand-inner" href="/" aria-label="Revenir à la page d’accueil Bliss Hôtel">
          <div className="brand-mark"><Building2 size={24} /></div>
          <div><strong>BLISS HÔTEL</strong><span>Gestion hôtelière</span></div>
        </Link>
        <div className="login-message">
          <p className="login-eyebrow"><span />Système de gestion hôtelière</p>
          <h1>Un seul accès,<br /><em>votre espace de travail.</em></h1>
          <p className="login-lede">Chaque profil ouvre l’espace correspondant à son rôle et aux permissions qui lui sont attribuées.</p>
        </div>
        <div className="login-trust" aria-label="Informations de sécurité">
          <ShieldCheck size={16} />
          <span>Accès sécurisé et données protégées</span>
        </div>
      </section>
      <section className="login-form-panel">
        <Link className="login-back" href="/">
          <ArrowLeft size={15} />
          Retour à l’accueil
        </Link>
        <form className="login-form" onSubmit={submit}>
          <div className="login-heading">
            <p>ESPACE PERSONNEL</p>
            <h2>Bon retour</h2>
            <span>Identifiez-vous pour accéder à votre espace.</span>
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <div className="login-field">
            <label htmlFor="login-email"><span>Adresse e-mail</span></label>
            <div className="login-input">
              <Mail size={17} />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="reception@blisshotel.cg"
                aria-invalid={Boolean(error)}
                required
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="login-password"><span>Mot de passe</span></label>
            <div className="login-input">
              <LockKeyhole size={17} />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Votre mot de passe"
                minLength={8}
                aria-invalid={Boolean(error)}
                required
              />
              <button
                type="button"
                className="login-toggle-password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <button className="login-submit" disabled={loading} type="submit">
            {loading ? <><span className="login-spinner" aria-hidden="true" />Connexion…</> : <>Se connecter <ArrowRight size={17} /></>}
          </button>
          <Link className="login-reset" href="/reinitialisation">Mot de passe oublié ?</Link>
        </form>
        <p className="login-footer">© Bliss Hôtel</p>
      </section>
    </main>
  );
}
