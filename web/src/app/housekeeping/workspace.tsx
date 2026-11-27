'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { Check, ClipboardList, LogOut, RotateCcw, Sparkles } from 'lucide-react';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import { CockpitBars, CockpitDonut } from '@/components/cockpit-charts';
import AgentAccountForm from '@/features/housekeeping/agent-account-form';
import { useRouter } from 'next/navigation';
import './housekeeping.css';

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'READY_FOR_INSPECTION' | 'COMPLETED';
type Task = {
  id: string;
  title: string;
  taskType: string;
  notes: string | null;
  status: TaskStatus;
  createdAt: string;
  inspectedAt: string | null;
  inspectionNote: string | null;
  room: { number: string; floor: string | null };
  assignee: { id: string; name: string; role: { name: string } } | null;
  assignees: { id: string; name: string; role: { name: string } }[];
  inspector: { name: string } | null;
};
type Agent = { id: string; name: string; role: { name: string } };
type Room = {
  id: string;
  number: string;
  floor: string | null;
  status: string;
  housekeepingStatus: string;
  technicalStatus: 'OPERATIONAL' | 'INTERVENTION_REQUIRED' | 'UNDER_MAINTENANCE' | 'OUT_OF_SERVICE';
  active: boolean;
  capacity: number | null;
  bedType: string | null;
  area: string | null;
  description: string | null;
  observations: string | null;
  equipment: unknown;
  photos: unknown;
  category: { name: string; capacity: number | null };
  incidents: { id: string; title: string; status: string; createdAt: string }[];
  housekeepingTasks: {
    id?: string;
    title?: string;
    status?: TaskStatus;
    createdAt?: string;
    assignee: { id: string; name: string } | null;
    assignments?: { agent: { id: string; name: string } }[];
  }[];
};
type RoomDetail = Room & {
  reservations: { id: string; reference: string; status: string; checkInDate: string; checkOutDate: string }[];
  housekeepingTasks: {
    id: string;
    title: string;
    status: TaskStatus;
    createdAt: string;
    assignee: { id: string; name: string } | null;
    assignments?: { agent: { id: string; name: string } }[];
    inspector: { id: string; name: string } | null;
  }[];
  incidents: { id: string; title: string; status: string; description: string | null; createdAt: string }[];
  statusHistory: { id: string; dimension: string; previousStatus: string | null; nextStatus: string; reason: string | null; source: string; createdAt: string }[];
};
type TaskAction = 'START' | 'COMPLETE' | 'SUBMIT_FOR_INSPECTION' | 'INSPECTION_PASSED' | 'INSPECTION_FAILED';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? 'La requête a échoué.');
  return data;
}

