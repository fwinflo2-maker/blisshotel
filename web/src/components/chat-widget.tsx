'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, MessageCircle, Plus, Send, Users, X } from 'lucide-react';
import styles from './chat-widget.module.css';

type Contact = { id: string; name: string; role: string };
type Message = { id: string; body: string; createdAt: string; sender: { id: string; name: string } };
type Conversation = {
  id: string; title: string | null; isGroup: boolean; status: 'ACCEPTED' | 'INVITED'; updatedAt: string; unread: number;
  participants: Contact[]; lastMessage: { body: string; sender: string; createdAt: string } | null;
};
type Snapshot = { userId: string; conversations: Conversation[]; contacts: Contact[] };
const dateTime = (value: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value));

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? 'La messagerie est momentanément indisponible.');
  return data;
}

export default function ChatWidget() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ userId: '', conversations: [], contacts: [] });
  const [opened, setOpened] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'list' | 'direct' | 'group'>('list');
  const [groupTitle, setGroupTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setSnapshot(await request<Snapshot>('/api/chat')); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Erreur de connexion.'); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 8000); return () => window.clearInterval(timer); }, [refresh]);
  const conversations = snapshot.conversations;
  const active = conversations.find((conversation) => conversation.id === activeId);
  const totalUnread = useMemo(() => conversations.reduce((sum, conversation) => sum + conversation.unread, 0), [conversations]);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const data = await request<{ messages: Message[] }>(`/api/chat/${id}/messages`);
      setMessages(data.messages);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Erreur de connexion.'); }
  }, [refresh]);
  useEffect(() => {
    if (!opened || !activeId || active?.status !== 'ACCEPTED') return;
    void loadMessages(activeId);
    const timer = window.setInterval(() => void loadMessages(activeId), 5000);
    return () => window.clearInterval(timer);
  }, [opened, activeId, active?.status, loadMessages]);

  async function createDirect(contactId: string) {
    setBusy(true); setError('');
    try { const result = await request<{ id: string }>('/api/chat', { method: 'POST', body: JSON.stringify({ type: 'direct', userId: contactId }) }); await refresh(); setMode('list'); setActiveId(result.id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erreur.'); } finally { setBusy(false); }
  }
  async function createGroup() {
    if (!groupTitle.trim()) return;
    setBusy(true); setError('');
    try { const result = await request<{ id: string }>('/api/chat', { method: 'POST', body: JSON.stringify({ type: 'group', title: groupTitle, userIds: selected }) }); await refresh(); setMode('list'); setActiveId(result.id); setGroupTitle(''); setSelected([]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erreur.'); } finally { setBusy(false); }
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!activeId || !text.trim() || busy) return;
    const body = text.trim(); setText(''); setBusy(true); setError('');
    try { await request(`/api/chat/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); await loadMessages(activeId); }
    catch (caught) { setText(body); setError(caught instanceof Error ? caught.message : 'Erreur.'); } finally { setBusy(false); }
  }
  async function decision(conversation: Conversation, decision: 'ACCEPTED' | 'DECLINED') {
    setBusy(true); setError('');
    try { await request(`/api/chat/${conversation.id}/members/${snapshot.userId}`, { method: 'PATCH', body: JSON.stringify({ decision }) }); await refresh(); if (decision === 'ACCEPTED') setActiveId(conversation.id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erreur.'); } finally { setBusy(false); }
  }
  async function addMember(userId: string) {
    if (!activeId) return;
    setBusy(true); setError('');
    try { await request(`/api/chat/${activeId}/members/${userId}`, { method: 'POST' }); setAddingMember(false); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Erreur.'); } finally { setBusy(false); }
  }

  if (!opened) return <button className={styles.launcher} onClick={() => setOpened(true)} aria-label="Ouvrir la messagerie"><MessageCircle size={23} />{totalUnread > 0 && <span className={styles.badge}>{totalUnread}</span>}</button>;
  const activeTitle = active?.title ?? active?.participants.map((person) => person.name).join(', ') ?? 'Conversation';
  const availableToInvite = snapshot.contacts.filter((contact) => !active?.participants.some((person) => person.id === contact.id));

  return <section className={styles.panel} aria-label="Messagerie">
    <header className={styles.header}>
      {activeId ? <button className={styles.iconButton} onClick={() => { setActiveId(''); setAddingMember(false); }} aria-label="Retour"><ArrowLeft size={18} /></button> : <span className={styles.headerIcon}><MessageCircle size={19} /></span>}
      <div className={styles.headerText}><strong>{activeId ? activeTitle : mode === 'group' ? 'Nouveau groupe' : mode === 'direct' ? 'Nouvelle conversation' : 'Messagerie'}</strong><span>{activeId && active?.isGroup ? `${active.participants.length + 1} membres` : 'Équipe Bliss Hotel'}</span></div>
      {active?.isGroup && <button className={styles.iconButton} onClick={() => setAddingMember(!addingMember)} aria-label="Ajouter un membre"><Plus size={19} /></button>}
      {!activeId && mode === 'list' && <button className={styles.iconButton} onClick={() => { setMode('direct'); setError(''); }} aria-label="Nouvelle conversation"><Plus size={19} /></button>}
      <button className={styles.iconButton} onClick={() => setOpened(false)} aria-label="Fermer"><X size={19} /></button>
    </header>
    {error && <div className={styles.error}>{error}</div>}
    {addingMember && <div className={styles.contactList}><div className={styles.sectionTitle}>Inviter au groupe</div>{availableToInvite.length ? availableToInvite.map((person) => <button key={person.id} className={styles.contact} disabled={busy} onClick={() => void addMember(person.id)}><span className={styles.avatar}>{person.name.charAt(0).toUpperCase()}</span><span><b>{person.name}</b><small>{person.role}</small></span><Plus size={17} /></button>) : <p className={styles.empty}>Tous les profils sont déjà dans ce groupe.</p>}</div>}
    {!activeId && mode === 'list' && <div className={styles.conversationList}>
      {conversations.length === 0 && <div className={styles.empty}>Aucune conversation. Utilisez + pour écrire à un profil ou créer un groupe.</div>}
      {conversations.map((conversation) => <div key={conversation.id} className={styles.conversationRow}>
        <button className={styles.conversation} onClick={() => { if (conversation.status === 'ACCEPTED') { setActiveId(conversation.id); setError(''); } }}>
          <span className={styles.avatar}>{conversation.isGroup ? <Users size={17} /> : (conversation.participants[0]?.name ?? '?').charAt(0).toUpperCase()}</span>
          <span className={styles.conversationText}><b>{conversation.title ?? conversation.participants.map((person) => person.name).join(', ')}</b><small>{conversation.status === 'INVITED' ? 'Invitation à rejoindre' : conversation.lastMessage ? `${conversation.lastMessage.sender} : ${conversation.lastMessage.body}` : 'Démarrer la conversation'}</small></span>
          {conversation.unread > 0 && <i className={styles.unread} />}
        </button>
        {conversation.status === 'INVITED' && <div className={styles.inviteActions}><button disabled={busy} onClick={() => void decision(conversation, 'ACCEPTED')}><Check size={14} /> Accepter</button><button disabled={busy} onClick={() => void decision(conversation, 'DECLINED')}>Refuser</button></div>}
      </div>)}
      <div className={styles.sectionTitle}>Utilisateurs actifs</div>
      {snapshot.contacts.length === 0 && <div className={styles.empty}>Aucun autre utilisateur actif.</div>}
      {snapshot.contacts.map((person) => <button key={person.id} className={styles.contact} disabled={busy} onClick={() => void createDirect(person.id)}><span className={styles.avatar}>{person.name.charAt(0).toUpperCase()}</span><span><b>{person.name}</b><small>{person.role}</small></span><MessageCircle size={16} /></button>)}
      <button className={styles.groupLink} onClick={() => { setMode('group'); setError(''); }}><Users size={17} /> Créer un groupe</button>
    </div>}
    {!activeId && mode === 'direct' && <div className={styles.contactList}><button className={styles.backLink} onClick={() => setMode('list')}><ArrowLeft size={15} /> Retour</button><div className={styles.sectionTitle}>Tous les profils actifs</div>{snapshot.contacts.map((person) => <button key={person.id} className={styles.contact} disabled={busy} onClick={() => void createDirect(person.id)}><span className={styles.avatar}>{person.name.charAt(0).toUpperCase()}</span><span><b>{person.name}</b><small>{person.role}</small></span><MessageCircle size={16} /></button>)}</div>}
    {!activeId && mode === 'group' && <div className={styles.groupForm}><label>Nom du groupe<input value={groupTitle} maxLength={120} onChange={(event) => setGroupTitle(event.target.value)} placeholder="Ex. Équipe du matin" /></label><div className={styles.sectionTitle}>Inviter des profils (ils devront accepter)</div><div className={styles.selectList}>{snapshot.contacts.map((person) => <label key={person.id} className={styles.selectContact}><input type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} /><span><b>{person.name}</b><small>{person.role}</small></span></label>)}</div><button className={styles.primaryButton} disabled={busy || groupTitle.trim().length < 2} onClick={() => void createGroup()}>Créer le groupe</button><button className={styles.backLink} onClick={() => setMode('list')}>Annuler</button></div>}
    {activeId && active?.status === 'ACCEPTED' && <>
      <div className={styles.messageList}>
        {messages.length === 0 && <div className={styles.empty}>C’est le début de cette conversation. Envoyez le premier message.</div>}
        {messages.map((message) => <div key={message.id} className={`${styles.message} ${message.sender.id === snapshot.userId ? styles.ownMessage : ''}`}><small>{message.sender.id === snapshot.userId ? 'Vous' : message.sender.name} · {dateTime(message.createdAt)}</small><p>{message.body}</p></div>)}
      </div>
      <form className={styles.composer} onSubmit={(event) => void sendMessage(event)}><textarea value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Écrire un message…" rows={1} /><button type="submit" disabled={busy || !text.trim()} aria-label="Envoyer"><Send size={18} /></button></form>
    </>}
  </section>;
}
