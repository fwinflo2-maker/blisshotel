'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { Bell, Beer, ChefHat, ClipboardList, Clock3, LayoutDashboard, LogOut, Menu, PackageOpen, Plus, ReceiptText, Search, ShieldCheck, Utensils, Wine, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import styles from './restaurant-workspace.module.css';

type Role = 'manager' | 'server';
type Panel = 'dashboard' | 'orders' | 'menu' | 'stock';
type MenuItem = { id: string; code: string | null; name: string; description: string | null; category: 'FOOD' | 'DRINK' | 'BREAKFAST'; billingUnit: 'ITEM' | 'ROOM_NIGHT'; price: string; active: boolean };
type OrderLineDraft = { id: string; name: string; category: MenuItem['category']; quantity: string; unitPrice: string };
type RoomOption = { id: string; number: string };
type ActiveStay = { reservationId: string; reference: string; room: { id: string; number: string }; guestName: string; nights: number; checkOutDate: string };
type RestaurantOrder = { id: string; number: string; source: 'ROOM_SERVICE' | 'RESTAURANT'; status: 'PENDING_RECEPTION' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'REJECTED'; guestName: string; notes: string | null; totalAmount: string; createdAt: string; room: { id: string; number: string } | null; reservation: { reference: string; client: { name: string; phone: string | null } } | null; lines: { id: string; name: string; category: string; billingUnit: string; quantity: number; unitPrice: string; lineTotal: string }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(data?.error ?? `La requête a échoué (HTTP ${response.status}).`);
  if (!data) throw new Error('Réponse vide du serveur.');
  return data;
}

function money(value: string | number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(value));
}

const categoryLabels: Record<MenuItem['category'], string> = { FOOD: 'Cuisine', DRINK: 'Boissons', BREAKFAST: 'Petit-déjeuner' };
const orderStatusLabels: Record<RestaurantOrder['status'], string> = { PENDING_RECEPTION: 'À confirmer en réception', CONFIRMED: 'Confirmée', PREPARING: 'En préparation', READY: 'Prête', SERVED: 'Servie', REJECTED: 'Refusée' };

const panels: { id: Panel; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Vue d’ensemble', icon: LayoutDashboard },
  { id: 'orders', label: 'Commandes', icon: ClipboardList },
  { id: 'menu', label: 'Carte & produits', icon: Utensils },
  { id: 'stock', label: 'Stocks', icon: PackageOpen },
];