const statusLabels: Record<TaskStatus, string> = {
  PENDING: 'À faire',
  IN_PROGRESS: 'En cours',
  READY_FOR_INSPECTION: 'À inspecter',
  COMPLETED: 'Terminée',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const housekeepingLabels: Record<string, string> = {
  CLEAN: 'Propre',
  TO_CLEAN: 'À nettoyer',
  IN_PROGRESS: 'Nettoyage en cours',
  TO_INSPECT: 'En attente d’inspection',
  OUT_OF_SERVICE: 'Hors service',
};
const technicalLabels: Record<string, string> = {
  OPERATIONAL: 'Opérationnelle',
  INTERVENTION_REQUIRED: 'Intervention nécessaire',
  UNDER_MAINTENANCE: 'En maintenance',
  OUT_OF_SERVICE: 'Hors service',
};

export default function HousekeepingWorkspace({ name, role }: { name: string; role: 'HOUSEKEEPER' | 'GOUVERNANTE' }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const isManager = role === 'GOUVERNANTE';
  const roleLabel = role === 'GOUVERNANTE' ? 'Gouvernante' : 'Agent d’entretien';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState({ taskType: 'CLEANING', notes: '', roomId: '', assignedTo: [] as string[] });
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>({});
  const [roomSearch, setRoomSearch] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<RoomDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const taskCounts = { pending: tasks.filter((task) => task.status === 'PENDING').length, inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length, inspection: tasks.filter((task) => task.status === 'READY_FOR_INSPECTION').length, completed: tasks.filter((task) => task.status === 'COMPLETED').length };

  const applyData = useCallback((data: { tasks: Task[]; agents: Agent[]; rooms: Room[] }) => {
    setTasks(data.tasks);
    setAgents(data.agents);
    setRooms(data.rooms);
    setForm((current) => ({
      ...current,
      roomId: data.rooms.some((room) => room.id === current.roomId) ? current.roomId : data.rooms[0]?.id ?? '',
      assignedTo: current.assignedTo.filter((id) => data.agents.some((agent) => agent.id === id)).length ? current.assignedTo.filter((id) => data.agents.some((agent) => agent.id === id)) : data.agents[0]?.id ? [data.agents[0].id] : [],
    }));
    setError('');
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api<{ tasks: Task[]; agents: Agent[]; rooms: Room[] }>('/api/housekeeping/tasks');
      applyData(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les tâches.');
    } finally {
      setBusy(false);
    }
  }, [applyData]);

  useEffect(() => {
    let active = true;
    void api<{ tasks: Task[]; agents: Agent[]; rooms: Room[] }>('/api/housekeeping/tasks')
      .then((data) => { if (active) applyData(data); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les tâches.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [applyData]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api('/api/housekeeping/tasks', { method: 'POST', body: JSON.stringify(form) });
      setForm((current) => ({ ...current, notes: '' }));
      setNotice('La tâche a été affectée.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’affecter la tâche.');
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(task: Task, action: TaskAction) {
    const note = inspectionNotes[task.id]?.trim() ?? '';
    if (action === 'INSPECTION_FAILED' && note.length < 3) {
      setError('Précisez les corrections à effectuer avant de renvoyer la tâche.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api('/api/housekeeping/tasks', {
        method: 'PATCH',
        body: JSON.stringify({ taskId: task.id, action, note }),
      });
      setNotice(action === 'COMPLETE' ? 'Tâche terminée. La chambre est remise à disposition si elle n’est ni occupée ni en maintenance.' : action === 'INSPECTION_PASSED' ? 'La chambre a passé l’inspection.' : action === 'INSPECTION_FAILED' ? 'La tâche a été renvoyée à l’agent.' : 'L’avancement a été enregistré.');
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Impossible de modifier la tâche.');
    } finally {
      setSaving(false);
    }
  }

  async function openRoom(roomId: string) {
    setSelectedRoom(null);
    try {
      const data = await api<{ room: RoomDetail }>(`/api/housekeeping/rooms/${roomId}`);
      setSelectedRoom(data.room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : 'Impossible de charger la fiche de chambre.');
    }
  }

  async function reportIncident(roomId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get('title') ?? '').trim();
    if (title.length < 3) {
      setError('Décrivez l’incident en quelques mots.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/api/housekeeping/rooms/${roomId}`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      setNotice('L’incident a été signalé.');
      form.reset();
      await Promise.all([load(), openRoom(roomId)]);
    } catch (incidentError) {
      setError(incidentError instanceof Error ? incidentError.message : 'Impossible de signaler l’incident.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      router.push('/connexion');
      router.refresh();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Impossible de fermer la session.');
    }
  }

  return (
    <main className="housekeeping-shell" data-theme={theme}>
      <header className="housekeeping-topbar">
        <div className="housekeeping-brand">
          <span className="housekeeping-brand-mark"><Sparkles size={18} /></span>
          <span><strong>BLISS HÔTEL</strong><small>Équipe d’entretien</small></span>
        </div>
        <div className="housekeeping-user">
          <span><strong>{name}</strong><small>{roleLabel}</small></span>
          <a className="housekeeping-operations-link" href="/pilotage">Centre de pilotage</a>
          <DashboardThemeToggle theme={theme} onToggle={toggleTheme} />
          <ProfileLauncher name={name} className="housekeeping-profile-launcher" />
          <button className="housekeeping-logout" type="button" onClick={() => void logout()} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={17} /></button>
        </div>
      </header>

      <section className="housekeeping-content">
        <div className="housekeeping-heading">
          <div>
            <p className="housekeeping-eyebrow">Opérations hôtelières</p>
            <h1>{isManager ? 'Suivi des tâches et inspections' : 'Mes tâches d’entretien'}</h1>
            <p>{isManager ? 'Créez les comptes des agents, affectez les tâches et suivez leur avancement.' : 'Démarrez votre tâche, puis marquez-la terminée pour remettre la chambre à disposition.'}</p>
          </div>
          <button type="button" className="housekeeping-refresh" onClick={() => void load()} disabled={busy}><RotateCcw size={15} /> Actualiser</button>
        </div>

        {error && <p className="housekeeping-alert is-error" role="alert">{error}</p>}
        {notice && <p className="housekeeping-alert is-success" role="status">{notice}</p>}

        {!busy && <section className="housekeeping-cockpit" aria-label="Synthèse de l’entretien">
          <div className="housekeeping-cockpit-intro"><span><Sparkles size={16} /></span><div><p>VUE {isManager ? 'DE L’ÉQUIPE' : 'PERSONNELLE'}</p><strong>{tasks.length} tâche{tasks.length === 1 ? '' : 's'} visible{tasks.length === 1 ? '' : 's'}</strong></div><span className="housekeeping-cockpit-scope">Données selon votre profil</span></div>
          <div className="housekeeping-cockpit-grid">
            <article className="housekeeping-chart-card"><div className="housekeeping-chart-heading"><div><p>{isManager ? 'PARC HÔTELIER' : 'MES TÂCHES'}</p><h2>{isManager ? 'État de propreté' : 'État d’avancement'}</h2></div><ClipboardList size={18} /></div>
              {isManager ? <CockpitDonut total={rooms.length} centerValue={String(rooms.length)} centerLabel="chambres" segments={[
                { label: 'Propres', value: rooms.filter((room) => room.housekeepingStatus === 'CLEAN').length, color: '#56a986' },
                { label: 'À nettoyer', value: rooms.filter((room) => room.housekeepingStatus === 'TO_CLEAN').length, color: '#5896d0' },
                { label: 'En cours', value: rooms.filter((room) => room.housekeepingStatus === 'IN_PROGRESS').length, color: '#c6a878' },
                { label: 'À inspecter', value: rooms.filter((room) => room.housekeepingStatus === 'TO_INSPECT').length, color: '#8b78b5' },
                { label: 'Hors service', value: rooms.filter((room) => room.housekeepingStatus === 'OUT_OF_SERVICE').length, color: '#d97868' },
                { label: 'Autres états', value: rooms.filter((room) => !['CLEAN', 'TO_CLEAN', 'IN_PROGRESS', 'TO_INSPECT', 'OUT_OF_SERVICE'].includes(room.housekeepingStatus)).length, color: '#aab5c1' },
              ]} /> : <CockpitDonut total={tasks.length} centerValue={String(taskCounts.inProgress + taskCounts.inspection)} centerLabel="à suivre" segments={[
                { label: 'À faire', value: taskCounts.pending, color: '#5896d0' },
                { label: 'En cours', value: taskCounts.inProgress, color: '#c6a878' },
                { label: 'À inspecter', value: taskCounts.inspection, color: '#8b78b5' },
                { label: 'Terminées', value: taskCounts.completed, color: '#56a986' },
              ]} />}
            </article>
            <article className="housekeeping-chart-card"><div className="housekeeping-chart-heading"><div><p>FLUX DE TRAVAIL</p><h2>Progression des tâches</h2></div><RotateCcw size={18} /></div><CockpitBars rows={[
              { label: 'À faire', value: taskCounts.pending, color: '#5896d0' },
              { label: 'En cours', value: taskCounts.inProgress, color: '#c6a878' },
              { label: 'Inspection', value: taskCounts.inspection, color: '#8b78b5' },
              { label: 'Terminées', value: taskCounts.completed, color: '#56a986' },
            ]} /><p className="housekeeping-chart-note">{isManager ? 'Suivi de l’ensemble des tâches accessibles à la gouvernante.' : 'Statistiques calculées uniquement à partir des tâches qui vous sont affectées.'}</p></article>
          </div>
        </section>}

        {isManager && <AgentAccountForm />}

        {isManager && (
          <form className="housekeeping-form" onSubmit={(event) => void createTask(event)}>
            <div className="housekeeping-section-title">
              <span className="housekeeping-section-icon"><ClipboardList size={17} /></span>
              <div><h2>Nouvelle tâche</h2><p>Affectez une tâche à un Agent d’entretien actif.</p></div>
            </div>
            <label>
              <span>Tâche à affecter</span>
              <select value={form.taskType} onChange={(event) => setForm({ ...form, taskType: event.target.value })} required>
                <option value="CLEANING">Nettoyer la chambre</option>
                <option value="BED_MAKING">Dresser le lit</option>
                <option value="ROOM_ARRANGEMENT">Arranger la chambre</option>
              </select>
            </label>
            <label>
              <span>Chambre</span>
              <select value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })} required disabled={!rooms.length}>
                <option value="">{rooms.length ? 'Choisir une chambre' : 'Aucune chambre disponible'}</option>
                {rooms.map((room) => {
                  const activeTask = room.housekeepingTasks[0];
                  return <option key={room.id} value={room.id} disabled={Boolean(activeTask?.assignee)}>Chambre {room.number}{room.floor ? ` · étage ${room.floor}` : ''}{activeTask ? activeTask.assignee ? ' · tâche déjà affectée' : ' · tâche à affecter' : ''}</option>;
                })}
              </select>
            </label>
            <label>
              <span>Agents d’entretien</span>
              <div className="housekeeping-agent-select" role="group" aria-label="Agents d’entretien affectés">
                {agents.length ? agents.map((agent) => <label key={agent.id} className="housekeeping-agent-option"><input type="checkbox" checked={form.assignedTo.includes(agent.id)} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.checked ? [...current.assignedTo, agent.id] : current.assignedTo.filter((id) => id !== agent.id) }))} /><span>{agent.name} · {agent.role.name}</span></label>) : <span>Aucun compte actif disponible</span>}
              </div>
            </label>
            <label className="housekeeping-wide">
              <span>Consignes (facultatif)</span>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} rows={2} placeholder="Précisions utiles pour l’équipe" />
            </label>
            <button type="submit" className="housekeeping-primary" disabled={saving || !rooms.length || !agents.length || !form.assignedTo.length}>
              <ClipboardList size={15} /> {saving ? 'Affectation…' : 'Affecter la tâche'}
            </button>
          </form>
        )}

        {isManager && (
          <section className="housekeeping-rooms">
            <div className="housekeeping-section-title">
              <span className="housekeeping-section-icon"><ClipboardList size={17} /></span>
              <div><h2>Gestion des chambres</h2><p>Inventaire opérationnel, étages, propreté et maintenance</p></div>
            </div>
            <div className="housekeeping-room-filters">
              <label><span>Recherche</span><input value={roomSearch} onChange={(event) => setRoomSearch(event.target.value)} placeholder="Numéro de chambre" /></label>
              <label><span>Étage</span><select value={roomFloor} onChange={(event) => setRoomFloor(event.target.value)}><option value="">Tous les étages</option>{[...new Set(rooms.map((room) => room.floor).filter((floor): floor is string => Boolean(floor)))].sort().map((floor) => <option key={floor} value={floor}>Étage {floor}</option>)}</select></label>
            </div>
            <div className="housekeeping-room-grid">
              {rooms.filter((room) => (!roomFloor || room.floor === roomFloor) && (!roomSearch.trim() || room.number.toLowerCase().includes(roomSearch.trim().toLowerCase()))).map((room) => {
                const activeTask = room.housekeepingTasks[0];
                return (
                  <button type="button" className="housekeeping-room-card" key={room.id} onClick={() => void openRoom(room.id)}>
                    <span className="housekeeping-room-number">Ch. {room.number}</span>
                    <strong>{room.category.name === 'Suite' ? 'Suite' : 'Chambre standard'}</strong>
                    <small>{room.floor ? `Étage ${room.floor}` : 'Étage non renseigné'}</small>
                    <span className={`housekeeping-room-badge badge-${room.housekeepingStatus.toLowerCase()}`}>{housekeepingLabels[room.housekeepingStatus] ?? room.housekeepingStatus}</span>
                    <span className="housekeeping-room-technical">{technicalLabels[room.technicalStatus] ?? room.technicalStatus}</span>
                    {activeTask?.assignee && <small>Agent : {activeTask.assignee.name}</small>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {selectedRoom && isManager && (
          <section className="housekeeping-room-detail">
            <div className="housekeeping-room-detail-heading">
              <div><p>Fiche chambre</p><h2>Chambre {selectedRoom.number}</h2></div>
              <button type="button" className="housekeeping-secondary" onClick={() => setSelectedRoom(null)}>Fermer</button>
            </div>
            <div className="housekeeping-room-detail-grid">
              <div><small>Catégorie</small><strong>{selectedRoom.category.name}</strong></div>
              <div><small>Étage</small><strong>{selectedRoom.floor ?? 'Non renseigné'}</strong></div>
              <div><small>Capacité</small><strong>{selectedRoom.capacity ?? selectedRoom.category.capacity ?? 'Non renseignée'}</strong></div>
              <div><small>Propreté</small><strong>{housekeepingLabels[selectedRoom.housekeepingStatus] ?? selectedRoom.housekeepingStatus}</strong></div>
              <div><small>Technique</small><strong>{technicalLabels[selectedRoom.technicalStatus] ?? selectedRoom.technicalStatus}</strong></div>
              <div><small>Occupation</small><strong>{selectedRoom.status}</strong></div>
            </div>
            {selectedRoom.description && <p className="housekeeping-room-copy">{selectedRoom.description}</p>}
            <div className="housekeeping-room-columns">
              <div>
                <h3>Derniers nettoyages</h3>
                {selectedRoom.housekeepingTasks.map((task) => <p key={task.id}>{task.title ?? 'Nettoyage'} · {task.status ? statusLabels[task.status] : 'À suivre'} · {task.assignments?.map((assignment) => assignment.agent.name).join(', ') || task.assignee?.name || 'Non affecté'}{task.createdAt ? ` · ${formatDate(task.createdAt)}` : ''}</p>)}
                {!selectedRoom.housekeepingTasks.length && <p>Aucun nettoyage n’est encore enregistré pour cette chambre.</p>}
              </div>
              <div>
                <h3>Incidents</h3>
                {selectedRoom.incidents.map((incident) => <p key={incident.id}>{incident.title} · {incident.status} · {formatDate(incident.createdAt)}</p>)}
                {!selectedRoom.incidents.length && <p>Aucun incident déclaré.</p>}
                <form onSubmit={(event) => void reportIncident(selectedRoom.id, event)} className="housekeeping-incident-form">
                  <input name="title" maxLength={160} minLength={3} required placeholder="Signaler un incident" />
                  <button className="housekeeping-primary" type="submit" disabled={saving}>Signaler</button>
                </form>
              </div>
            </div>
          </section>
        )}

        <section className="housekeeping-list">
          <div className="housekeeping-section-title">
            <span className="housekeeping-section-icon"><ClipboardList size={17} /></span>
            <div><h2>{isManager ? 'Tâches de l’équipe' : 'Tâches affectées'}</h2><p>{tasks.length} tâche{tasks.length === 1 ? '' : 's'} dans la liste</p></div>
          </div>
          {busy ? <p className="housekeeping-empty">Chargement des tâches…</p> : tasks.length === 0 ? (
            <p className="housekeeping-empty">{isManager ? 'Aucune tâche à afficher. Vous pouvez en affecter une ci-dessus.' : 'Aucune tâche ne vous est affectée pour le moment.'}</p>
          ) : (
            <div className="housekeeping-task-grid">
              {tasks.map((task) => (
                <article className="housekeeping-task" key={task.id}>
                  <div className="housekeeping-task-top">
                    <span className={`housekeeping-status status-${task.status.toLowerCase()}`}>{statusLabels[task.status]}</span>
                    <small>Chambre {task.room.number}{task.room.floor ? ` · ${task.room.floor}` : ''}</small>
                  </div>
                  <h3>{task.title}</h3>
                  {task.notes && <p className="housekeeping-task-notes">{task.notes}</p>}
                  <div className="housekeeping-task-meta">
                    {isManager && <span>Affectée à <strong>{task.assignees.map((agent) => agent.name).join(', ') || task.assignee?.name || 'À affecter'}</strong></span>}
                    <span>Créée le {formatDate(task.createdAt)}</span>
                  </div>
                  {task.inspectionNote && <p className="housekeeping-inspection-note"><strong>Retour d’inspection :</strong> {task.inspectionNote}</p>}
                  {isManager && task.status === 'READY_FOR_INSPECTION' && (
                    <div className="housekeeping-inspection">
                      <label>
                        <span>Note d’inspection (obligatoire en cas de reprise)</span>
                        <textarea value={inspectionNotes[task.id] ?? ''} onChange={(event) => setInspectionNotes({ ...inspectionNotes, [task.id]: event.target.value })} maxLength={500} rows={2} />
                      </label>
                      <div>
                        <button className="housekeeping-primary" type="button" onClick={() => void updateTask(task, 'INSPECTION_PASSED')} disabled={saving}><Check size={15} /> Valider</button>
                        <button className="housekeeping-secondary" type="button" onClick={() => void updateTask(task, 'INSPECTION_FAILED')} disabled={saving}><RotateCcw size={15} /> À reprendre</button>
                      </div>
                    </div>
                  )}
                  {!isManager && task.status === 'PENDING' && <button className="housekeeping-primary" type="button" onClick={() => void updateTask(task, 'START')} disabled={saving}>Commencer</button>}
                  {!isManager && task.status === 'IN_PROGRESS' && <button className="housekeeping-primary" type="button" onClick={() => void updateTask(task, 'COMPLETE')} disabled={saving}>Marquer la tâche terminée</button>}
                  {isManager && task.status === 'COMPLETED' && task.inspector && <small className="housekeeping-inspector">Inspectée par {task.inspector.name}</small>}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
