'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ProfileLauncher } from '@/components/profile-settings';
import { BedDouble, Beer, ChefHat, ClipboardList, Clock3, LayoutDashboard, LogOut, Menu, PackageOpen, Plus, ReceiptText, Search, ShieldCheck, Trash2, UserPlus, Users, Utensils, Wallet, Wine, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import BusinessActivityExplorer from '@/components/business-activity-explorer';
import ShiftReportPrintDialog from '@/features/shift-reports/shift-report-print-dialog';
import type { ShiftReport } from '@/features/shift-reports/types';
import styles from './restaurant-workspace.module.css';

type Role = 'manager' | 'server';
type Panel = 'dashboard' | 'orders' | 'menu' | 'stock' | 'accounting' | 'team' | 'cash' | 'notifications';
type MenuCategory = 'FOOD' | 'DRINK' | 'BREAKFAST' | 'SOFT_DRINK' | 'JUICE' | 'WATER' | 'BEER' | 'WINE' | 'WHISKY' | 'SPIRIT' | 'COCKTAIL' | 'STARTER' | 'DESSERT' | 'OTHER';
type MenuItem = { id: string; code: string | null; name: string; description: string | null; category: MenuCategory; billingUnit: 'ITEM' | 'ROOM_NIGHT'; price: string; purchasePrice?: string | null; stockUnit?: string | null; active: boolean };
type OrderLineDraft = { id: string; menuItemId: string; name: string; category: MenuItem['category']; quantity: string; unitPrice: string };
type ActiveStay = { reservationId: string; reference: string; room: { id: string; number: string }; guestName: string; nights: number; checkOutDate: string };
type RestaurantOrder = { id: string; number: string; source: 'ROOM_SERVICE' | 'RESTAURANT'; status: 'PENDING_RECEPTION' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'REJECTED'; guestName: string; createdBy: string; createdByName: string; paidAt: string | null; paidByName: string | null; paymentMethod: { id: string; code: string; name: string } | null; folioLine: { id: string } | null; notes: string | null; totalAmount: string; createdAt: string; room: { id: string; number: string } | null; reservation: { reference: string; client: { name: string; phone: string | null } } | null; lines: { id: string; name: string; category: string; billingUnit: string; quantity: number; unitPrice: string; lineTotal: string }[] };
type PaymentMethod = { id: string; code: string; name: string };
type StockCountSnapshot = { quantity: string; previousQuantity: string | null; countedBy: string; createdAt: string; note: string | null };
type StockItem = { id: string; name: string; category: MenuCategory; billingUnit: 'ITEM' | 'ROOM_NIGHT'; active: boolean; stockQuantity: string | null; stockUnit: string | null; stockAlertAt: string | null; lastCount: StockCountSnapshot | null; todayCount: StockCountSnapshot | null };
type StockMovement = { id: string; type: 'SUPPLY' | 'SALE' | 'LOSS' | 'INTERNAL_USE' | 'ADJUSTMENT' | 'COUNT' | 'REVERSAL'; quantity: string; previousQuantity: string | null; resultingQuantity: string | null; reference: string | null; note: string | null; createdByName: string; createdAt: string; menuItem: { id: string; name: string; stockUnit: string | null } };
type StockMovementType = 'SUPPLY' | 'LOSS' | 'INTERNAL_USE';
type ServerCashSession = { id: string; status: 'OPEN' | 'CLOSED'; openingAmount: string; cashReceived: string; expectedCash: string; countedAmount: string | null; variance: string | null; openedAt: string; closedAt: string | null; shiftType: 'DAY' | 'NIGHT' | null; shiftStartedAt: string | null; shiftEndedAt: string | null; transactions: { id: string; amount: string; method: string; methodCode: string; description: string | null; reference: string | null; createdAt: string }[]; report?: ShiftReport | null };
type ServerNotification = { id: string; message: string; readAt: string | null; createdAt: string };
type ManagerDashboard = { date: string; orders: number; cancelled: number; breakfastAssociations: { count: number; amount: string }; sales: { orders: number; amount: string }; collected: { orders: number; amount: string }; weekSales: { orders: number; amount: string }; monthSales: { orders: number; amount: string }; walkInSales: { orders: number; amount: string }; hostedSales: { orders: number; amount: string }; transferred: { orders: number; amount: string }; inventory: { tracked: number; outOfStock: number; lowStock: number; value: string }; recentSupplies: { item: string; quantity: string; unit: string | null; at: string }[]; topProducts: { name: string; quantity: number }[]; salesByServer: { name: string; orders: number; served: number; sales: string; collected: string }[] };
type ServerAccount = { id: string; name: string; email: string; active: boolean; createdAt: string };

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

const categoryLabels: Record<MenuItem['category'], string> = { FOOD: 'Plats', DRINK: 'Boissons', BREAKFAST: 'Petit-déjeuner', SOFT_DRINK: 'Boissons gazeuses', JUICE: 'Jus', WATER: 'Eaux', BEER: 'Bières', WINE: 'Vins', WHISKY: 'Whiskys', SPIRIT: 'Spiritueux', COCKTAIL: 'Cocktails', STARTER: 'Entrées', DESSERT: 'Desserts', OTHER: 'Autres produits' };
const preparedProductCategories: MenuItem['category'][] = ['FOOD', 'STARTER', 'DESSERT', 'BREAKFAST', 'COCKTAIL'];
function hasDirectPurchasePrice(category: MenuItem['category']) { return !preparedProductCategories.includes(category); }
const orderStatusLabels: Record<RestaurantOrder['status'], string> = { PENDING_RECEPTION: 'À confirmer en réception', CONFIRMED: 'Confirmée', PREPARING: 'En préparation', READY: 'Prête', SERVED: 'Servie', REJECTED: 'Refusée' };
const stockMovementLabels: Record<StockMovement['type'], string> = { SUPPLY: 'Approvisionnement', SALE: 'Vente', LOSS: 'Perte', INTERNAL_USE: 'Consommation interne', ADJUSTMENT: 'Ajustement', COUNT: 'Inventaire physique', REVERSAL: 'Annulation' };

function defaultStockUnit(category: MenuItem['category']) {
  return ['DRINK', 'SOFT_DRINK', 'JUICE', 'WATER', 'BEER', 'WINE', 'WHISKY', 'SPIRIT', 'COCKTAIL'].includes(category) ? 'bouteille(s)' : 'unité(s)';
}

function counterpartLabel(order: RestaurantOrder) {
  if (order.room) return `Ch. ${order.room.number}`;
  return order.paidAt ? 'Client non logé' : 'À rattacher';
}

const panels: { id: Panel; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Vue d’ensemble', icon: LayoutDashboard },
  { id: 'team', label: 'Équipe', icon: UserPlus },
  { id: 'orders', label: 'Commandes', icon: ClipboardList },
  { id: 'cash', label: 'Ma caisse', icon: Wallet },
  { id: 'notifications', label: 'Notifications', icon: Clock3 },
  { id: 'menu', label: 'Carte & produits', icon: Utensils },
  { id: 'stock', label: 'Stocks', icon: PackageOpen },
  { id: 'accounting', label: 'Comptabilité du service', icon: ReceiptText },
];

export default function RestaurantWorkspace({ name, role }: { name: string; role: Role }) {
  const [panel, setPanel] = useState<Panel>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useDashboardTheme();
  const router = useRouter();
  const manager = role === 'manager';
  const roleName = manager ? 'Responsable Restaurant & Bar' : 'Serveuse du bar';
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [movementForm, setMovementForm] = useState({ menuItemId: '', type: 'SUPPLY' as StockMovementType, quantity: '', note: '' });
  const [managerDashboard, setManagerDashboard] = useState<ManagerDashboard | null>(null);
  const [serverAccounts, setServerAccounts] = useState<ServerAccount[]>([]);
  const [serverForm, setServerForm] = useState({ name: '', email: '', password: '' });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [cashSession, setCashSession] = useState<ServerCashSession | null>(null);
  const [cashHistory, setCashHistory] = useState<ServerCashSession[]>([]);
  const [selectedServerReport, setSelectedServerReport] = useState<ShiftReport | null>(null);
  const [reportHotel, setReportHotel] = useState({ name: 'BLISS HOTEL', currency: 'XAF', timezone: 'Africa/Brazzaville' });
  const [serverNotifications, setServerNotifications] = useState<ServerNotification[]>([]);
  const [cashAmount, setCashAmount] = useState('');
  const [countedCashAmount, setCountedCashAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [stockDrafts, setStockDrafts] = useState<Record<string, { quantity: string; unit: string; alertAt: string; note: string }>>({});
  const stockDraftDate = useRef<string | null>(null);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveStay[]>([]);
  const [orderRoomId, setOrderRoomId] = useState('');
  const [roomNumberConfirmed, setRoomNumberConfirmed] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orderSource, setOrderSource] = useState<'ROOM_SERVICE' | 'RESTAURANT'>(role === 'server' ? 'RESTAURANT' : 'ROOM_SERVICE');
  const [orderLines, setOrderLines] = useState<OrderLineDraft[]>([{ id: 'line-1', menuItemId: '', name: '', category: 'FOOD', quantity: '1', unitPrice: '' }]);
  const selectedOrderStay = activeStays.find((stay) => stay.room.id === orderRoomId);
  const lineTotal = (line: OrderLineDraft) => {
    const item = menuItems.find((candidate) => candidate.id === line.menuItemId);
    const quantity = item?.billingUnit === 'ROOM_NIGHT' ? (walkIn ? 1 : selectedOrderStay?.nights ?? 1) : Math.max(0, Number(line.quantity) || 0);
    return Number(item?.price ?? 0) * quantity;
  };
  const orderTotal = orderLines.reduce((sum, line) => sum + lineTotal(line), 0);
  const cashMethodSelected = paymentMethods.find((method) => method.id === paymentMethodId)?.code === 'CASH';
  const [menuForm, setMenuForm] = useState({ name: '', description: '', category: 'FOOD' as MenuItem['category'], billingUnit: 'ITEM' as MenuItem['billingUnit'], price: '', purchasePrice: '' });
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { price: string; purchasePrice: string }>>({});
  const [priceEditingItemId, setPriceEditingItemId] = useState<string | null>(null);
  const activeOrders = orders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status));
  const configuredBreakfast = menuItems.find((item) => item.code === 'BREAKFAST_ROOM_NIGHT' && item.active);
  const inventoryItems = stockItems.filter((item) => item.billingUnit === 'ITEM' && (item.active || item.stockQuantity !== null));
  const movementItem = inventoryItems.find((item) => item.id === movementForm.menuItemId) ?? inventoryItems[0] ?? null;
  const trackedStockCount = inventoryItems.filter((item) => item.stockQuantity !== null).length;
  const stockNeedsAttention = inventoryItems.filter((item) => item.stockQuantity === null || Number(item.stockQuantity) <= 0 || (item.stockAlertAt !== null && Number(item.stockQuantity) <= Number(item.stockAlertAt))).length;
  const stockCountedToday = inventoryItems.filter((item) => item.todayCount !== null).length;
  const stockCountPendingItems = inventoryItems.filter((item) => item.todayCount === null);
  const breakfastNotifications = serverNotifications.filter((notification) => notification.message.includes('Petit-déjeuner associé'));
  const stockCountProgress = inventoryItems.length ? Math.round((stockCountedToday / inventoryItems.length) * 100) : 0;
  const latestStockCountToday = inventoryItems.map((item) => item.todayCount).filter((count): count is StockCountSnapshot => count !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const waitingReception = orders.filter((order) => order.status === 'PENDING_RECEPTION');
  const servedToday = orders.filter((order) => order.status === 'SERVED' && new Date(order.createdAt).toDateString() === new Date().toDateString());
  const serverCollectedToday = orders.filter((order) => order.paidAt && new Date(order.paidAt).toDateString() === new Date().toDateString()).reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const serverRoomTransferredToday = orders.filter((order) => order.folioLine && new Date(order.createdAt).toDateString() === new Date().toDateString()).reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const servedTotal = managerDashboard ? Number(managerDashboard.sales.amount) : servedToday.reduce((total, order) => total + Number(order.totalAmount), 0);
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString());
  const directCollectedToday = managerDashboard ? Number(managerDashboard.collected.amount) : todayOrders.filter((order) => order.paidAt).reduce((total, order) => total + Number(order.totalAmount), 0);
  const serverToday = managerDashboard?.salesByServer.map((server) => [server.name, { count: server.orders, served: server.served, sales: Number(server.sales), collected: Number(server.collected) }] as const)
    ?? [...todayOrders.reduce((map, order) => {
      const row = map.get(order.createdByName) ?? { count: 0, served: 0, sales: 0, collected: 0 };
      row.count++;
      if (order.status === 'SERVED') { row.served++; row.sales += Number(order.totalAmount); }
      if (order.paidAt) row.collected += Number(order.totalAmount);
      map.set(order.createdByName, row);
      return map;
    }, new Map<string, { count: number; served: number; sales: number; collected: number }>()).entries()];

  const loadData = useCallback(async () => {
    const coreResults = await Promise.allSettled([
      api<{ items: MenuItem[] }>('/api/restaurant/menu'),
      api<{ orders: RestaurantOrder[]; activeStays: ActiveStay[]; paymentMethods: PaymentMethod[] }>(`/api/restaurant/orders${role === 'server' ? '?mine=true' : ''}`),
      api<{ activeStays: ActiveStay[] }>('/api/restaurant/stays'),
    ]);
    const [menuResult, ordersResult, staysResult] = coreResults;
    if (menuResult.status === 'fulfilled') {
      setMenuItems(menuResult.value.items);
      setPriceDrafts((current) => Object.fromEntries(menuResult.value.items.map((item) => [item.id, current[item.id] ?? { price: item.price, purchasePrice: item.purchasePrice ?? '' }])));
    }
    if (ordersResult.status === 'fulfilled') {
      setOrders(ordersResult.value.orders);
      setPaymentMethods(ordersResult.value.paymentMethods);
      setPaymentMethodId((current) => ordersResult.value.paymentMethods.some((method) => method.id === current) ? current : ordersResult.value.paymentMethods[0]?.id ?? '');
    }
    const stays = staysResult.status === 'fulfilled' && staysResult.value.activeStays.length
      ? staysResult.value.activeStays
      : ordersResult.status === 'fulfilled'
        ? ordersResult.value.activeStays
        : staysResult.status === 'fulfilled' ? staysResult.value.activeStays : null;
    if (stays) {
      setActiveStays(stays);
      setOrderRoomId((current) => stays.some((stay) => stay.room.id === current) ? current : stays[0]?.room.id ?? '');
    }
    const coreFailure = coreResults.find((result) => result.status === 'rejected');
    if (coreFailure?.status === 'rejected') setError(coreFailure.reason instanceof Error ? coreFailure.reason.message : 'Certaines données du service n’ont pas pu être chargées.');

    const optionalResults = await Promise.allSettled([
      api<{ date: string; items: StockItem[] }>('/api/restaurant/stock'),
      manager ? api<ManagerDashboard>('/api/restaurant/dashboard') : Promise.resolve(null),
      api<{ movements: StockMovement[] }>('/api/restaurant/stock/movements'),
      role === 'server' ? api<{ session: ServerCashSession | null; recent: ServerCashSession[]; hotel: typeof reportHotel }>('/api/restaurant/cash-session') : Promise.resolve(null),
      api<{ notifications: ServerNotification[] }>('/api/restaurant/notifications'),
      manager ? api<{ users: ServerAccount[] }>('/api/restaurant/servers') : Promise.resolve(null),
    ]);
    const [stockResult, dashboardResult, movementsResult, cashResult, notificationsResult, serverAccountsResult] = optionalResults;
    if (stockResult.status === 'fulfilled') {
      setStockItems(stockResult.value.items);
      if (stockDraftDate.current !== stockResult.value.date) {
        stockDraftDate.current = stockResult.value.date;
        setStockDrafts(Object.fromEntries(stockResult.value.items.map((item) => [item.id, { quantity: '', unit: item.stockUnit ?? defaultStockUnit(item.category), alertAt: item.stockAlertAt ?? '', note: '' }])));
      } else {
        setStockDrafts((current) => Object.fromEntries(stockResult.value.items.map((item) => [item.id, current[item.id] ?? { quantity: '', unit: item.stockUnit ?? defaultStockUnit(item.category), alertAt: item.stockAlertAt ?? '', note: '' }])));
      }
    }
    if (dashboardResult.status === 'fulfilled') setManagerDashboard(dashboardResult.value);
    if (movementsResult.status === 'fulfilled') setStockMovements(movementsResult.value.movements);
    if (cashResult.status === 'fulfilled' && cashResult.value) { setCashSession(cashResult.value.session); setCashHistory(cashResult.value.recent); setReportHotel(cashResult.value.hotel); }
    if (notificationsResult.status === 'fulfilled' && notificationsResult.value) setServerNotifications(notificationsResult.value.notifications);
    if (serverAccountsResult.status === 'fulfilled' && serverAccountsResult.value) setServerAccounts(serverAccountsResult.value.users);

  }, [manager, role]);

  async function saveStockCount(item: StockItem) {
    const draft = stockDrafts[item.id];
    if (!draft || draft.quantity === '' || !draft.unit.trim()) { setError('Indiquez la quantité comptée et son unité.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/stock', { method: 'POST', body: JSON.stringify({ menuItemId: item.id, quantity: Number(draft.quantity), ...(manager ? { unit: draft.unit.trim(), alertAt: draft.alertAt === '' ? undefined : Number(draft.alertAt) } : {}), note: draft.note }) });
      setNotice(`Inventaire enregistré pour ${item.name}.`);
      setStockDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? draft), quantity: '', note: '' } }));
      await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement de l’inventaire impossible.'); }
    finally { setBusy(false); }
  }

  async function saveStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const item = inventoryItems.find((candidate) => candidate.id === movementForm.menuItemId) ?? inventoryItems[0];
    const { type, quantity, note } = movementForm;
    if (!item) { setError('Ajoutez un produit au catalogue avant d’enregistrer un mouvement.'); return; }
    if (!quantity || Number(quantity) <= 0) { setError('Indiquez une quantité de mouvement supérieure à zéro.'); return; }
    if (item.stockQuantity === null && type !== 'SUPPLY') { setError('Définissez le stock initial par inventaire ou approvisionnement.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/stock/movements', { method: 'POST', body: JSON.stringify({ menuItemId: item.id, type, quantity: Number(quantity), note }) });
      setNotice(type === 'SUPPLY' ? `Approvisionnement enregistré pour ${item.name}.` : type === 'LOSS' ? `Perte enregistrée pour ${item.name}.` : `Consommation interne enregistrée pour ${item.name}.`);
      setMovementForm((current) => ({ ...current, quantity: '', note: '' })); await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement du mouvement impossible.'); }
    finally { setBusy(false); }
  }

  async function openCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/cash-session', { method: 'POST', body: JSON.stringify({ amount: Number(cashAmount) }) });
      setCashAmount(''); setNotice('Votre caisse est ouverte.'); await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ouverture de caisse impossible.'); }
    finally { setBusy(false); }
  }

  async function closeCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!cashSession) return; setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ report: ShiftReport; hotel: typeof reportHotel }>('/api/restaurant/cash-session', { method: 'PATCH', body: JSON.stringify({ sessionId: cashSession.id, countedAmount: Number(countedCashAmount), shiftType: 'DAY' }) });
      setSelectedServerReport(result.report); setReportHotel(result.hotel);
      setCountedCashAmount(''); setNotice('Caisse clôturée et rapport de service enregistré.'); await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Clôture de caisse impossible.'); }
    finally { setBusy(false); }
  }

  async function markNotificationRead(notification: ServerNotification) {
    try {
      await api('/api/restaurant/notifications', { method: 'PATCH', body: JSON.stringify({ id: notification.id }) });
      await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Mise à jour de la notification impossible.'); }
  }

  async function createServerAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/servers', { method: 'POST', body: JSON.stringify(serverForm) });
      setServerForm({ name: '', email: '', password: '' });
      setNotice('Compte serveuse créé. Communiquez ses identifiants de manière sécurisée.');
      await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Création du compte impossible.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadData().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Chargement du restaurant impossible.'));
    }, 0);
    const timer = window.setInterval(() => { void loadData().catch(() => undefined); }, 10000);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(timer); };
  }, [loadData]);

  async function createOrder(event?: FormEvent<HTMLFormElement>, settleNow = false) {
    event?.preventDefault();
    if (manager) { setError('La saisie des commandes est réservée aux serveuses.'); return; }
    const selectedStay = activeStays.find((stay) => stay.room.id === orderRoomId);
    const invalidLine = orderLines.some((line) => !menuItems.some((item) => item.id === line.menuItemId && item.active) || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1 || Number(line.quantity) > 99);
    if (!walkIn && !orderRoomId) {
      setError('Choisissez une chambre avec un sejour actif pour rattacher la consommation au bon folio.');
      return;
    }
    if (!walkIn && !selectedStay) {
      setError('Aucun sejour actif ne correspond a cette chambre. La consommation ne peut pas etre envoyee comme dette.');
      return;
    }
    if (!walkIn && !roomNumberConfirmed) {
      setError('Cochez la confirmation apres avoir verifie le numero de chambre avec le client.');
      return;
    }
    if (invalidLine) {
      setError('Choisissez un produit disponible et indiquez une quantité entière.');
      return;
    }
    if (walkIn && walkInName.trim().length < 2) { setError('Indiquez le nom du client non logé.'); return; }
    if ((walkIn || settleNow) && !cashSession) { setError('Ouvrez votre caisse avant d’encaisser cette commande.'); setPanel('cash'); return; }
    if ((walkIn || settleNow) && !paymentMethodId) { setError('Choisissez un moyen de paiement.'); return; }
    const selectedRoom = selectedStay?.room;
    if (!walkIn && !selectedRoom) {
      setError('Cette chambre est introuvable. Actualisez la page puis reessayez.');
      return;
    }
    if (!walkIn && !window.confirm(`Confirmez-vous le numero de chambre ${selectedRoom!.number} ?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/restaurant/orders', {
        method: 'POST',
        body: JSON.stringify({ ...(walkIn ? { guestName: walkInName.trim(), paymentMethodId, ...(cashMethodSelected ? { receivedAmount: orderTotal } : {}) } : { roomId: orderRoomId, reservationId: selectedStay!.reservationId, settleImmediately: settleNow, ...(settleNow ? { paymentMethodId, ...(cashMethodSelected ? { receivedAmount: orderTotal } : {}) } : {}) }), source: walkIn ? 'RESTAURANT' : orderSource, items: orderLines.map((line) => ({ menuItemId: line.menuItemId, quantity: Number(line.quantity) })) }),
      });
      setOrderLines([{ id: `line-${Date.now()}`, menuItemId: '', name: '', category: 'FOOD', quantity: '1', unitPrice: '' }]); setRoomNumberConfirmed(false); setWalkInName(''); setNotice(walkIn || settleNow ? 'Paiement immédiat enregistré avec la commande.' : 'Commande envoyée à la réception pour validation et ajout au folio.');
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
      await api('/api/restaurant/menu', { method: 'POST', body: JSON.stringify({ ...menuForm, purchasePrice: hasDirectPurchasePrice(menuForm.category) && menuForm.purchasePrice !== '' ? Number(menuForm.purchasePrice) : undefined }) });
      setMenuForm({ name: '', description: '', category: 'FOOD', billingUnit: 'ITEM', price: '', purchasePrice: '' });
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

  async function deleteMenuItem(item: MenuItem) {
    const confirmed = window.confirm(`Supprimer « ${item.name} » de la carte ? Il ne sera plus proposé à la commande. Les ventes et inventaires déjà enregistrés seront conservés.`);
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/restaurant/menu/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setNotice(`« ${item.name} » a été supprimé de la carte. Son historique est conservé.`);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression du produit impossible.');
    } finally { setBusy(false); }
  }

  async function savePrices(item: MenuItem) {
    const draft = priceDrafts[item.id];
    if (!draft || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0 || (hasDirectPurchasePrice(item.category) && draft.purchasePrice !== '' && (!Number.isFinite(Number(draft.purchasePrice)) || Number(draft.purchasePrice) < 0))) {
      setError('Vérifiez le prix de vente et le prix d’achat.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/restaurant/menu/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ price: Number(draft.price), ...(hasDirectPurchasePrice(item.category) ? { purchasePrice: draft.purchasePrice === '' ? null : Number(draft.purchasePrice) } : {}) }) });
      setNotice(`Prix mis à jour pour ${item.name}.`); setPriceEditingItemId(null); await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification des prix impossible.'); }
    finally { setBusy(false); }
  }

  function startPriceEdit(item: MenuItem) {
    setPriceDrafts((current) => ({ ...current, [item.id]: { price: item.price, purchasePrice: item.purchasePrice ?? '' } }));
    setPriceEditingItemId(item.id);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/connexion');
    router.refresh();
  }

  return <div className={`${styles.shell} ${manager ? styles.managerShell : styles.serverShell}`} data-theme={theme}>
    {menuOpen && <button className={styles.backdrop} aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.brand}><span className={styles.brandMark}><Wine size={19} /></span><span><strong>BLISS HOTEL</strong><small>Bar & restaurant</small></span><button className={styles.mobileClose} onClick={() => setMenuOpen(false)} aria-label="Fermer"><X size={18} /></button></div>
      <div className={styles.serviceBadge}><i /> Espace de service</div>
      <nav aria-label="Navigation Bar & Restaurant">{panels.filter((item) => manager ? item.id !== 'cash' : ['dashboard', 'orders', 'cash', 'notifications', 'stock'].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} className={`${styles.navItem} ${panel === id ? styles.navActive : ''}`} onClick={() => { setPanel(id); setMenuOpen(false); }}><Icon size={17} /><span>{manager && id === 'orders' ? 'Suivi des commandes' : label}</span></button>)}</nav>
      <div className={styles.sidebarBottom}><div className={styles.user}><span>{name.slice(0, 1).toLocaleUpperCase('fr-FR')}</span><div><strong>{name}</strong><small>{roleName}</small></div></div><ProfileLauncher name={name} className={styles.profileLauncher} /><button className={styles.logout} onClick={() => void logout()}><LogOut size={15} />Déconnexion</button></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}><button className={styles.mobileMenu} onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Menu size={18} /></button><div><span>BLISS HOTEL</span><i>/</i><strong>{manager && panel === 'orders' ? 'Suivi des commandes' : panels.find((item) => item.id === panel)?.label}</strong></div><DashboardThemeToggle theme={theme} onToggle={toggleTheme} /><button type="button" className={styles.topbarLogout} onClick={() => void logout()} aria-label="Déconnexion" title="Déconnexion"><LogOut size={16} /><span>Déconnexion</span></button><span className={styles.topRole}>{manager ? <ChefHat size={14} /> : <Beer size={14} />}{roleName}</span></header>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroContent}><p className={styles.eyebrow}>{manager ? 'PILOTAGE DU POINT DE VENTE' : 'ESPACE PERSONNEL DE SERVICE'}</p><h1>{manager ? 'Bar & Restaurant' : `Bonjour ${name.split(' ')[0]}`}</h1><p>{manager ? 'Supervisez les serveuses, suivez le service et gérez la carte et les stocks.' : 'Votre espace de travail pour le service du bar.'}</p>
            <div className={styles.heroMeta}><span><i />BLISS HOTEL · Établissement unique</span><span><Clock3 size={14} />{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())}</span></div>
          </div>
          <div className={styles.heroIcon}><Wine size={31} strokeWidth={1.35} /></div>
        </section>

        <div className={styles.panelHeading}><div><p>{panel === 'dashboard' ? 'TABLEAU DE BORD' : manager ? 'GESTION DU SERVICE' : 'MON SERVICE'}</p><h2>{panel === 'dashboard' ? manager ? 'Pilotage des serveuses' : 'Mon poste de service' : manager && panel === 'orders' ? 'Suivi des commandes' : panels.find((item) => item.id === panel)?.label}</h2></div><span className={styles.live}><i />{manager ? 'Supervision du service' : 'Poste de service'}</span></div>

        {error && <div className={styles.formError} role="alert">{error}</div>}
        {notice && <div className={styles.formNotice} role="status">{notice}</div>}
        {panel === 'dashboard' && <BusinessActivityExplorer />}
        {!manager && panel === 'dashboard' && <section className={styles.serverDashboard}>
          <div className={styles.serverWelcome}>
            <div className={styles.serverWelcomeText}><span className={styles.serverOverline}>ESPACE DE SERVICE</span><h3>Commandes<br />en direct<span>.</span></h3><p>Enregistrez la consommation et servez le client. Le client hôtelier règle sur sa facture de chambre, suivie par la réception.</p><button type="button" onClick={() => setPanel('orders')}><ClipboardList size={17} />Saisir une commande <span>→</span></button></div>
            <div className={styles.serverOrb} aria-hidden="true"><span className={styles.orbRing} /><span className={styles.orbInner}><Beer size={31} strokeWidth={1.3} /></span><i /><b /></div>
            <span className={styles.serverWelcomeFoot}>BAR · RESTAURANT <span>BLISS HOTEL</span></span>
          </div>
          <div className={styles.serverInventoryPrompt}>
            <div className={styles.dailyInventoryTop}><span className={styles.dailyInventoryIcon}><PackageOpen size={18} /></span><div><span>INVENTAIRE DU JOUR</span><strong>{stockCountedToday} / {inventoryItems.length} produits comptés</strong></div><b className={stockCountPendingItems.length ? styles.inventoryPendingBadge : styles.inventoryCompleteBadge}>{inventoryItems.length ? `${stockCountProgress}%` : '—'}</b></div>
            <div className={styles.dailyInventoryProgress}><span style={{ width: `${stockCountProgress}%` }} /></div>
            <p>{inventoryItems.length === 0 ? 'Aucun produit n’est configuré pour le suivi de stock.' : stockCountPendingItems.length ? `${stockCountPendingItems.length} produit(s) restent à compter aujourd’hui${stockCountPendingItems.length <= 3 ? ` : ${stockCountPendingItems.map((item) => item.name).join(', ')}` : '.'}` : `Comptage terminé${latestStockCountToday ? ` · dernière saisie à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestStockCountToday.createdAt))}` : ''}.`} </p>
            {inventoryItems.length > 0 && <button type="button" onClick={() => setPanel('stock')}>{stockCountPendingItems.length ? 'Continuer le comptage' : 'Voir les stocks'} <span>→</span></button>}
          </div>
          <div className={styles.serverStatus}>
            <div className={styles.serverSectionTitle}><div><span>FILE DE SERVICE</span><h3>Etat des commandes</h3></div><span className={styles.statusUnlinked}><i />Actualisation 10 s</span></div>
            <div className={styles.serverKpis}>{[
              { icon: ClipboardList, label: 'Commandes en cours', value: orders.filter((order) => ['PENDING_RECEPTION', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status)).length },
              { icon: ChefHat, label: 'Terminées aujourd’hui', value: servedToday.length },
              { icon: ReceiptText, label: 'Ventes du service', value: money(servedToday.reduce((sum, order) => sum + Number(order.totalAmount), 0)) },
              { icon: Wallet, label: 'Réellement encaissé', value: money(serverCollectedToday) },
              { icon: BedDouble, label: 'Transféré en chambre', value: money(serverRoomTransferredToday) },
              { icon: Wallet, label: cashSession ? 'Solde espèces théorique' : 'Caisse fermée', value: cashSession ? money(cashSession.expectedCash) : 'À ouvrir' },
              { icon: PackageOpen, label: 'Produits avec stock', value: `${trackedStockCount} / ${inventoryItems.length}` },
              { icon: PackageOpen, label: 'Stocks à vérifier', value: stockNeedsAttention },
            ].map(({ icon: Icon, label, value }) => <article key={label}><span><Icon size={17} /></span><div><strong>{value}</strong><small>{label}</small></div></article>)}</div>
            <div className={styles.serviceFlow}><div className={styles.flowLabel}><strong>Étapes de service</strong><span>Commande puis service</span></div><div className={styles.flowSteps}>{['Commande', 'Préparation', 'Prête', 'Servie'].map((stage, index) => <div className={styles.flowStep} key={stage}><span>{String(index + 1).padStart(2, '0')}</span><i /><strong>{stage}</strong></div>)}</div></div>
          </div>
          <div className={styles.serverQueue}>
            <div className={styles.serverSectionTitle}><div><span>RECENTES</span><h3>Commandes recentes</h3></div><button type="button" onClick={() => setPanel('orders')}>Tout voir <span>→</span></button></div>
            {orders.length ? orders.slice(0, 4).map((order) => <div className={styles.queueOrder} key={order.id}><div><strong>{order.number} · {counterpartLabel(order)}</strong><small>{order.guestName} · {orderStatusLabels[order.status]}</small></div><b>{money(order.totalAmount)}</b></div>) : <div className={styles.queueEmpty}><div className={styles.queueArtwork}><span /><ClipboardList size={24} /></div><div><strong>Aucune commande</strong><p>Les demandes reçues en chambre ou au restaurant s&apos;afficheront ici.</p></div><span className={styles.queueWait}>PRET</span></div>}
          </div>
          <div className={styles.serverQueue}>
            <div className={styles.serverSectionTitle}><div><span>TRANSMIS PAR LA RÉCEPTION</span><h3>Petits-déjeuners associés</h3></div><button type="button" onClick={() => setPanel('notifications')}>Notifications <span>→</span></button></div>
            {breakfastNotifications.length ? breakfastNotifications.slice(0, 4).map((notification) => <div className={styles.queueOrder} key={notification.id}><div><strong>{notification.message}</strong><small>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.createdAt))}{notification.readAt ? ' · Lue' : ' · À traiter'}</small></div></div>) : <div className={styles.queueEmpty}><div><strong>Aucun petit-déjeuner signalé</strong><p>Les associations faites par la réception apparaîtront ici.</p></div></div>}
          </div>
          <div className={styles.serverRoomList}>
            <div className={styles.serverSectionTitle}><div><span>SÉJOURS EN COURS</span><h3>Clients hébergés</h3></div><button type="button" onClick={() => setPanel('orders')}>Choisir un client <span>→</span></button></div>
            {activeStays.length ? <div className={styles.roomGrid}>{activeStays.map((stay) => <button key={stay.reservationId} type="button" onClick={() => { setWalkIn(false); setOrderRoomId(stay.room.id); setRoomNumberConfirmed(false); setPanel('orders'); }}><BedDouble size={14} /><strong>Ch. {stay.room.number}</strong><small>{stay.guestName}</small></button>)}</div> : <p className={styles.roomEmpty}>Aucun séjour actif avec un folio pouvant recevoir une consommation.</p>}
          </div>
          <div className={styles.serverHint}><span><ShieldCheck size={17} /></span><p><strong>Client hôtelier.</strong> Vérifiez sa chambre : la consommation est ajoutée à son folio et la réception voit le solde à encaisser.</p><span className={styles.hintSpark}>✳</span></div>
        </section>}

        {panel === 'cash' && !manager && <section className={styles.card}>
          <div className={styles.cardHeading}><div><p>CAISSE PERSONNELLE</p><h3>Ma caisse</h3></div><Wallet size={18} /></div>
          {cashSession ? <>
            <div className={styles.metricGrid}>{[{ title: 'Fond initial', value: money(cashSession.openingAmount) }, { title: 'Encaissements espèces', value: money(cashSession.cashReceived) }, { title: 'Solde théorique', value: money(cashSession.expectedCash) }].map((metric) => <article className={styles.metric} key={metric.title}><div><p>{metric.title}</p><strong>{metric.value}</strong></div></article>)}</div>
            <p>Caisse ouverte depuis {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cashSession.openedAt))}. Les paiements mobiles/carte et les transferts chambre ne sont pas ajoutés au solde espèces.</p>
            <h3>Mouvements et encaissements</h3>
            {cashSession.transactions.length ? <div className={styles.orderList}>{cashSession.transactions.map((transaction) => <article className={styles.orderCard} key={transaction.id}><header><div><strong>{transaction.description ?? 'Encaissement'}</strong><small>{transaction.method} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(transaction.createdAt))}</small></div><b>{money(transaction.amount)}</b></header></article>)}</div> : <EmptyState title="Aucun encaissement" detail="Les paiements confirmés apparaîtront ici." />}
            <form className={styles.menuForm + ' ' + styles.cashCloseForm} onSubmit={closeCashSession}><p className={styles.formHint}><strong>Horaire de service : 08 h à 08 h le lendemain.</strong><br />Les dates et heures réelles du rapport sont reprises automatiquement de l’ouverture et de la clôture de votre caisse.</p><label><span>Espèces réellement comptées (FCFA)</span><input type="number" min="0" step="1" required value={countedCashAmount} onChange={(event) => setCountedCashAmount(event.target.value)} /></label><button type="submit" disabled={busy}>Clôturer ma caisse</button></form>
          </> : <><p>Aucune caisse ouverte. Ouvrez votre caisse avant de saisir un encaissement client externe.</p><form className={styles.menuForm} onSubmit={openCashSession}><label><span>Fond de caisse initial (FCFA)</span><input type="number" min="0" step="1" required value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} /></label><button type="submit" disabled={busy}>Ouvrir ma caisse</button></form></>}
          {!cashSession && cashHistory.filter((session) => session.status === 'CLOSED').length > 0 && <><h3>Dernières clôtures</h3><div className={styles.orderList}>{cashHistory.filter((session) => session.status === 'CLOSED').map((session) => <article className={styles.orderCard} key={session.id}><header><div><strong>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.closedAt ?? session.openedAt))}</strong><small>Horaire prévu : 08 h à 08 h le lendemain{session.shiftStartedAt && session.shiftEndedAt ? ` · Caisse : ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.shiftStartedAt))} – ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.shiftEndedAt))}` : ''}</small><small>Fond initial {money(session.openingAmount)} · espèces reçues {money(session.cashReceived)}</small></div><b>Réel {money(session.countedAmount ?? 0)} · écart {money(session.variance ?? 0)}</b></header>{session.report && <button type="button" className={styles.actionButton} onClick={() => session.report && setSelectedServerReport(session.report)}>Voir / PDF du rapport</button>}</article>)}</div></>}
        </section>}

        {panel === 'notifications' && <section className={styles.card}>
          <div className={styles.cardHeading}><div><p>SUIVI DU SERVICE</p><h3>Notifications</h3></div><Clock3 size={18} /></div>
          {serverNotifications.length ? <div className={styles.orderList}>{serverNotifications.map((notification) => <article className={styles.orderCard} key={notification.id}><header><div><strong>{notification.readAt ? 'Lue' : 'Nouvelle notification'}</strong><small>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.createdAt))}</small></div>{!notification.readAt && <button type="button" className={styles.actionButton} onClick={() => void markNotificationRead(notification)}>Marquer comme lue</button>}</header><p>{notification.message}</p></article>)}</div> : <EmptyState title="Aucune notification" detail="Les mises à jour concernant vos commandes apparaîtront ici." />}
        </section>}

        {panel === 'dashboard' && manager && <>
          <section className={`${styles.card} ${styles.managerTeamCard}`}>
            <div className={styles.cardHeading}><div><p>GESTION DE L’ÉQUIPE · AUJOURD’HUI</p><h3>Suivi des serveuses</h3></div><Users size={18} /></div>
            {serverToday.length ? <div className={styles.orderList}>{serverToday.map(([server, totals]) => <article className={styles.orderCard} key={`team-${server}`}><header><div><strong>{server}</strong><small>{totals.count} commande(s) · {totals.served} servie(s)</small></div><b>{money(totals.sales)}</b></header><small>Encaissements directs : {money(totals.collected)}</small></article>)}</div> : <EmptyState title="Aucune activité aujourd’hui" detail="L’activité enregistrée par les serveuses apparaîtra ici." />}
          </section>
          <section className={`${styles.card} ${styles.managerTeamCard}`}>
            <div className={styles.cardHeading}><div><p>TRANSMIS PAR LA RÉCEPTION</p><h3>Petits-déjeuners associés</h3></div><BedDouble size={18} /></div>
            {breakfastNotifications.length ? <div className={styles.orderList}>{breakfastNotifications.slice(0, 6).map((notification) => <article className={styles.orderCard} key={notification.id}><header><div><strong>{notification.message}</strong><small>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.createdAt))}</small></div><span className={styles.orderStatus}>{notification.readAt ? 'Lue' : 'À traiter'}</span></header></article>)}</div> : <EmptyState title="Aucun petit-déjeuner signalé" detail="Les associations faites par la réception apparaîtront ici." />}
          </section>
          <section className={`${styles.card} ${styles.dailyInventoryCard}`}>
            <div className={styles.dailyInventoryTop}><span className={styles.dailyInventoryIcon}><PackageOpen size={18} /></span><div><span>INVENTAIRE QUOTIDIEN</span><strong>Suivi des comptages</strong></div><b className={stockCountPendingItems.length ? styles.inventoryPendingBadge : styles.inventoryCompleteBadge}>{inventoryItems.length ? `${stockCountedToday}/${inventoryItems.length}` : '—'}</b></div>
            <div className={styles.dailyInventoryProgress}><span style={{ width: `${stockCountProgress}%` }} /></div>
            <p>{inventoryItems.length === 0 ? 'Aucun produit n’est configuré pour le suivi de stock.' : stockCountPendingItems.length ? `${stockCountPendingItems.length} produit(s) n’ont pas encore été comptés aujourd’hui${stockCountPendingItems.length <= 4 ? ` : ${stockCountPendingItems.map((item) => item.name).join(', ')}` : '.'}` : `Tous les produits ont été comptés aujourd’hui${latestStockCountToday ? ` · dernier relevé à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestStockCountToday.createdAt))} par ${latestStockCountToday.countedBy}` : ''}.`}</p>
            <button type="button" onClick={() => setPanel('stock')}>Ouvrir l’inventaire <span>→</span></button>
          </section>
          <section className={`${styles.metricGrid} ${styles.managerMetrics}`}>
            {[
              { title: 'Ventes servies aujourd’hui', value: money(servedTotal), hint: `${managerDashboard?.orders ?? servedToday.length} commande(s) non rejetée(s) aujourd’hui`, icon: ReceiptText },
              { title: 'Chiffre d’affaires semaine', value: money(managerDashboard?.weekSales.amount ?? 0), hint: `${managerDashboard?.weekSales.orders ?? 0} ventes · 7 derniers jours`, icon: ReceiptText },
              { title: 'Chiffre d’affaires mois', value: money(managerDashboard?.monthSales.amount ?? 0), hint: `${managerDashboard?.monthSales.orders ?? 0} ventes réalisées`, icon: ReceiptText },
              { title: 'Encaissements immédiats', value: money(directCollectedToday), hint: `${managerDashboard?.collected.orders ?? todayOrders.filter((order) => order.paidAt).length} commande(s) payée(s) immédiatement`, icon: Wallet },
              { title: 'Clients externes', value: money(managerDashboard?.walkInSales.amount ?? 0), hint: `${managerDashboard?.walkInSales.orders ?? 0} commandes servies`, icon: Wallet },
              { title: 'Clients hébergés', value: money(managerDashboard?.hostedSales.amount ?? 0), hint: `${managerDashboard?.hostedSales.orders ?? 0} commandes servies`, icon: BedDouble },
              { title: 'Transféré à la réception', value: money(managerDashboard?.transferred.amount ?? 0), hint: `${managerDashboard?.transferred.orders ?? 0} commandes imputées aux folios`, icon: ClipboardList },
              { title: 'À valider en réception', value: String(waitingReception.length), hint: 'En attente de transfert au folio', icon: ClipboardList },
              { title: 'Commandes en cours', value: String(activeOrders.length), hint: 'Préparation, prêtes ou confirmées', icon: ChefHat },
              { title: 'Produits à la carte', value: String(menuItems.filter((item) => item.active).length), hint: 'Plats, boissons et petit-déjeuner', icon: Utensils },
              { title: 'Petits-déjeuners associés', value: String(managerDashboard?.breakfastAssociations.count ?? 0), hint: `${money(managerDashboard?.breakfastAssociations.amount ?? 0)} ajoutés aux folios aujourd’hui · avis informatifs`, icon: BedDouble },
              { title: 'Stocks faibles / ruptures', value: `${managerDashboard?.inventory.lowStock ?? 0} / ${managerDashboard?.inventory.outOfStock ?? 0}`, hint: `Valeur estimée : ${money(managerDashboard?.inventory.value ?? 0)}`, icon: PackageOpen },
              { title: 'Commandes annulées', value: String(managerDashboard?.cancelled ?? 0), hint: 'Refusées par la réception aujourd’hui', icon: ClipboardList },
            ].map(({ title, value, hint, icon: Icon }) => <article className={styles.metric} key={title}><span className={styles.metricIcon}><Icon size={17} /></span><div><p>{title}</p><strong>{value}</strong><small>{hint}</small></div><span className={styles.metricStatus}>Données enregistrées</span></article>)}
          </section>
          <section className={styles.dashboardGrid}>
            <article className={styles.card}><div className={styles.cardHeading}><div><p>STOCK · MOIS EN COURS</p><h3>Produits les plus consommés</h3></div><PackageOpen size={18} /></div>{managerDashboard?.topProducts.length ? managerDashboard.topProducts.map((product) => <div className={styles.queueOrder} key={product.name}><div><strong>{product.name}</strong></div><b>× {product.quantity}</b></div>) : <EmptyState title="Aucune vente servie" detail="Les produits vendus apparaîtront ici." />}</article>
            <article className={styles.card}><div className={styles.cardHeading}><div><p>APPROVISIONNEMENTS</p><h3>Dernières entrées</h3></div><PackageOpen size={18} /></div>{managerDashboard?.recentSupplies.length ? managerDashboard.recentSupplies.map((supply, index) => <div className={styles.queueOrder} key={`${supply.item}-${index}`}><div><strong>{supply.item}</strong><small>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(supply.at))}</small></div><b>{supply.quantity} {supply.unit ?? ''}</b></div>) : <EmptyState title="Aucun approvisionnement récent" detail="Les entrées du mois apparaîtront ici." />}</article>
          </section>
          <section className={styles.dashboardGrid}>
            <article className={styles.card}><div className={styles.cardHeading}><div><p>À SUIVRE</p><h3>Dernières commandes</h3></div><ClipboardList size={18} /></div>{orders.length ? orders.slice(0, 5).map((order) => <div className={styles.queueOrder} key={order.id}><div><strong>{order.number} · {counterpartLabel(order)}</strong><small>{order.guestName} · {orderStatusLabels[order.status]}</small></div><b>{money(order.totalAmount)}</b></div>) : <EmptyState title="Aucune commande enregistrée" detail="Les demandes du restaurant apparaîtront dans cette liste." />}</article>
            <article className={styles.card}><div className={styles.cardHeading}><div><p>CARTE DU RESTAURANT</p><h3>Petit-déjeuner</h3></div><ReceiptText size={18} /></div><div className={styles.breakfastOffer}><strong>{configuredBreakfast ? `${money(configuredBreakfast.price)} la portion` : 'Non configuré'}</strong><span>Option associée à la chambre par la réception</span><small>Le client choisit librement le petit-déjeuner ou d&apos;autres plats et boissons. Chaque produit est facturé selon les quantités commandées.</small><button type="button" onClick={() => setPanel('menu')}>Voir la carte</button></div></article>
          </section>
        </>}


        {panel === 'orders' && <div className={`${styles.ordersLayout} ${manager ? styles.managerOrdersLayout : ''}`}>
          {manager && <div className={styles.notice}><ShieldCheck size={17} /><div><strong>Vue de supervision</strong><p>Les serveuses saisissent et traitent les commandes. Cette vue vous permet d’en suivre l’avancement.</p></div></div>}
          {!manager && <section className={styles.card}>
            <div className={styles.cardHeading}><div><p>{walkIn ? 'CONSOMMATION RÉGLÉE SUR PLACE' : 'CONSOMMATION À IMPUTER AU SÉJOUR'}</p><h3>{role === 'server' ? 'Consommation au bar-restaurant' : 'Consommation client'}</h3></div><Plus size={18} /></div>
            <form className={styles.orderForm} onSubmit={createOrder}>
              <label className={styles.fullField}><span>Type de client</span><span><input type="checkbox" checked={walkIn} onChange={(event) => { setWalkIn(event.target.checked); if (event.target.checked) setOrderSource('RESTAURANT'); setError(''); setRoomNumberConfirmed(false); }} /> Client non logé à l’hôtel (commande réglée sur place)</span></label>
              {walkIn && <label className={styles.fullField}><span>Nom du client</span><input value={walkInName} onChange={(event) => setWalkInName(event.target.value)} required maxLength={160} placeholder="Nom du client" /></label>}
              {walkIn && <label className={styles.fullField}><span>Paiement immédiat · moyen de paiement</span><select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)} required><option value="">Choisir le moyen de paiement</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>}
              {!walkIn && <label className={styles.fullField}><span>Moyen de paiement · encaissement immédiat</span><select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">Choisir le moyen de paiement</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>}
              <div className={styles.formGrid}>
                {!walkIn && <><label><span>Numero de chambre</span><select required disabled={!activeStays.length} value={orderRoomId} onChange={(event) => { setOrderRoomId(event.target.value); setRoomNumberConfirmed(false); setError(''); }}><option value="">{activeStays.length ? 'Choisir une chambre' : 'Aucun séjour actif disponible'}</option>{activeStays.map((stay) => <option key={stay.reservationId} value={stay.room.id}>Ch. {stay.room.number} - {stay.guestName}</option>)}</select></label>{!activeStays.length && <p className={styles.fullField} role="status">Aucune chambre ne peut recevoir de consommation : vérifiez que le client est enregistré en séjour actif et que son folio est ouvert. <button type="button" className={styles.actionButton} disabled={busy} onClick={() => void loadData()}>Actualiser la liste</button></p>}</>}
                <label><span>Le client consomme</span><select value={walkIn ? 'RESTAURANT' : orderSource} disabled={walkIn} onChange={(event) => setOrderSource(event.target.value as 'ROOM_SERVICE' | 'RESTAURANT')}><option value="RESTAURANT">Au bar-restaurant</option>{!walkIn && <option value="ROOM_SERVICE">Dans sa chambre</option>}</select></label>
              </div>
              {!walkIn && <label className={styles.fullField}><span>Confirmation du numero de chambre</span><span><input type="checkbox" checked={roomNumberConfirmed} onChange={(event) => { setRoomNumberConfirmed(event.target.checked); setError('' ); }} /> Je confirme avoir verifie le numero de chambre avec le client.</span></label>}
              <div className={styles.orderProducts}>{orderLines.map((line, index) => <div className={styles.orderProduct} key={line.id}>
                <label><span>Produit</span><select required value={line.menuItemId} onChange={(event) => { const chosen = menuItems.find((item) => item.id === event.target.value); setOrderLines((current) => current.map((item) => item.id === line.id ? { ...item, menuItemId: chosen?.id ?? '', name: chosen?.name ?? '', category: chosen?.category ?? 'FOOD', unitPrice: chosen?.price ?? '' } : item)); }}><option value="">Choisir un produit</option>{menuItems.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.price)}</option>)}</select></label>
                <label><span>Quantité</span><input type="number" value={line.quantity} onChange={(event) => setOrderLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} /></label>
                <label><span>Prix unitaire FCFA</span><input type="text" readOnly value={line.unitPrice ? money(line.unitPrice) : '—'} /></label>
                {orderLines.length > 1 && <button type="button" className={styles.actionButton} aria-label={`Retirer le produit ${index + 1}`} onClick={() => setOrderLines((current) => current.filter((item) => item.id !== line.id))}>Retirer</button>}
              </div>)}</div>
              <div className={styles.orderTotal}><span>Total calculé automatiquement selon les produits et quantités sélectionnés</span><strong>{money(orderTotal)}</strong></div>
              <button type="button" className={styles.actionButton} disabled={orderLines.length >= 30} onClick={() => setOrderLines((current) => [...current, { id: `line-${Date.now()}-${current.length}`, menuItemId: '', name: '', category: 'FOOD', quantity: '1', unitPrice: '' }])}><Plus size={15} /> Ajouter un produit</button>
              <div className={styles.orderSubmit}><p>{walkIn ? 'Paiement immédiat enregistré dans votre caisse.' : 'Choisissez si la commande est payée maintenant ou transmise non payée à la réception.'}</p>{walkIn ? <button type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Encaisser et enregistrer'}</button> : <div className={styles.orderChoiceButtons}><button type="button" disabled={busy} onClick={() => void createOrder(undefined, true)}>{busy ? 'Envoi…' : 'Enregistrer et encaisser'}</button><button type="button" className={styles.unpaidOrderButton} disabled={busy} onClick={() => void createOrder(undefined, false)}>{busy ? 'Envoi…' : 'Enregistrer non payé'}</button></div>}</div>
            </form>
          </section>}
          <section className={styles.card}>
            <div className={styles.cardHeading}><div><p>FILE DE SERVICE</p><h3>Commandes récentes</h3></div><ClipboardList size={18} /></div>
            {orders.length ? <div className={styles.orderList}>{orders.map((order) => {
              return <article className={styles.orderCard} key={order.id}><header><div><strong>{order.number} · {counterpartLabel(order)}</strong><small>{order.guestName} · {order.source === 'ROOM_SERVICE' ? 'En chambre' : 'Au restaurant'}{order.paidAt ? ` · Payé (${order.paymentMethod?.name ?? 'moyen désactivé'})` : ''}</small></div><b>{money(order.totalAmount)}</b></header><span className={`${styles.orderStatus} ${styles[`status_${order.status}`]}`}>{orderStatusLabels[order.status]}</span><ul>{order.lines.map((line) => <li key={line.id}>{line.name} · {line.billingUnit === 'ROOM_NIGHT' ? `${line.quantity} nuitée(s)` : `× ${line.quantity}`}<strong>{money(line.lineTotal)}</strong></li>)}</ul>{order.notes && <p className={styles.orderNote}>{order.notes}</p>}</article>;
            })}</div> : <EmptyState title="Aucune commande" detail="Les demandes reçues en chambre ou au restaurant apparaîtront ici." />}
          </section>
        </div>}
        {panel === 'menu' && <section className={styles.card}>
          <div className={styles.cardHeading}><div><p>OFFRE BAR & RESTAURANT</p><h3>Carte et produits</h3></div><Utensils size={18} /></div>
          {manager && <div className={styles.menuSectionHeading}><h4>Ajouter un produit</h4><p>Créez un plat, une boisson ou un produit à proposer aux clients.</p></div>}
          {manager && <form className={`${styles.menuForm} ${styles.addProductForm}`} onSubmit={saveMenuItem}>
            <label><span>Nom du produit</span><input value={menuForm.name} maxLength={160} onChange={(event) => setMenuForm((current) => ({ ...current, name: event.target.value }))} /><small>La référence sera attribuée automatiquement.</small></label>
            <label><span>Catégorie</span><select value={menuForm.category} onChange={(event) => { const category = event.target.value as MenuItem['category']; setMenuForm((current) => ({ ...current, category, purchasePrice: hasDirectPurchasePrice(category) ? current.purchasePrice : '' })); }}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {hasDirectPurchasePrice(menuForm.category) && <label><span>Prix d’achat FCFA</span><input type="number" min="0" step="50" value={menuForm.purchasePrice} onChange={(event) => setMenuForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>}
            <label><span>Prix de vente FCFA</span><input type="number" min="0" step="50" value={menuForm.price} onChange={(event) => setMenuForm((current) => ({ ...current, price: event.target.value }))} /></label>
            <label className={styles.menuDescription}><span>Description</span><input value={menuForm.description} maxLength={500} onChange={(event) => setMenuForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label><span>Tarification</span><select value={menuForm.billingUnit} onChange={(event) => setMenuForm((current) => ({ ...current, billingUnit: event.target.value as MenuItem['billingUnit'] }))}><option value="ITEM">Par unité</option><option value="ROOM_NIGHT">Par chambre et par nuit</option></select></label>
            <button type="submit" disabled={busy}><Plus size={15} />Ajouter à la carte</button>
          </form>}
          <div className={styles.menuSectionHeading}><h4>Produits de la carte</h4><p>Références, catégories et prix de vente actuellement proposés.</p></div>
          {menuItems.length ? <div className={styles.menuGrid}>{menuItems.map((item) => {
            const draft = priceDrafts[item.id] ?? { price: item.price, purchasePrice: item.purchasePrice ?? '' };
            const editingPrice = priceEditingItemId === item.id;
            return <article className={item.active ? styles.menuItem : styles.menuItem + ' ' + styles.inactiveMenuItem} key={item.id}>
              <span className={styles.menuCategory}>{categoryLabels[item.category]}</span><strong>{item.name}</strong>
              <small className={styles.menuReference}>Réf. {item.code ?? '—'}</small>
              <small>{item.description ?? (item.billingUnit === 'ROOM_NIGHT' ? 'Forfait par chambre et par nuit' : 'Disponible à la commande')}</small>
              <b>{money(item.price)}{item.billingUnit === 'ROOM_NIGHT' ? ' / nuit' : ''}</b>
              {manager && editingPrice && <div className={styles.menuInlinePriceEditor}>
                <div className={styles.orderProduct + ' ' + styles.priceUpdateProduct}>
                  <label><span>Prix de vente (FCFA)</span><input type="number" min="0" step="50" value={draft.price} onChange={(event) => setPriceDrafts((current) => ({ ...current, [item.id]: { ...draft, price: event.target.value } }))} /></label>
                  {hasDirectPurchasePrice(item.category) && <label><span>Coût d’achat (FCFA)</span><input type="number" min="0" step="50" value={draft.purchasePrice} onChange={(event) => setPriceDrafts((current) => ({ ...current, [item.id]: { ...draft, purchasePrice: event.target.value } }))} /></label>}
                  <button type="button" className={styles.actionButton} disabled={busy} onClick={() => void savePrices(item)}>Enregistrer</button>
                </div>
              </div>}
              {manager && <div className={styles.menuItemActions}>
                <button type="button" aria-expanded={editingPrice} disabled={busy} onClick={() => editingPrice ? setPriceEditingItemId(null) : startPriceEdit(item)}>{editingPrice ? 'Annuler' : 'Modifier'}</button>
                <button type="button" disabled={busy} onClick={() => void toggleMenuItem(item)}>{item.active ? 'Masquer de la carte' : 'Remettre en vente'}</button>
                <button type="button" className={styles.deleteMenuButton} disabled={busy} onClick={() => void deleteMenuItem(item)}><Trash2 size={13} />Supprimer</button>
              </div>}
            </article>;
          })}</div> : <EmptyState title="Carte vide" detail="Le responsable peut ajouter des plats et boissons depuis ce panneau." />}
        </section>}
        {panel === 'stock' && <section className={`${styles.card} ${styles.stockWorkspace}`}>
          <div className={`${styles.cardHeading} ${styles.stockHeading}`}><div><p>INVENTAIRE PHYSIQUE</p><h3>Gestion des stocks</h3><span>Comptez les produits, ajustez les quantités et consultez chaque mouvement enregistré.</span></div><PackageOpen size={21} /></div>
          <div className={styles.stockOverview}>
            <article><span>Produits suivis</span><strong>{inventoryItems.length}</strong></article>
            <article><span>Stock initial défini</span><strong>{trackedStockCount} / {inventoryItems.length}</strong></article>
            <article><span>À vérifier</span><strong>{stockNeedsAttention}</strong></article>
            <article><span>Comptés aujourd’hui</span><strong>{stockCountedToday} / {inventoryItems.length}</strong></article>
          </div>
          <div className={styles.menuSectionHeading}><h4>Quantités et inventaire physique</h4><p>Saisissez la quantité réellement présente pour chaque produit, puis enregistrez le comptage.</p></div>
          {inventoryItems.length ? <div className={`${styles.menuGrid} ${styles.stockInventoryGrid}`}>{inventoryItems.map((item) => {
            const draft = stockDrafts[item.id] ?? { quantity: '', unit: 'unité(s)', alertAt: '', note: '' };
            const low = item.stockQuantity !== null && item.stockAlertAt !== null && Number(item.stockQuantity) <= Number(item.stockAlertAt);
            const stockState = item.stockQuantity === null ? styles.stockUncounted : Number(item.stockQuantity) <= 0 || low ? styles.stockLow : styles.stockAvailable;
            return <article className={`${styles.menuItem} ${styles.stockItem}`} key={`count-${item.id}`}>
              <div className={styles.stockItemSummary}>
                <header className={styles.stockItemHeader}><div><span className={styles.menuCategory}>{categoryLabels[item.category]}</span><strong>{item.name}</strong></div><span className={`${styles.stockState} ${stockState}`}>{item.stockQuantity === null ? 'À inventorier' : Number(item.stockQuantity) <= 0 ? 'Épuisé' : low ? 'Stock faible' : 'Disponible'}</span></header>
                <p className={styles.stockQuantity}><span>Stock actuel</span>{item.stockQuantity ?? '—'} <span>{item.stockUnit ?? (item.stockQuantity === null ? 'quantité non définie' : 'unité(s)')}</span></p>
                {item.todayCount ? <div className={styles.dailyCountMeta}><span>Compté aujourd’hui à {new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.todayCount.createdAt))} · {item.todayCount.countedBy}</span>{item.todayCount.previousQuantity !== null && <span>Écart du comptage : <strong className={Number(item.todayCount.quantity) < Number(item.todayCount.previousQuantity) ? styles.countVarianceNegative : styles.countVariancePositive}>{Number(item.todayCount.quantity) > Number(item.todayCount.previousQuantity) ? '+' : ''}{(Number(item.todayCount.quantity) - Number(item.todayCount.previousQuantity)).toFixed(2)} {item.stockUnit ?? ''}</strong></span>}</div> : <small className={styles.dailyCountMissing}>Comptage du jour en attente</small>}
                {!item.todayCount && item.lastCount && <small className={styles.stockLastCount}>Dernier inventaire : {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.lastCount.createdAt))} · {item.lastCount.countedBy}</small>}
              </div>
              <div className={styles.stockForm}>
                <label><span>Quantité comptée</span><input type="number" min="0" step="0.01" placeholder="Saisir la quantité" value={draft.quantity} onChange={(event) => setStockDrafts((current) => ({ ...current, [item.id]: { ...draft, quantity: event.target.value } }))} /></label>
                {manager && <><label><span>Unité de mesure</span><input value={draft.unit} maxLength={30} onChange={(event) => setStockDrafts((current) => ({ ...current, [item.id]: { ...draft, unit: event.target.value } }))} /></label>
                <label><span>Seuil d’alerte</span><input type="number" min="0" step="0.01" value={draft.alertAt} onChange={(event) => setStockDrafts((current) => ({ ...current, [item.id]: { ...draft, alertAt: event.target.value } }))} /></label></>}
                <label><span>Observation</span><input value={draft.note} maxLength={500} onChange={(event) => setStockDrafts((current) => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))} /></label>
              </div>
              <button className={styles.stockSaveButton} type="button" aria-label={`Enregistrer le comptage de ${item.name}`} disabled={busy} onClick={() => void saveStockCount(item)}>Enregistrer</button>
            </article>;
          })}</div> : <EmptyState title="Aucun produit au catalogue" detail="La Responsable doit d’abord ajouter les produits dans Carte & produits pour qu’ils apparaissent dans l’inventaire." />}
          <div className={styles.stockMovementsSection}>
            <div className={`${styles.cardHeading} ${styles.stockHeading}`}><div><p>TRAÇABILITÉ DES STOCKS</p><h3>Mouvements de stock</h3><span>Enregistrez une entrée, une perte ou une consommation ; chaque opération est historisée.</span></div><Clock3 size={20} /></div>
            {manager && <section className={styles.stockMovementEditor}>
              <div className={styles.stockSubheading}><h4>Enregistrer un mouvement</h4><p>Choisissez le produit, le type d’opération et la quantité.</p></div>
              <form className={styles.stockMovementEntryForm} onSubmit={saveStockMovement}>
                <label><span>Produit</span><select required value={movementItem?.id ?? ''} onChange={(event) => { const item = inventoryItems.find((candidate) => candidate.id === event.target.value); setMovementForm((current) => ({ ...current, menuItemId: event.target.value, type: item?.stockQuantity === null ? 'SUPPLY' : current.type })); }}><option value="" disabled>Choisir un produit</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stockQuantity ?? 'Stock initial à définir'} {item.stockUnit ?? ''}</option>)}</select></label>
                <label><span>Type de mouvement</span><select value={movementForm.type} onChange={(event) => setMovementForm((current) => ({ ...current, type: event.target.value as StockMovementType }))}><option value="SUPPLY">Approvisionnement</option><option value="LOSS" disabled={movementItem?.stockQuantity === null}>Perte / produit endommagé</option><option value="INTERNAL_USE" disabled={movementItem?.stockQuantity === null}>Consommation interne</option></select></label>
                <label><span>Quantité {movementItem?.stockUnit ? `(${movementItem.stockUnit})` : ''}</span><input type="number" min="0.01" step="0.01" required value={movementForm.quantity} onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
                <label className={styles.stockMovementNote}><span>Motif ou note</span><input maxLength={500} value={movementForm.note} onChange={(event) => setMovementForm((current) => ({ ...current, note: event.target.value }))} placeholder="Facultatif" /></label>
                <button className={styles.stockMovementSubmit} type="submit" disabled={busy || !inventoryItems.length}>Enregistrer le mouvement</button>
              </form>
              {movementItem?.stockQuantity === null && <p className={styles.stockMovementHint}>Stock initial non défini : vous pouvez enregistrer un premier approvisionnement. Pour une perte ou une consommation interne, comptez d’abord le stock.</p>}
              {movementItem && <small className={styles.stockSelectedBalance}>Stock actuel : <strong>{movementItem.stockQuantity ?? 'Non défini'} {movementItem.stockUnit ?? ''}</strong></small>}
            </section>}
            <section className={styles.stockHistorySection}>
              <div className={styles.stockSubheading}><h4>Historique récent</h4><p>Les derniers changements de stock, avec leur auteur et leur date.</p></div>
              {stockMovements.length ? <div className={styles.stockHistoryTableWrap}><table className={styles.stockHistoryTable}><thead><tr><th>Produit</th><th>Mouvement</th><th>Quantité</th><th>Stock avant → après</th><th>Enregistré par</th><th>Date</th></tr></thead><tbody>{stockMovements.slice(0, 40).map((movement) => <tr key={movement.id}><td><strong>{movement.menuItem.name}</strong>{movement.note && <small>{movement.note}</small>}</td><td>{stockMovementLabels[movement.type]}</td><td>{movement.quantity} {movement.menuItem.stockUnit ?? ''}</td><td>{movement.previousQuantity ?? '—'} → {movement.resultingQuantity ?? '—'} {movement.menuItem.stockUnit ?? ''}</td><td>{movement.createdByName}</td><td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(movement.createdAt))}</td></tr>)}</tbody></table></div> : <EmptyState title="Aucun mouvement enregistré" detail="Les approvisionnements, pertes et autres changements apparaîtront ici." />}
            </section>
          </div>
        </section>}
        {panel === 'team' && manager && <section className={styles.card}>
          <div className={styles.cardHeading}><div><p>ACCÈS DU SERVICE</p><h3>Comptes des serveuses</h3></div><Users size={18} /></div>
          <p>Créez un compte individuel pour chaque serveuse. Chaque compte reçoit uniquement les accès de service du bar-restaurant.</p>
          <form className={styles.menuForm + ' ' + styles.teamForm} onSubmit={createServerAccount}>
            <label><span>Nom complet</span><input autoComplete="name" required minLength={2} maxLength={160} value={serverForm.name} onChange={(event) => setServerForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>Adresse e-mail</span><input type="email" autoComplete="email" required maxLength={191} value={serverForm.email} onChange={(event) => setServerForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span>Mot de passe initial · 12 caractères minimum</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={serverForm.password} onChange={(event) => setServerForm((current) => ({ ...current, password: event.target.value }))} /></label>
            <button type="submit" disabled={busy}><UserPlus size={15} />Créer le compte serveuse</button>
          </form>
          <div className={styles.orderList}>{serverAccounts.length ? serverAccounts.map((account) => <article className={styles.orderCard} key={account.id}><header><div><strong>{account.name}</strong><small>{account.email}</small></div><span className={styles.orderStatus}>{account.active ? 'Compte actif' : 'Compte suspendu'}</span></header></article>) : <EmptyState title="Aucun compte serveuse" detail="Les comptes créés apparaîtront ici." />}</div>
        </section>}

        {panel === 'accounting' && manager && <><section className={styles.metricGrid}>{[{ title: 'Ventes servies', value: money(servedTotal), hint: `${servedToday.length} commande(s) réglée(s) / servie(s)`, icon: ReceiptText }, { title: 'En attente de confirmation', value: String(waitingReception.length), hint: 'Consommations en attente de validation', icon: ClipboardList }, { title: 'Commandes en préparation', value: String(orders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)).length), hint: 'Commandes actives du point de vente', icon: ChefHat }].map(({ title, value, hint, icon: Icon }) => <article className={styles.metric} key={title}><span className={styles.metricIcon}><Icon size={17} /></span><div><p>{title}</p><strong>{value}</strong><small>{hint}</small></div></article>)}</section><section className={styles.card}><div className={styles.cardHeading}><div><p>ACTIVITÉ DE L’ÉQUIPE</p><h3>Commandes et serveuses</h3></div><ReceiptText size={18} /></div>{orders.length ? <div className={styles.orderList}>{orders.map((order) => <article className={styles.orderCard} key={order.id}><header><div><strong>{order.number} · {order.guestName}</strong><small>{order.createdByName} · {order.room ? `Chambre ${order.room.number}` : 'Client non logé'} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.createdAt))}</small></div><b>{money(order.totalAmount)}</b></header><span className={`${styles.orderStatus} ${styles[`status_${order.status}`]}`}>{orderStatusLabels[order.status]}</span><ul>{order.lines.map((line) => <li key={line.id}>{line.name} × {line.quantity}<strong>{money(line.lineTotal)}</strong></li>)}</ul></article>)}</div> : <EmptyState title="Aucune activité" detail="Les commandes du service apparaîtront ici." />}</section></>}

        <footer className={styles.footer}><span>BLISS HOTEL · Bar & Restaurant</span><span>{manager ? 'Supervision et gestion de l’équipe' : 'Vue personnelle · Serveuse du bar'}</span></footer>
        {selectedServerReport && <ShiftReportPrintDialog report={selectedServerReport} hotel={reportHotel} close={() => setSelectedServerReport(null)} />}
      </div>
    </main>
  </div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.emptyState}><span><Search size={16} /></span><strong>{title}</strong><p>{detail}</p></div>;
}