export default function RestaurantWorkspace({ name, role }: { name: string; role: Role }) {
  const [panel, setPanel] = useState<Panel>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useDashboardTheme();
  const router = useRouter();
  const manager = role === 'manager';
  const roleName = manager ? 'Responsable Restaurant & Bar' : 'Serveuse du bar';
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveStay[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [orderRoomId, setOrderRoomId] = useState('');
  const [roomNumberConfirmed, setRoomNumberConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orderSource, setOrderSource] = useState<'ROOM_SERVICE' | 'RESTAURANT'>(role === 'server' ? 'RESTAURANT' : 'ROOM_SERVICE');
  const [orderLines, setOrderLines] = useState<OrderLineDraft[]>([{ id: 'line-1', name: '', category: 'FOOD', quantity: '1', unitPrice: '' }]);
  const [menuForm, setMenuForm] = useState({ name: '', description: '', category: 'FOOD' as MenuItem['category'], billingUnit: 'ITEM' as MenuItem['billingUnit'], price: '' });
  const activeOrders = orders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status));
  const waitingReception = orders.filter((order) => order.status === 'PENDING_RECEPTION');
  const servedToday = orders.filter((order) => order.status === 'SERVED' && new Date(order.createdAt).toDateString() === new Date().toDateString());
  const servedTotal = servedToday.reduce((total, order) => total + Number(order.totalAmount), 0);

  const loadData = useCallback(async () => {
    const [menu, orderData] = await Promise.all([
      api<{ items: MenuItem[] }>('/api/restaurant/menu'),
      api<{ orders: RestaurantOrder[]; activeStays: ActiveStay[]; rooms: RoomOption[] }>('/api/restaurant/orders'),
    ]);
    setMenuItems(menu.items);
    setOrders(orderData.orders);
    setActiveStays(orderData.activeStays);
    setRooms(orderData.rooms);
    setOrderRoomId((current) => orderData.activeStays.some((stay) => stay.room.id === current)
      ? current
      : orderData.activeStays[0]?.room.id ?? '');

  }, []);

  useEffect(() => {
    void loadData().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Chargement du restaurant impossible.'));
    const timer = window.setInterval(() => { void loadData().catch(() => undefined); }, 10000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedStay = activeStays.find((stay) => stay.room.id === orderRoomId);
    const invalidLine = orderLines.some((line) => line.name.trim().length < 2 || line.name.trim().length > 160 || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1 || Number(line.quantity) > 99 || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 50 || Number(line.unitPrice) > 100000000);
    if (!orderRoomId) {
      setError('Choisissez une chambre avec un sejour actif pour rattacher la consommation au bon folio.');
      return;
    }
    if (!selectedStay) {
      setError('Aucun sejour actif ne correspond a cette chambre. La consommation ne peut pas etre envoyee comme dette.');
      return;
    }
    if (!roomNumberConfirmed) {
      setError('Cochez la confirmation apres avoir verifie le numero de chambre avec le client.');
      return;
    }
    if (invalidLine) {
      setError('Completez chaque produit (2 a 160 caracteres), indiquez une quantite entiere et un prix unitaire d’au moins 50 FCFA.');
      return;
    }
    const selectedRoom = rooms.find((room) => room.id === orderRoomId);
    if (!selectedRoom) {
      setError('Cette chambre est introuvable. Actualisez la page puis reessayez.');
      return;
    }
    if (!window.confirm(`Confirmez-vous le numero de chambre ${selectedRoom.number} ?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/orders', {
        method: 'POST',
        body: JSON.stringify({ roomId: orderRoomId, reservationId: selectedStay.reservationId, source: orderSource, items: orderLines.map((line) => ({ name: line.name.trim(), category: line.category, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })) }),
      });
      setOrderLines([{ id: `line-${Date.now()}`, name: '', category: 'FOOD', quantity: '1', unitPrice: '' }]); setRoomNumberConfirmed(false); setNotice('Consommation envoyée à la réception comme dette à valider sur le séjour.');
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Creation de la commande impossible.');
    } finally { setBusy(false); }
  }

  async function updateOrder(order: RestaurantOrder, status: 'PREPARING' | 'READY' | 'SERVED') {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/restaurant/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Commande ${order.number} : ${orderStatusLabels[status].toLowerCase()}.`);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mise à jour de la commande impossible.');
    } finally { setBusy(false); }
  }

  async function saveMenuItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/menu', { method: 'POST', body: JSON.stringify(menuForm) });
      setMenuForm({ name: '', description: '', category: 'FOOD', billingUnit: 'ITEM', price: '' });
      setNotice('Produit ajouté à la carte.'); await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement du produit impossible.');
    } finally { setBusy(false); }
  }

  async function toggleMenuItem(item: MenuItem) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/restaurant/menu/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      setNotice(item.active ? 'Produit masqué de la carte.' : 'Produit remis en vente.'); await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Modification du produit impossible.');
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/connexion');
    router.refresh();
  }

  return <div className={`${styles.shell} ${manager ? styles.managerShell : styles.serverShell}`} data-theme={theme}>
    <ProfileLauncher name={name} />
    {menuOpen && <button className={styles.backdrop} aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.brand}><span className={styles.brandMark}><Wine size={19} /></span><span><strong>BLISS HOTEL</strong><small>Bar & restaurant</small></span><button className={styles.mobileClose} onClick={() => setMenuOpen(false)} aria-label="Fermer"><X size={18} /></button></div>
      <div className={styles.serviceBadge}><i /> Espace de service</div>
      <nav aria-label="Navigation Bar & Restaurant">{panels.filter((item) => manager || ['dashboard', 'orders'].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} className={`${styles.navItem} ${panel === id ? styles.navActive : ''}`} onClick={() => { setPanel(id); setMenuOpen(false); }}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <div className={styles.sidebarBottom}><div className={styles.user}><span>{name.slice(0, 1).toLocaleUpperCase('fr-FR')}</span><div><strong>{name}</strong><small>{roleName}</small></div></div><button className={styles.logout} onClick={() => void logout()}><LogOut size={15} />Déconnexion</button></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}><button className={styles.mobileMenu} onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Menu size={18} /></button><div><span>BLISS HOTEL</span><i>/</i><strong>{panels.find((item) => item.id === panel)?.label}</strong></div><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /><span className={styles.topRole}>{manager ? <ChefHat size={14} /> : <Beer size={14} />}{roleName}</span></header>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroContent}><p className={styles.eyebrow}>{manager ? 'PILOTAGE DU POINT DE VENTE' : 'ESPACE PERSONNEL DE SERVICE'}</p><h1>{manager ? 'Bar & Restaurant' : `Bonjour ${name.split(' ')[0]}`}</h1><p>{manager ? 'La salle, le bar et le service réunis dans un espace clair.' : 'Votre espace de travail pour le service du bar.'}</p>
            <div className={styles.heroMeta}><span><i />BLISS HOTEL · Établissement unique</span><span><Clock3 size={14} />{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())}</span></div>
          </div>
          <div className={styles.heroIcon}><Wine size={31} strokeWidth={1.35} /></div>
        </section>

        <div className={styles.panelHeading}><div><p>{panel === 'dashboard' ? 'TABLEAU DE BORD' : manager ? 'GESTION DU SERVICE' : 'MON SERVICE'}</p><h2>{panel === 'dashboard' ? manager ? 'Vue du service' : 'Mon poste de service' : panels.find((item) => item.id === panel)?.label}</h2></div><span className={styles.live}><i />{manager ? 'Source de données' : 'Poste de service'}</span></div>

        {error && <div className={styles.formError} role="alert">{error}</div>}
        {notice && <div className={styles.formNotice} role="status">{notice}</div>}
        {!manager && panel === 'dashboard' && <section className={styles.serverDashboard}>
          <div className={styles.serverWelcome}>
            <div className={styles.serverWelcomeText}><span className={styles.serverOverline}>ESPACE DE SERVICE</span><h3>Commandes<br />en direct<span>.</span></h3><p>Saisissez les demandes des clients en chambre ou au restaurant. La reception confirme la facturation.</p><button type="button" onClick={() => setPanel('orders')}><ClipboardList size={17} />Saisir une commande <span>→</span></button></div>
            <div className={styles.serverOrb} aria-hidden="true"><span className={styles.orbRing} /><span className={styles.orbInner}><Beer size={31} strokeWidth={1.3} /></span><i /><b /></div>
            <span className={styles.serverWelcomeFoot}>BAR · RESTAURANT <span>BLISS HOTEL</span></span>
          </div>
          <div className={styles.serverStatus}>
            <div className={styles.serverSectionTitle}><div><span>FILE DE SERVICE</span><h3>Etat des commandes</h3></div><span className={styles.statusUnlinked}><i />Actualisation 10 s</span></div>
            <div className={styles.serverKpis}>{[{ icon: ClipboardList, label: 'A confirmer', value: waitingReception.length }, { icon: ChefHat, label: 'En preparation', value: orders.filter((order) => order.status === 'PREPARING').length }, { icon: Wine, label: 'Pretes a servir', value: orders.filter((order) => order.status === 'READY').length }].map(({ icon: Icon, label, value }) => <article key={label}><span><Icon size={17} /></span><div><strong>{value}</strong><small>{label}</small></div></article>)}</div>
            <div className={styles.serviceFlow}><div className={styles.flowLabel}><strong>Etapes de traitement</strong><span>Reception puis service</span></div><div className={styles.flowSteps}>{['Commande', 'Confirmation', 'Preparation', 'Servie'].map((stage, index) => <div className={styles.flowStep} key={stage}><span>{String(index + 1).padStart(2, '0')}</span><i /><strong>{stage}</strong></div>)}</div></div>
          </div>
          <div className={styles.serverQueue}>
            <div className={styles.serverSectionTitle}><div><span>RECENTES</span><h3>Commandes recentes</h3></div><button type="button" onClick={() => setPanel('orders')}>Tout voir <span>→</span></button></div>
            {orders.length ? orders.slice(0, 4).map((order) => <div className={styles.queueOrder} key={order.id}><div><strong>{order.number} · {order.room ? `Ch. ${order.room?.number ?? 'A rattacher'}` : '? rattacher'}</strong><small>{order.guestName} · {orderStatusLabels[order.status]}</small></div><b>{money(order.totalAmount)}</b></div>) : <div className={styles.queueEmpty}><div className={styles.queueArtwork}><span /><ClipboardList size={24} /></div><div><strong>Aucune commande</strong><p>Les demandes recues en chambre ou au restaurant s'afficheront ici.</p></div><span className={styles.queueWait}>PRET</span></div>}
          </div>
          <div className={styles.serverHint}><span><ShieldCheck size={17} /></span><p><strong>Confirmation obligatoire.</strong> Les commandes ne sont facturees qu'apres validation par la reception.</p><span className={styles.hintSpark}>✳</span></div>
        </section>}

        {panel === 'dashboard' && manager && <>
          <section className={styles.metricGrid}>
            {[
              { title: 'Ventes servies aujourd’hui', value: money(servedTotal), hint: `${servedToday.length} commande(s) terminée(s)`, icon: ReceiptText },
              { title: 'À valider en réception', value: String(waitingReception.length), hint: 'En attente de transfert au folio', icon: ClipboardList },
              { title: 'Commandes en cours', value: String(activeOrders.length), hint: 'Préparation, prêtes ou confirmées', icon: ChefHat },
              { title: 'Produits à la carte', value: String(menuItems.filter((item) => item.active).length), hint: 'Plats, boissons et petit-déjeuner', icon: Utensils },
            ].map(({ title, value, hint, icon: Icon }) => <article className={styles.metric} key={title}><span className={styles.metricIcon}><Icon size={17} /></span><div><p>{title}</p><strong>{value}</strong><small>{hint}</small></div><span className={styles.metricStatus}>Données enregistrées</span></article>)}
          </section>
          <section className={styles.dashboardGrid}>
            <article className={styles.card}><div className={styles.cardHeading}><div><p>À SUIVRE</p><h3>Dernières commandes</h3></div><ClipboardList size={18} /></div>{orders.length ? orders.slice(0, 5).map((order) => <div className={styles.queueOrder} key={order.id}><div><strong>{order.number} · {order.room ? `Ch. ${order.room?.number ?? 'A rattacher'}` : 'A rattacher'}</strong><small>{order.guestName} · {orderStatusLabels[order.status]}</small></div><b>{money(order.totalAmount)}</b></div>) : <EmptyState title="Aucune commande enregistrée" detail="Les demandes du restaurant apparaîtront dans cette liste." />}</article>
            <article className={styles.card}><div className={styles.cardHeading}><div><p>OPTION A LA CARTE</p><h3>Petit-dejeuner</h3></div><ReceiptText size={18} /></div><div className={styles.breakfastOffer}><strong>5 000 FCFA la portion</strong><span>Commande facultative, a toute heure</span><small>Le client choisit librement le petit-dejeuner ou d'autres plats et boissons. Chaque produit est facture selon les quantites commandees.</small><button type="button" onClick={() => setPanel('menu')}>Voir la carte</button></div></article>
          </section>
        </>}


        {panel === 'orders' && <div className={styles.ordersLayout}>
          <section className={styles.card}>
            <div className={styles.cardHeading}><div><p>CONSOMMATION À IMPUTER AU SÉJOUR</p><h3>{role === 'server' ? 'Consommation au bar-restaurant' : 'Consommation client'}</h3></div><Plus size={18} /></div>
            <form className={styles.orderForm} onSubmit={createOrder}>
              <div className={styles.formGrid}>
                <label><span>Numero de chambre</span><select value={orderRoomId} onChange={(event) => { setOrderRoomId(event.target.value); setRoomNumberConfirmed(false); setError(''); }}><option value="">Choisir une chambre</option>{rooms.map((room) => { const stay = activeStays.find((item) => item.room.id === room.id); return <option key={room.id} value={room.id} disabled={!stay}>{stay ? `Chambre ${room.number} · séjour actif` : `Chambre ${room.number} · sans séjour actif`}</option>; })}</select></label>
                <label><span>Le client consomme</span><select value={orderSource} onChange={(event) => setOrderSource(event.target.value as 'ROOM_SERVICE' | 'RESTAURANT')}><option value="RESTAURANT">Au bar-restaurant</option><option value="ROOM_SERVICE">Dans sa chambre</option></select></label>
              </div>
              <label className={styles.fullField}><span>Confirmation du numero de chambre</span><span><input type="checkbox" checked={roomNumberConfirmed} onChange={(event) => { setRoomNumberConfirmed(event.target.checked); setError('' ); }} /> Je confirme avoir verifie le numero de chambre avec le client.</span></label>
              <div className={styles.orderProducts}>{orderLines.map((line, index) => <div className={styles.orderProduct} key={line.id}>
                <label><span>Produit</span><input value={line.name} onChange={(event) => setOrderLines((current) => current.map((item) => item.id === line.id ? { ...item, name: event.target.value } : item))} maxLength={160} placeholder="Ex. Bière, petit-déjeuner, plat…" /></label>
                <label><span>Catégorie</span><select value={line.category} onChange={(event) => setOrderLines((current) => current.map((item) => item.id === line.id ? { ...item, category: event.target.value as MenuItem['category'] } : item))}><option value="FOOD">Cuisine</option><option value="DRINK">Boisson</option><option value="BREAKFAST">Petit-déjeuner</option></select></label>
                <label><span>Quantité</span><input type="number" value={line.quantity} onChange={(event) => setOrderLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} /></label>
                <label><span>Prix unitaire FCFA</span><input type="number" value={line.unitPrice} onChange={(event) => setOrderLines((current) => current.map((item) => item.id === line.id ? { ...item, unitPrice: event.target.value } : item))} /></label>
                {orderLines.length > 1 && <button type="button" className={styles.actionButton} aria-label={`Retirer le produit ${index + 1}`} onClick={() => setOrderLines((current) => current.filter((item) => item.id !== line.id))}>Retirer</button>}
              </div>)}</div>
              <button type="button" className={styles.actionButton} disabled={orderLines.length >= 30} onClick={() => setOrderLines((current) => [...current, { id: `line-${Date.now()}-${current.length}`, name: '', category: 'FOOD', quantity: '1', unitPrice: '' }])}><Plus size={15} /> Ajouter un produit</button>
              <div className={styles.orderSubmit}><p>La serveuse saisit les produits consommés et leurs prix. Le client peut consommer maintenant sans payer ; la réception ajoutera le total comme dette au séjour.</p><button type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Déclarer la consommation'}</button></div>
            </form>
          </section>
          <section className={styles.card}>
            <div className={styles.cardHeading}><div><p>FILE DE SERVICE</p><h3>Commandes récentes</h3></div><ClipboardList size={18} /></div>
            {orders.length ? <div className={styles.orderList}>{orders.map((order) => {
              const next = order.status === 'CONFIRMED' ? 'PREPARING' : order.status === 'PREPARING' ? 'READY' : order.status === 'READY' ? 'SERVED' : null;
              return <article className={styles.orderCard} key={order.id}><header><div><strong>{order.number} · {order.room ? `Ch. ${order.room?.number ?? 'A rattacher'}` : 'A rattacher'}</strong><small>{order.guestName} · {order.source === 'ROOM_SERVICE' ? 'En chambre' : 'Au restaurant'}</small></div><b>{money(order.totalAmount)}</b></header><span className={`${styles.orderStatus} ${styles[`status_${order.status}`]}`}>{orderStatusLabels[order.status]}</span><ul>{order.lines.map((line) => <li key={line.id}>{line.name} · {line.billingUnit === 'ROOM_NIGHT' ? `${line.quantity} nuitée(s)` : `× ${line.quantity}`}<strong>{money(line.lineTotal)}</strong></li>)}</ul>{order.notes && <p className={styles.orderNote}>{order.notes}</p>}{next && <button className={styles.actionButton} type="button" disabled={busy} onClick={() => void updateOrder(order, next)}>{next === 'PREPARING' ? 'Démarrer la préparation' : next === 'READY' ? 'Marquer prête' : 'Confirmer le service'}</button>}</article>;
            })}</div> : <EmptyState title="Aucune commande" detail="Les demandes reçues en chambre ou au restaurant apparaîtront ici." />}
          </section>
        </div>}
        {panel === 'menu' && <section className={styles.card}>
          <div className={styles.cardHeading}><div><p>OFFRE BAR & RESTAURANT</p><h3>Carte et produits</h3></div><Utensils size={18} /></div>
          {manager && <form className={styles.menuForm} onSubmit={saveMenuItem}>
            <label><span>Nom du produit</span><input value={menuForm.name} maxLength={160} onChange={(event) => setMenuForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>Catégorie</span><select value={menuForm.category} onChange={(event) => setMenuForm((current) => ({ ...current, category: event.target.value as MenuItem['category'] }))}><option value="FOOD">Cuisine</option><option value="DRINK">Boissons</option><option value="BREAKFAST">Petit-déjeuner</option></select></label>
            <label><span>Prix FCFA</span><input type="number" min="0" step="50" value={menuForm.price} onChange={(event) => setMenuForm((current) => ({ ...current, price: event.target.value }))} /></label>
            <label className={styles.menuDescription}><span>Description</span><input value={menuForm.description} maxLength={500} onChange={(event) => setMenuForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label><span>Tarification</span><select value={menuForm.billingUnit} onChange={(event) => setMenuForm((current) => ({ ...current, billingUnit: event.target.value as MenuItem['billingUnit'] }))}><option value="ITEM">Par unité</option><option value="ROOM_NIGHT">Par chambre et par nuit</option></select></label>
            <button type="submit" disabled={busy}><Plus size={15} />Ajouter à la carte</button>
          </form>}
          {menuItems.length ? <div className={styles.menuGrid}>{menuItems.map((item) => <article className={`${styles.menuItem} ${!item.active ? styles.inactiveMenuItem : ''}`} key={item.id}><span className={styles.menuCategory}>{categoryLabels[item.category]}</span><strong>{item.name}</strong><small>{item.description ?? (item.billingUnit === 'ROOM_NIGHT' ? 'Forfait par chambre et par nuit' : 'Disponible à la commande')}</small><b>{money(item.price)}{item.billingUnit === 'ROOM_NIGHT' ? ' / nuit' : ''}</b>{manager && <button type="button" disabled={busy} onClick={() => void toggleMenuItem(item)}>{item.active ? 'Masquer de la carte' : 'Remettre en vente'}</button>}</article>)}</div> : <EmptyState title="Carte vide" detail="Le responsable peut ajouter des plats et boissons depuis ce panneau." />}
        </section>}
        {panel === 'stock' && <section className={styles.card}><div className={styles.cardHeading}><div><p>APPROVISIONNEMENT</p><h3>État des stocks</h3></div><PackageOpen size={18} /></div><div className={styles.emptyIllustration}><span><PackageOpen size={22} /></span><h3>Aucun stock suivi</h3><p>Les niveaux, mouvements et seuils de réapprovisionnement ne sont pas encore disponibles dans le système.</p></div></section>}

        <footer className={styles.footer}><span>BLISS HOTEL · Bar & Restaurant</span><span>{manager ? 'Supervision et gestion de l’équipe' : 'Vue personnelle · Serveuse du bar'}</span></footer>
      </div>
    </main>
  </div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.emptyState}><span><Search size={16} /></span><strong>{title}</strong><p>{detail}</p></div>;
}
