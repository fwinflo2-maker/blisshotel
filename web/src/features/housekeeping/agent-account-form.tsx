'use client';

import { FormEvent, useState } from 'react';
import './agent-account-form.css';

export default function AgentAccountForm() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/housekeeping/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.text();
      let data: { error?: string } = {};
      if (body) {
        try {
          data = JSON.parse(body) as { error?: string };
        } catch {
          throw new Error('Le serveur a renvoyé une réponse invalide. Vérifiez la base de données et réessayez.');
        }
      }
      if (!response.ok) throw new Error(data.error ?? 'La création du compte a échoué.');
      if (!body) throw new Error('Le serveur a renvoyé une réponse vide.');
      setForm({ name: '', email: '', password: '' });
      setSuccess('Le compte Agent d’entretien a été créé.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La création du compte a échoué.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="agent-account-panel">
      <h2 className="agent-account-title">Créer un Agent d’entretien</h2>
      <p className="agent-account-description">Chaque agent dispose de son propre identifiant et mot de passe provisoire.</p>
      {error && <p className="agent-account-message agent-account-error" role="alert">{error}</p>}
      {success && <p className="agent-account-message agent-account-success" role="status">{success}</p>}
      <form className="agent-account-fields" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Nom et prénom</span>
          <input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required />
        </label>
        <label>
          <span>E-mail de connexion</span>
          <input type="email" autoComplete="username" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={191} required />
        </label>
        <label>
          <span>Mot de passe provisoire (12 caractères min.)</span>
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} maxLength={128} autoComplete="new-password" required />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer le compte'}</button>
      </form>
    </section>
  );
}
