'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowLeftRight, BedDouble, Bell, CalendarDays, Check, CircleDollarSign,
  ClipboardList, CreditCard, DoorOpen, FileText, History, LogOut, Menu, Plus, Search, Utensils,
  ShieldAlert, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { DashboardThemeToggle, useDashboardTheme } from '@/components/dashboard-theme';
import { CockpitBars, CockpitDonut } from '@/components/cockpit-charts';
import OperationsCenter from '@/features/workspace/operations-center';
import { useRouter } from 'next/navigation';
import { dateKeyInTimeZone, dateRangesOverlap, isRateOutsideRange, localDateTimeToUtc, nightsBetween, siestaEndAt, timeRangesOverlap } from '@/features/reception/domain';
import ShiftReportPrintDialog from '@/features/shift-reports/shift-report-print-dialog';
import type { ShiftExpenseDraft, ShiftReport, ShiftReportCloseInput } from '@/features/shift-reports/types';
import './reception.css';

type HotelConfiguration = { id: number; name: string; currency: string; timezone: string; checkInTime: string | null; checkOutTime: string | null; allowCheckoutWithBalance: boolean };
type Section = 'overview' | 'operations' | 'reservations' | 'stays' | 'clients' | 'folios' | 'restaurantOrders' | 'planning' | 'cash' | 'activity' | 'notifications' | 'profile';
type StatPeriod = 'day' | 'week' | 'month';
type PaymentMethod = { id: string; code: string; name: string };
type Overview = {
  today: string;
  period: StatPeriod;
  arrivals: number;
  departures: number;
  pendingReservations: number;
  confirmedReservations: number;
  cancelledReservations: number;
  todayArrivals: { id: string; reference: string; status: string; client: { name: string }; room: { number: string } | null }[];
  todayDepartures: { id: string; reference: string; client: { name: string }; room: { number: string } | null; expectedCheckOutAt: string | null; stayType: 'SIESTA' | 'OVERNIGHT' }[];
  inHouse: number;
  rooms: { total: number; available: number; occupied: number; dirty: number; outOfService: number; reserved: number; toClean: number; inProgress: number; toInspect: number; maintenance: number };
  stays: {
    siestas: number;
    overnights: number;
    expiring: number;
    overdueSiestas: number;
    siestaAlerts: { id: string; reference: string; client: string; room: string; expectedCheckOutAt: string; overdue: boolean }[];
  };
  personalActivity: { clientsCreated: number; reservationsCreated: number; checkIns: number; checkOuts: number; payments: number; amountCollected: string };
  teamActivity: { id: string; action: string; actor: string; createdAt: string; targetId: string | null }[];
  pendingPayments: number;
  pendingAmount: string;
  cashSession: { id: string; openingAmount: string; openedAt: string; cashBalance: string } | null;
  paymentMethods: PaymentMethod[];
  permissions: string[];
};
type Client = { id: string; name: string; phone: string | null; email: string | null; nationality?: string | null; address?: string | null; idType?: string | null; idNumber?: string | null; notes?: string | null; idDocumentName?: string | null; idDocumentUploadedAt?: string | null; idDocument?: { name: string; mime: string | null; size: number | null; uploadedAt: string | null; uploadedBy: string | null } | null; createdAt?: string; createdBy?: string | null; createdByName?: string | null; creator?: { name: string } | null; _count?: { reservations: number } };
type ActivityEvent = { id: string; action: string; result: string; targetId: string | null; details: unknown; createdAt: string; mine: boolean; actor: string };
type NotificationItem = { id: string; message: string; readAt: string | null; createdAt: string };
type FolioListItem = { id: string; status: string; paymentStatus: 'paid' | 'partial' | 'unpaid'; billed: string; paid: string; balance: string; invoice: { id: string; number: string; payerName: string | null; totalAmount: string; issuedAt: string } | null; reservation: { id: string; reference: string; status: string; stayType: 'SIESTA' | 'OVERNIGHT'; createdByName: string | null; checkInDate: string; checkOutDate: string; client: { id: string; name: string; phone: string | null }; room: string | null } };
type RestaurantOrder = { id: string; number: string; source: 'ROOM_SERVICE' | 'RESTAURANT'; status: string; guestName: string; notes: string | null; totalAmount: string; createdAt: string; room: { id: string; number: string } | null; reservation: { id: string; reference: string; checkInDate: string; checkOutDate: string; client: { name: string; phone: string | null } } | null; lines: { id: string; name: string; category: string; billingUnit: string; quantity: number; unitPrice: string; lineTotal: string }[] };
type Reservation = {
  id: string;
  reference: string;
  status: string;
  stayType: 'SIESTA' | 'OVERNIGHT';
  client: Client;
  room: { id: string; number: string; category: string } | null;
  createdByName: string | null;
  createdAt: string;
  checkInDate: string;
  checkOutDate: string;
  plannedCheckInAt: string | null;
  plannedCheckOutAt: string | null;
  adults: number;
  children: number;
  nightlyRate: string;
  rateReason: string | null;
  totalAmount: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  stay: { checkedInAt: string; checkInRecordedAt: string | null; expectedCheckOutAt: string | null; checkedOutAt: string | null; checkOutRecordedAt: string | null } | null;
  folio: { id: string; billed: string; paid: string; balance: string; invoiceNumber: string | null } | null;
};
type Room = {
  id: string;
  number: string;
  floor: string | null;
  status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'OUT_OF_SERVICE';
  currentGuest: string | null;
  restaurantBilled: number;
  folioBalance: number;
  housekeepingStatus: 'CLEAN' | 'TO_CLEAN' | 'IN_PROGRESS' | 'TO_INSPECT' | 'OUT_OF_SERVICE';
  technicalStatus: 'OPERATIONAL' | 'INTERVENTION_REQUIRED' | 'UNDER_MAINTENANCE' | 'OUT_OF_SERVICE';
  hasOpenHousekeepingTask: boolean;
  receptionistBlocked: boolean;
  unavailableReason: string | null;
  category: string;
  capacity: number | null;
  nightlyRateMin: string;
  nightlyRateMax: string;
  optionalMeal: { code: 'BREAKFAST' | 'LUNCH'; name: string; price: string } | null;
  nightlyRate: string;
  reservations: {
    id: string;
    reference: string;
    status: string;
    stayType: 'SIESTA' | 'OVERNIGHT';
    checkInDate: string;
    checkOutDate: string;
    plannedCheckInAt: string | null;
    plannedCheckOutAt: string | null;
    stay: { checkedInAt: string; expectedCheckOutAt: string | null } | null;
    client?: { name: string };
  }[];
};
type Folio = {
  id: string;
  status: string;
  reservation: { id: string; reference: string; status: string; stayType: 'SIESTA' | 'OVERNIGHT'; checkInDate: string; checkOutDate: string; client: Client; room: string | null };
  lines: { id: string; type: string; description: string; amount: string; createdAt: string }[];
  payments: { id: string; amount: string; method: string; methodCode: string; reference: string | null; createdAt: string }[];
  invoice: { id: string; number: string; payerName: string | null; totalAmount: string; issuedAt: string } | null;
  billed: string;
  paid: string;
  balance: string;
};
type CashSession = {
  id: string;
  status: string;
  openingAmount: string;
  expectedCash: string;
  countedAmount: string | null;
  variance: string | null;
  openedAt: string;
  closedAt: string | null;
  transactions: { id: string; amount: string; method: string; methodCode: string; reference: string | null; description: string | null; createdAt: string; reservationReference: string | null; clientName: string | null }[];
  paymentsByMethod: { code: string; name: string; amount: string }[];
};
type Receipt = { hotel: string; client: string; reservation: string; amount: string; method: string; reference: string | null; date: string };
type EditingReservation = { reservation: Reservation; mode: 'update' | 'extend' | 'occupants' | 'assign-room' };
type ReservationEditForm = {
  roomId: string;
  clientId: string;
  checkInDate: string;
  checkOutDate: string;
  agreedRate: string;
  rateReason: string;
  adults: number;
  children: number;
};

const navigation: { id: Section; label: string; icon: typeof BedDouble }[] = [
  { id: 'overview', label: 'Vue d’ensemble', icon: Activity },
  { id: 'operations', label: 'Centre de pilotage', icon: ClipboardList },
  { id: 'reservations', label: 'Réservations', icon: CalendarDays },
  { id: 'stays', label: 'Réception / Séjours', icon: DoorOpen },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'folios', label: 'Factures', icon: FileText },
  { id: 'restaurantOrders', label: 'Commandes restaurant', icon: Utensils },
  { id: 'planning', label: 'Planning chambres', icon: BedDouble },
  { id: 'cash', label: 'Ma caisse', icon: Wallet },
  { id: 'activity', label: 'Mes opérations', icon: History },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Mon profil', icon: UserRound },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.text();
  let data: ({ error?: string } & T) | null = null;
  if (body) {
    try {
      data = JSON.parse(body) as { error?: string } & T;
    } catch {
      if (response.ok) throw new Error('Le serveur a renvoyé une réponse invalide.');
    }
  }
  if (!response.ok) throw new Error(data?.error ?? `La requête a échoué (HTTP ${response.status}).`);
  if (!data) throw new Error('Le serveur a renvoyé une réponse vide.');
  return data;
}

function formatMoney(value: string | number, currency: string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(value));
}

function roomNightlyRateLabel(room: Room, currency: string) {
  const minimum = Number(room.nightlyRateMin);
  const maximum = Number(room.nightlyRateMax);
  return minimum === maximum
    ? `${formatMoney(room.nightlyRateMin, currency)} / nuit`
    : `${formatMoney(room.nightlyRateMin, currency)} – ${formatMoney(room.nightlyRateMax, currency)} / nuit`;
}

function formatDate(value: string) {
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
}

function paymentMethodNames(payments: Folio['payments']) {
  return [...new Set(payments.map((payment) => payment.method))];
}

function addDays(value: string, count: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const count = Math.min(62, Math.ceil((end - start) / 86_400_000));
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'À confirmer',
    CONFIRMED: 'Confirmée',
    CANCELLED: 'Annulée',
    CHECKED_IN: 'En séjour',
    CHECKED_OUT: 'Terminée',
    AVAILABLE: 'Disponible',
    OCCUPIED: 'Occupée',
    DIRTY: 'À nettoyer',
    OUT_OF_SERVICE: 'Hors service',
    OPEN: 'Ouverte',
    CLOSED: 'Clôturée',
  };
  return labels[status] ?? status;
}

function roomAvailabilityLabel(room: Pick<Room, 'status' | 'housekeepingStatus' | 'technicalStatus' | 'hasOpenHousekeepingTask' | 'unavailableReason' | 'currentGuest'>) {
  const reason = room.unavailableReason ? ` · Motif : ${room.unavailableReason}` : '';
  if (room.hasOpenHousekeepingTask) {
    return room.housekeepingStatus === 'IN_PROGRESS'
      ? `Nettoyage en cours · indisponible${reason}`
      : `Entretien en attente · indisponible${reason}`;
  }
  if (room.status === 'OUT_OF_SERVICE') return `Hors service · indisponible${reason}`;
  if (room.status === 'OCCUPIED') return `Occupée${room.currentGuest ? ` par ${room.currentGuest}` : ''} · indisponible`;
  if (room.technicalStatus !== 'OPERATIONAL') return `Intervention technique · indisponible${reason}`;
  if (room.status === 'DIRTY' || room.housekeepingStatus !== 'CLEAN') return `À préparer · indisponible${reason}`;
  return statusLabel(room.status);
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`reception-status status-${value.toLowerCase()}`}>{statusLabel(value)}</span>;
}

export default function ReceptionWorkspace({ name, configuration, account }: { name: string; configuration: HotelConfiguration; account: { id: string; email: string; role: string; activeFrom: string | null; createdAt: string } }) {
  const router = useRouter();
  const { theme, toggleTheme } = useDashboardTheme();
  const [section, setSection] = useState<Section>('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(true);
  const [showTransitionOverlay, setShowTransitionOverlay] = useState(false);
  const [busyMessage, setBusyMessage] = useState('Chargement de votre espace…');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [statPeriod, setStatPeriod] = useState<StatPeriod>('day');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationFilter, setReservationFilter] = useState({ status: '', period: 'all' });
  const [stays, setStays] = useState<Reservation[]>([]);
  const [folioList, setFolioList] = useState<FolioListItem[]>([]);
  const [restaurantOrders, setRestaurantOrders] = useState<RestaurantOrder[]>([]);
  const [folioFilter, setFolioFilter] = useState('all');
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityFilters, setActivityFilters] = useState({ scope: 'mine', period: 'week' });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [moveTarget, setMoveTarget] = useState<Reservation | null>(null);
  const [moveRoomId, setMoveRoomId] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientEditForm, setClientEditForm] = useState({ name: '', phone: '', email: '', nationality: '', address: '', idType: '', idNumber: '', notes: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [reservationHistory, setReservationHistory] = useState<{ reservation: Reservation; events: ActivityEvent[] } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [selectedFolio, setSelectedFolio] = useState<Folio | null>(null);
  const [folioOpeningId, setFolioOpeningId] = useState<string | null>(null);
  const folioDetailsRef = useRef<HTMLDivElement>(null);
  const [invoicePayerName, setInvoicePayerName] = useState('');
  const [clientDetail, setClientDetail] = useState<{ client: Client; reservations: Record<string, unknown>[] } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);
  const [selectedShiftReport, setSelectedShiftReport] = useState<ShiftReport | null>(null);
  const [shiftType, setShiftType] = useState<ShiftReport['shiftType']>('DAY');
  const [shiftExpenses, setShiftExpenses] = useState<ShiftExpenseDraft[]>([]);
  const [incidentNotes, setIncidentNotes] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [invoicePrintOpen, setInvoicePrintOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', nationality: '', address: '', idType: '', idNumber: '', notes: '' });
  const [clientIdScan, setClientIdScan] = useState<File | null>(null);
  const [clientEditIdScan, setClientEditIdScan] = useState<File | null>(null);
  const [reservationForm, setReservationForm] = useState({
    clientId: '',
    roomId: '',
    checkInDate: '',
    checkOutDate: '',
    checkInTime: configuration.checkInTime ?? '',
    stayType: 'OVERNIGHT' as 'SIESTA' | 'OVERNIGHT',
    agreedRate: '',
    rateReason: '',
    includeBreakfast: false,
    adults: 1,
    children: 0,
  });
  const [planner, setPlanner] = useState({ from: '', to: '' });
  const [editingReservation, setEditingReservation] = useState<EditingReservation | null>(null);
  const [reservationEditForm, setReservationEditForm] = useState<ReservationEditForm>({
    roomId: '',
    clientId: '',
    checkInDate: '',
    checkOutDate: '',
    agreedRate: '',
    rateReason: '',
    adults: 1,
    children: 0,
  });
  const [openingAmount, setOpeningAmount] = useState('0.00');
  const [countedAmount, setCountedAmount] = useState('');
  const [serviceForm, setServiceForm] = useState({ description: '', amount: '' });
  const [paymentForm, setPaymentForm] = useState({ paymentMethodId: '', amount: '', reference: '' });
  const globalSearchRef = useRef<HTMLInputElement>(null);
  const backgroundRefreshInProgress = useRef(false);

  const title = navigation.find((item) => item.id === section)?.label ?? 'Réception';
  const roomAvailability = useMemo(() => {
    if (!reservationForm.checkInDate) return { rooms: [] as Room[], error: null as string | null };
    let startAt: Date;
    let endAt: Date;
    let checkoutDate = reservationForm.checkOutDate;
    try {
      if (reservationForm.stayType === 'SIESTA') {
        if (!reservationForm.checkInTime) return { rooms: [] as Room[], error: null as string | null };
        startAt = localDateTimeToUtc(`${reservationForm.checkInDate}T${reservationForm.checkInTime}`, configuration.timezone);
        endAt = siestaEndAt(startAt);
        checkoutDate = dateKeyInTimeZone(endAt, configuration.timezone);
        if (checkoutDate === reservationForm.checkInDate) checkoutDate = addDays(checkoutDate, 1);
      } else {
        if (!reservationForm.checkOutDate) {
          return { rooms: [] as Room[], error: null as string | null };
        }
        if (!configuration.checkOutTime) {
          return {
            rooms: [] as Room[],
            error: 'Configurez l’heure de départ de l’hôtel pour afficher les chambres disponibles.',
          };
        }
        startAt = localDateTimeToUtc(`${reservationForm.checkInDate}T${configuration.checkOutTime}`, configuration.timezone);
        endAt = localDateTimeToUtc(`${reservationForm.checkOutDate}T${configuration.checkOutTime}`, configuration.timezone);
      }
      if (endAt <= startAt) return { rooms: [] as Room[], error: 'L’heure de départ doit être postérieure à l’arrivée.' };
    } catch (reason) {
      if (reason instanceof RangeError) return { rooms: [] as Room[], error: reason.message };
      throw reason;
    }
    return {
      error: null,
      rooms: rooms.filter((room) => {
      if (room.hasOpenHousekeepingTask) return false;
      if (room.status === 'OUT_OF_SERVICE') return false;
      if (room.status === 'DIRTY' && reservationForm.checkInDate <= (overview?.today ?? '')) return false;
      if (room.housekeepingStatus !== 'CLEAN' && reservationForm.checkInDate <= (overview?.today ?? '')) return false;
      return !room.reservations.some((reservation) => {
        const existingStart = reservation.stay?.checkedInAt ?? reservation.plannedCheckInAt;
        const existingEnd = reservation.stay?.expectedCheckOutAt ?? reservation.plannedCheckOutAt;
        if (existingStart && existingEnd) {
          return timeRangesOverlap(startAt, endAt, new Date(existingStart), new Date(existingEnd));
        }
        return dateRangesOverlap(
          reservation.checkInDate,
          reservation.checkOutDate,
          reservationForm.checkInDate,
          checkoutDate,
        );
      });
      }),
    };
  }, [rooms, reservationForm, configuration.timezone, configuration.checkOutTime, overview?.today]);
  const availableRooms = roomAvailability.rooms;
  const roomsForEditor = editingReservation?.mode === 'assign-room'
    ? rooms.filter((room) => {
      const reservation = editingReservation.reservation;
      const today = overview?.today ?? reservation.checkInDate;
      if (room.hasOpenHousekeepingTask) return false;
      if (room.status === 'OUT_OF_SERVICE') return false;
      if (reservation.checkInDate <= today
        && (room.status !== 'AVAILABLE' || room.housekeepingStatus !== 'CLEAN')) return false;
      return !room.reservations.some((existing) => {
        if (existing.id === reservation.id) return false;
        const existingStart = existing.stay?.checkedInAt ?? existing.plannedCheckInAt;
        const existingEnd = existing.stay?.expectedCheckOutAt ?? existing.plannedCheckOutAt;
        if (reservation.plannedCheckInAt && reservation.plannedCheckOutAt && existingStart && existingEnd) {
          return timeRangesOverlap(
            new Date(reservation.plannedCheckInAt),
            new Date(reservation.plannedCheckOutAt),
            new Date(existingStart),
            new Date(existingEnd),
          );
        }
        return dateRangesOverlap(
          reservation.checkInDate,
          reservation.checkOutDate,
          existing.checkInDate,
          existing.checkOutDate,
        );
      });
    })
    : availableRooms;
  const loadOverview = useCallback(async () => {
    const data = await api<Overview>(`/api/reception/overview?period=${statPeriod}`);
    setOverview(data);
    setPlanner((current) => current.from
      ? current
      : { from: data.today, to: addDays(data.today, 7) });
    setPaymentForm((current) => ({
      ...current,
      paymentMethodId: current.paymentMethodId || data.paymentMethods[0]?.id || '',
    }));
  }, [statPeriod]);

  const loadNotifications = useCallback(async () => {
    const data = await api<{ notifications: NotificationItem[]; unreadCount: number }>('/api/reception/notifications');
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }, []);

  const loadReservations = useCallback(async (query = '', filters = { status: '', period: 'all' }) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filters.status) params.set('status', filters.status);
    if (filters.period && filters.period !== 'all') params.set('period', filters.period);
    const data = await api<{ reservations: Reservation[] }>(`/api/reception/reservations?${params}`);
    setReservations(data.reservations);
  }, []);

  const loadStays = useCallback(async () => {
    const data = await api<{ reservations: Reservation[] }>('/api/reception/reservations?period=inhouse');
    setStays(data.reservations);
  }, []);

  const loadFolioList = useCallback(async (status = 'all') => {
    const data = await api<{ folios: FolioListItem[] }>(`/api/reception/folios?status=${encodeURIComponent(status)}`);
    setFolioList(data.folios);
  }, []);

  const loadRestaurantOrders = useCallback(async () => {
    const data = await api<{ orders: RestaurantOrder[] }>('/api/restaurant/orders?pending=true');
    setRestaurantOrders(data.orders);
  }, []);

  const loadActivity = useCallback(async (filters = { scope: 'mine', period: 'week' }) => {
    const data = await api<{ events: ActivityEvent[] }>(`/api/reception/activity?scope=${filters.scope}&period=${filters.period}`);
    setActivity(data.events);
  }, []);

  const loadClients = useCallback(async (query = '') => {
    const params = new URLSearchParams(query ? { q: query } : {});
    const data = await api<{ clients: Client[] }>(`/api/reception/clients?${params}`);
    setClients(data.clients);
    setReservationForm((current) => ({
      ...current,
      clientId: current.clientId || data.clients[0]?.id || '',
    }));
  }, []);

  const loadRooms = useCallback(async (from = '', to = '') => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api<{ rooms: Room[] }>(`/api/reception/rooms?${params}`);
    setRooms(data.rooms);
  }, []);

  const loadCashSessions = useCallback(async () => {
    const data = await api<{ sessions: CashSession[] }>('/api/reception/cash-session');
    setCashSessions(data.sessions);
  }, []);

  const loadShiftReports = useCallback(async () => {
    const data = await api<{ reports: ShiftReport[] }>('/api/shift-reports');
    setShiftReports(data.reports);
  }, []);

  const loadFolio = useCallback(async (folioId: string) => {
    const data = await api<{ folio: Folio }>(`/api/reception/folios/${encodeURIComponent(folioId)}`);
    setSelectedFolio(data.folio);
    setInvoicePayerName(data.folio.invoice?.payerName ?? data.folio.reservation.client.name);
  }, []);

  async function openFolioFromList(folioId: string) {
    setFolioOpeningId(folioId);
    setError('');
    setNotice('');
    try {
      await loadFolio(folioId);
      setNotice('Folio ouvert.');
      window.requestAnimationFrame(() => {
        folioDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        folioDetailsRef.current?.focus({ preventScroll: true });
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’ouvrir ce folio.');
    } finally {
      setFolioOpeningId(null);
    }
  }

  const loadSection = useCallback(async (showLoading = true) => {
    const selectedFolioId = selectedFolio?.id;
    if (showLoading) {
      setBusy(true);
      setBusyMessage(`Chargement de ${title.toLowerCase()}…`);
      setError('');
    }
    try {
      void loadNotifications();
      if (section === 'overview') await loadOverview();
      if (section === 'reservations') {
        await Promise.all([loadReservations(search, reservationFilter), loadClients(), loadOverview()]);
      }
      if (section === 'stays') {
        await Promise.all([loadStays(), loadOverview()]);
      }
      if (section === 'clients') await loadClients(clientSearch);
      if (section === 'planning') {
        await Promise.all([loadRooms(planner.from, planner.to), loadOverview()]);
      }
      if (section === 'cash') await Promise.all([loadCashSessions(), loadOverview(), loadShiftReports(), loadClients()]);
      if (section === 'folios') await Promise.all([loadFolioList(folioFilter), loadOverview()]);
      if (section === 'restaurantOrders') await loadRestaurantOrders();
      if (section === 'activity') await loadActivity(activityFilters);
      if (section === 'notifications') await loadNotifications();
      if (section === 'folios' && selectedFolioId) await loadFolio(selectedFolioId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger cette section.');
    } finally {
      if (showLoading) setBusy(false);
    }
  }, [section, search, clientSearch, planner.from, planner.to, selectedFolio?.id, reservationFilter, folioFilter, activityFilters, loadOverview, loadReservations, loadClients, loadRooms, loadCashSessions, loadShiftReports, loadFolio, loadStays, loadFolioList, loadRestaurantOrders, loadActivity, loadNotifications, title]);

  useEffect(() => {
    // Keep the selected workspace section synchronized with persisted hotel data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSection();
  }, [loadSection]);

  useEffect(() => {
    if (!showTransitionOverlay || busy) return;
    const timer = window.setTimeout(() => setShowTransitionOverlay(false), 350);
    return () => window.clearTimeout(timer);
  }, [showTransitionOverlay, busy]);

  useEffect(() => {
    if (busy) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || backgroundRefreshInProgress.current) return;
      backgroundRefreshInProgress.current = true;
      void loadSection(false).finally(() => { backgroundRefreshInProgress.current = false; });
    };
    const timer = window.setInterval(refresh, 5_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [busy, loadSection]);

  useEffect(() => {
    function focusReceptionSearch(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (!typing && (event.key === '/' || (event.ctrlKey && event.key.toLowerCase() === 'k'))) {
        event.preventDefault();
        globalSearchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusReceptionSearch);
    return () => window.removeEventListener('keydown', focusReceptionSearch);
  }, []);

  useEffect(() => {
    const editingDates = editingReservation?.mode === 'update' || editingReservation?.mode === 'assign-room';
    const from = editingDates
      ? reservationEditForm.checkInDate
      : section === 'reservations' ? reservationForm.checkInDate : '';
    const to = editingDates
      ? reservationEditForm.checkOutDate
      : section === 'reservations'
        ? reservationForm.stayType === 'SIESTA' && reservationForm.checkInDate
          ? addDays(reservationForm.checkInDate, 1)
          : reservationForm.checkOutDate
        : '';
    if (!from || !to) return;
    const timer = window.setTimeout(() => {
      void loadRooms(from, to).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Impossible de vérifier les disponibilités.');
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [section, reservationForm.checkInDate, reservationForm.checkOutDate, reservationForm.stayType, editingReservation?.mode, reservationEditForm.checkInDate, reservationEditForm.checkOutDate, loadRooms]);

  async function runAction(action: () => Promise<void>, success: string, loadingMessage = 'Traitement en cours…', showOverlay = false) {
    if (showOverlay) setShowTransitionOverlay(true);
    setBusy(true);
    setBusyMessage(loadingMessage);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await loadSection();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’opération a échoué.');
    } finally {
      setBusy(false);
    }
  }

  async function updateRoomAvailability(room: Room) {
    const action = room.status === 'OUT_OF_SERVICE' ? 'RELEASE' : 'BLOCK';
    const reason = window.prompt(
      action === 'BLOCK' ? `Motif d’indisponibilité de la chambre ${room.number} :` : `Motif de remise à disposition de la chambre ${room.number} :`,
      action === 'RELEASE' ? 'Vérification effectuée par la Réception' : '',
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('Indiquez un motif d’au moins 3 caractères.');
      return;
    }
    const confirmation = action === 'BLOCK'
      ? `Confirmez-vous la mise en indisponibilité de la chambre ${room.number} ?\nMotif : ${reason.trim()}`
      : `Confirmez-vous la remise à disposition de la chambre ${room.number} ?\nMotif : ${reason.trim()}`;
    if (!window.confirm(confirmation)) return;
    await runAction(async () => {
      await api('/api/reception/rooms', {
        method: 'PATCH',
        body: JSON.stringify({ roomId: room.id, action, reason: reason.trim() }),
      });
    }, action === 'BLOCK' ? 'Chambre rendue indisponible et motif enregistré.' : 'Chambre remise à disposition et opération enregistrée.');
  }

  async function uploadIdDocument(clientId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`/api/reception/clients/${encodeURIComponent(clientId)}/document`, { method: 'POST', body });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Le scan de la pièce d’identité n’a pas été enregistré.');
    }
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError('');
    setNotice('');
    let possibleDuplicates: Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'createdByName'>[];
    try {
      const data = await api<{ possibleDuplicates: Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'createdByName'>[] }>('/api/reception/clients/check-duplicates', {
        method: 'POST',
        body: JSON.stringify(clientForm),
      });
      possibleDuplicates = data.possibleDuplicates;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La vérification des doublons a échoué.');
      return;
    }
    const allowPossibleDuplicate = possibleDuplicates.length > 0;
    if (allowPossibleDuplicate) {
      const matches = possibleDuplicates
        .map((client) => `${client.name}${client.phone ? ` · ${client.phone}` : ''}${client.email ? ` · ${client.email}` : ''}`)
        .join('\n');
      if (!window.confirm(`Des fiches similaires existent déjà :\n${matches}\n\nCréer quand même une nouvelle fiche ?`)) {
        setNotice('Aucune fiche n’a été créée. Vous pouvez rechercher et réutiliser le client existant.');
        return;
      }
    }
    await runAction(async () => {
      const data = await api<{ client: Client }>('/api/reception/clients', {
        method: 'POST',
        body: JSON.stringify({ ...clientForm, allowPossibleDuplicate }),
      });
      if (clientIdScan) await uploadIdDocument(data.client.id, clientIdScan);
      setClientForm({ name: '', phone: '', email: '', nationality: '', address: '', idType: '', idNumber: '', notes: '' });
      setClientIdScan(null);
      formElement.reset();
      setReservationForm((current) => ({ ...current, clientId: data.client.id }));
      if (section !== 'clients') setSection('clients');
    }, clientIdScan ? 'Fiche client créée et scan de la pièce d’identité enregistré.' : 'Fiche client créée.', clientIdScan ? 'Enregistrement du client et téléversement du scan…' : 'Enregistrement du client…', Boolean(clientIdScan));
  }

  function beginClientEdit(client: Client) {
    setClientEditForm({
      name: client.name,
      phone: client.phone ?? '',
      email: client.email ?? '',
      nationality: client.nationality ?? '',
      address: client.address ?? '',
      idType: client.idType ?? '',
      idNumber: client.idNumber ?? '',
      notes: client.notes ?? '',
    });
    setClientEditIdScan(null);
    setEditingClient(client);
  }

  async function saveClientEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClient) return;
    if (!window.confirm(`Modifier la fiche de ${editingClient.name} ? Le créateur d’origine reste enregistré de façon permanente.`)) return;
    await runAction(async () => {
      await api(`/api/reception/clients/${editingClient.id}`, { method: 'PATCH', body: JSON.stringify(clientEditForm) });
      if (clientEditIdScan) await uploadIdDocument(editingClient.id, clientEditIdScan);
      setClientEditIdScan(null);
      setEditingClient(null);
      setClientDetail(null);
    }, clientEditIdScan
      ? 'Fiche client modifiée et scan de la pièce d’identité enregistré ; création d’origine conservée.'
      : 'Fiche client modifiée ; création d’origine conservée et modification auditée.',
    clientEditIdScan ? 'Mise à jour de la fiche et téléversement du scan…' : 'Mise à jour de la fiche client…',
    Boolean(clientEditIdScan));
  }

  function beginMove(reservation: Reservation) {
    setMoveRoomId('');
    setError('');
    setMoveTarget(reservation);
    const today = overview?.today ?? reservation.checkInDate;
    void runAction(() => loadRooms(today, reservation.checkOutDate > today ? reservation.checkOutDate : addDays(today, 1)), 'Chambres actualisées pour le changement.');
  }

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moveTarget || !moveRoomId) {
      setError('Choisissez la chambre de destination.');
      return;
    }
    if (!moveTarget.room) {
      setError('Cette réservation n’a pas encore de chambre.');
      return;
    }
    if (!window.confirm(`Transférer ${moveTarget.client.name} de la chambre ${moveTarget.room.number} vers la chambre ${rooms.find((room) => room.id === moveRoomId)?.number ?? ''} ?`)) return;
    await runAction(async () => {
      await api(`/api/reception/reservations/${moveTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'move', roomId: moveRoomId }),
      });
      setMoveTarget(null);
    }, 'Changement de chambre enregistré ; ancienne chambre transmise au housekeeping.');
  }

  async function markNotifications() {
    await runAction(async () => {
      await api('/api/reception/notifications', { method: 'POST', body: JSON.stringify({ all: true }) });
      await loadNotifications();
    }, 'Notifications marquées comme lues.');
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm('Modifier votre mot de passe ? Toutes vos sessions seront déconnectées.')) return;
    await runAction(async () => {
      await api('/api/reception/profile/password', { method: 'POST', body: JSON.stringify(passwordForm) });
      router.push('/connexion');
      router.refresh();
    }, 'Mot de passe modifié. Reconnectez-vous.');
  }

  async function openReservationHistory(reservation: Reservation) {
    setBusy(true);
    setBusyMessage('Chargement de l’historique…');
    setError('');
    try {
      const data = await api<{ events: ActivityEvent[] }>(`/api/reception/activity?targetId=${encodeURIComponent(reservation.id)}`);
      setReservationHistory({ reservation, events: data.events });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Historique indisponible.');
    } finally {
      setBusy(false);
    }
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasRoom = Boolean(reservationForm.roomId);
    if (hasRoom && !availableRooms.some((room) => room.id === reservationForm.roomId)) {
      setError('Choisissez une chambre disponible sur la période demandée.');
      return;
    }
    await runAction(async () => {
      const { checkOutDate, checkInTime, roomId, agreedRate, ...reservation } = reservationForm;
      await api('/api/reception/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ...reservation,
          ...(hasRoom ? { roomId, agreedRate } : { agreedRate: '0' }),
          ...(reservationForm.stayType === 'OVERNIGHT' ? { checkOutDate } : {}),
          ...(reservationForm.stayType === 'SIESTA' && checkInTime ? { checkInTime } : {}),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setReservationForm((current) => ({ ...current, roomId: '', agreedRate: '', rateReason: '', includeBreakfast: false }));
    }, hasRoom ? 'Réservation créée et folio initialisé.' : 'Réservation créée sans chambre ; tarif à définir à l’attribution.');
  }

  async function reservationAction(reservation: Reservation, action: 'confirm' | 'cancel' | 'check-in' | 'check-out') {
    if (action === 'check-in' && !reservation.room) {
      setError('Attribuez une chambre avant le check-in.');
      return;
    }
    const prompts = {
      confirm: `Confirmer la réservation ${reservation.reference} ?`,
      cancel: `Annuler ${reservation.reference} ? Cette action ne supprime pas l’historique.`,
      'check-in': `Confirmer le check-in de ${reservation.client.name} en chambre ${reservation.room!.number} ? Vérifiez sa pièce d’identité sur sa fiche client avant de poursuivre.`,
      'check-out': `Confirmer le check-out de ${reservation.client.name} ?`,
    };
    if (!window.confirm(prompts[action])) return;
    await runAction(async () => {
      await api(`/api/reception/reservations/${reservation.id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    }, action === 'check-out' ? 'Départ enregistré ; chambre transmise au housekeeping.' : 'Statut de la réservation mis à jour.');
  }

  async function decideRestaurantOrder(order: RestaurantOrder, action: 'confirm' | 'reject') {
    if (action === 'reject' && !window.confirm(`Refuser la commande ${order.number} ? Elle ne sera pas ajoutée au folio.`)) return;
    if (action === 'confirm' && !window.confirm(`Confirmer ${order.number} pour la chambre ${order.room?.number ?? 'sans chambre'} ? ${formatMoney(order.totalAmount, configuration.currency)} sera ajoute au folio du sejour actif de cette chambre.`)) return;
    await runAction(async () => {
      await api(`/api/restaurant/orders/${encodeURIComponent(order.id)}/reception`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    }, action === 'confirm' ? 'Commande confirmee et ajoutee au folio.' : 'Commande refusee ; aucun montant ne sera facture.');
  }

  function beginReservationEdit(reservation: Reservation, mode: EditingReservation['mode']) {
    setReservationEditForm({
      roomId: reservation.room?.id ?? '',
      clientId: reservation.client.id,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      agreedRate: reservation.room ? reservation.nightlyRate : '',
      rateReason: reservation.rateReason ?? '',
      adults: reservation.adults,
      children: reservation.children,
    });
    setError('');
    setEditingReservation({ reservation, mode });
  }

  async function saveReservationEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingReservation) return;
    const { reservation, mode } = editingReservation;
    const body = mode === 'assign-room'
      ? {
        action: 'update' as const,
        roomId: reservationEditForm.roomId,
        adults: reservationEditForm.adults,
        children: reservationEditForm.children,
        ...(reservationEditForm.agreedRate ? { agreedRate: reservationEditForm.agreedRate } : {}),
        rateReason: reservationEditForm.rateReason,
        ...(reservation.stayType === 'OVERNIGHT' ? {
          clientId: reservation.client.id,
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
        } : {}),
      }
      : mode === 'update'
        ? {
          action: mode,
          roomId: reservationEditForm.roomId,
          clientId: reservationEditForm.clientId,
          checkInDate: reservationEditForm.checkInDate,
          checkOutDate: reservationEditForm.checkOutDate,
          adults: reservationEditForm.adults,
          children: reservationEditForm.children,
          ...(reservationEditForm.agreedRate ? { agreedRate: reservationEditForm.agreedRate } : {}),
          rateReason: reservationEditForm.rateReason,
        }
        : mode === 'extend'
          ? { action: mode, checkOutDate: reservationEditForm.checkOutDate }
          : { action: mode, adults: reservationEditForm.adults, children: reservationEditForm.children };
    await runAction(async () => {
      await api(`/api/reception/reservations/${reservation.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEditingReservation(null);
    }, mode === 'extend'
      ? 'Séjour prolongé et prestation ajoutée au folio.'
      : mode === 'occupants'
        ? 'Liste des occupants mise à jour.'
        : mode === 'assign-room'
          ? 'Chambre attribuée et tarif appliqué au folio.'
          : 'Réservation modifiée.');
  }

  async function openFolio(reservation: Reservation) {
    if (!reservation.folio) {
      setError('Le folio de cette réservation est indisponible.');
      return;
    }
    setBusy(true);
    setBusyMessage('Ouverture du folio…');
    setError('');
    try {
      await loadFolio(reservation.folio.id);
      navigate('folios');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’ouvrir le folio.');
    } finally {
      setBusy(false);
    }
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolio) return;
    await runAction(async () => {
      await api(`/api/reception/folios/${selectedFolio.id}/lines`, {
        method: 'POST',
        body: JSON.stringify(serviceForm),
      });
      setServiceForm({ description: '', amount: '' });
    }, 'Prestation ajoutée au folio et auditée.');
  }

  async function issueInvoice() {
    if (!selectedFolio) return;
    const payerName = invoicePayerName.trim();
    if (payerName.length < 2) {
      setError('Saisissez le nom du payeur pour la facture.');
      return;
    }
    if (!window.confirm(`Émettre la facture au nom de ${payerName} pour le folio ${selectedFolio.reservation.reference} ?`)) return;
    await runAction(async () => {
      await api(`/api/reception/folios/${selectedFolio.id}/invoice`, {
        method: 'POST',
        body: JSON.stringify({ payerName }),
      });
    }, 'Facture créée. Elle est maintenant disponible pour impression sur rouleau 80 mm.');
  }

  async function collectPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolio || !overview?.cashSession) {
      setError('Ouvrez votre session de caisse avant d’encaisser.');
      return;
    }
    if (!window.confirm(`Encaisser ${formatMoney(paymentForm.amount, configuration.currency)} pour ${selectedFolio.reservation.reference} ?`)) return;
    await runAction(async () => {
      const data = await api<{ payment: { amount: string; method: string; reference: string | null; createdAt: string } }>('/api/reception/payments', {
        method: 'POST',
        body: JSON.stringify({
          folioId: selectedFolio.id,
          paymentMethodId: paymentForm.paymentMethodId,
          amount: paymentForm.amount,
          reference: paymentForm.reference,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setReceipt({
        hotel: configuration.name,
        client: selectedFolio.reservation.client.name,
        reservation: selectedFolio.reservation.reference,
        amount: data.payment.amount,
        method: data.payment.method,
        reference: data.payment.reference,
        date: data.payment.createdAt,
      });
      setPaymentForm((current) => ({ ...current, amount: '', reference: '' }));
      await Promise.all([loadCashSessions(), loadOverview()]);
    }, 'Paiement enregistré. Aucun paiement ne peut être modifié ou supprimé.');
  }

  async function openCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await api('/api/reception/cash-session', {
        method: 'POST',
        body: JSON.stringify({ openingAmount }),
      });
    }, 'Session de caisse ouverte pour votre compte.');
  }

  async function closeCashSession(session: CashSession, reportInput: ShiftReportCloseInput) {
    if (!window.confirm('Clôturer votre caisse et enregistrer le rapport de fin de service ?')) return;
    await runAction(async () => {
      const data = await api<{ report: ShiftReport }>('/api/reception/cash-session', {
        method: 'PATCH',
        body: JSON.stringify({ sessionId: session.id, countedAmount, ...reportInput }),
      });
      setCountedAmount('');
      setShiftExpenses([]);
      setIncidentNotes('');
      setHandoverNotes('');
      setSelectedShiftReport(data.report);
    }, 'Caisse clôturée et rapport de service enregistré.');
  }

  async function openClientDetail(client: Client) {
    setBusy(true);
    setBusyMessage('Chargement de la fiche client…');
    setError('');
    try {
      const data = await api<{ client: Client & { reservations: Record<string, unknown>[] } }>(
        `/api/reception/clients/${client.id}`,
      );
      setClientDetail({ client, reservations: data.client.reservations });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’ouvrir la fiche client.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('La déconnexion n’a pas abouti. Réessayez.');
      router.push('/connexion');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La déconnexion a échoué.');
    }
  }

  function navigate(next: Section) {
    if (next === section) {
      setMobileMenu(false);
      return;
    }
    setShowTransitionOverlay(true);
    setBusy(true);
    setBusyMessage(`Chargement de ${navigation.find((item) => item.id === next)?.label.toLowerCase() ?? 'la section'}…`);
    setSection(next);
    setMobileMenu(false);
    setNotice('');
    setError('');
  }

  return (
    <div className="reception-shell" data-theme={theme}>
      {showTransitionOverlay && <div className="route-loading-overlay" role="status" aria-live="polite">
        <div className="route-loading-card">
          <span className="route-loading-rings" aria-hidden="true" />
          <span>{busyMessage}</span>
        </div>
      </div>}
      {mobileMenu && <button className="reception-backdrop" onClick={() => setMobileMenu(false)} aria-label="Fermer la navigation" />}
      <aside className={`reception-sidebar${mobileMenu ? ' is-open' : ''}`}>
        <div className="reception-brand">
          <span className="reception-brand-mark"><BedDouble size={19} /></span>
          <span><strong>BLISS HÔTEL</strong><small>Réception</small></span>
          <button className="reception-icon-button reception-mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fermer"><X size={18} /></button>
        </div>
        <nav className="reception-nav" aria-label="Navigation réception">
          <p>Opérations</p>
          {navigation.filter((item) => item.id !== 'restaurantOrders' || (overview?.permissions ?? []).includes('restaurant.folio.transfer')).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`reception-nav-item${section === id ? ' is-active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={17} /><span>{label}</span>
              {id === 'notifications' && unreadCount > 0 && <em className="reception-nav-badge">{unreadCount}</em>}
              {id === 'restaurantOrders' && restaurantOrders.length > 0 && <em className="reception-nav-badge">{restaurantOrders.length}</em>}
            </button>
          ))}
        </nav>
        <div className="reception-sidebar-foot">
          <div className="reception-profile"><span className="reception-avatar">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}</strong><small>Réceptionniste</small></span></div>
          <button className="reception-logout" onClick={logout}><LogOut size={16} />Déconnexion</button>
        </div>
      </aside>

      <main className="reception-main">
        <header className="reception-topbar">
          <button className="reception-icon-button reception-menu-toggle" onClick={() => setMobileMenu(true)} aria-label="Ouvrir la navigation"><Menu size={19} /></button>
          <div className="reception-location"><span>BLISS HÔTEL</span><i>/</i><strong>{title}</strong></div>
          <form className="reception-global-search" onSubmit={(event) => { event.preventDefault(); navigate('reservations'); void runAction(() => loadReservations(search, reservationFilter), 'Recherche actualisée.'); }}>
            <Search size={16} /><input ref={globalSearchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, téléphone, réservation, chambre…" aria-label="Rechercher dans les réservations" /><kbd>/</kbd><button aria-label="Rechercher"><Search size={15} /></button>
          </form>
          <div className="reception-hotel-name"><span>Hôtel</span><strong>{configuration.name}</strong></div>
          <DashboardThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <section className="reception-content">
          <div className="reception-heading">
            <div><p className="reception-eyebrow">Espace opérationnel</p><h1>{title}</h1><p>{configuration.name}{overview ? ` · ${formatDate(overview.today)}` : ''}</p></div>
            <span className={`reception-cash-indicator${overview?.cashSession ? ' is-open' : ''}`}><Wallet size={15} />{overview?.cashSession ? 'Caisse ouverte' : 'Caisse fermée'}</span>
          </div>
          {error && <div className="reception-alert is-error" role="alert"><ShieldAlert size={17} />{error}</div>}
          {notice && <div className="reception-alert is-success" role="status"><Check size={16} />{notice}</div>}
          {busy && <div className="reception-loading" role="status" aria-live="polite">{busyMessage}</div>}

          <div className="reception-section-view" key={section}>
          {section === 'overview' && <OverviewSection data={overview} currency={configuration.currency} timezone={configuration.timezone} navigate={navigate} period={statPeriod} setPeriod={(next) => { setStatPeriod(next); }} />}
          {section === 'operations' && <OperationsCenter name={name} roleCode="RECEPTIONIST" />}
          {section === 'reservations' && <ReservationsSection
            data={reservations}
            clients={clients}
            rooms={roomsForEditor}
            roomCatalog={rooms}
            availableRoomIds={new Set(availableRooms.map((room) => room.id))}
            availabilityError={roomAvailability.error}
            form={reservationForm}
            setForm={setReservationForm}
            permissions={overview?.permissions ?? []}
            search={search}
            setSearch={setSearch}
            submitSearch={(event) => { event.preventDefault(); void runAction(() => loadReservations(search, reservationFilter), 'Recherche actualisée.'); }}
            filters={reservationFilter}
            setFilters={(next) => { setReservationFilter(next); void runAction(() => loadReservations(search, next), 'Filtre appliqué.'); }}
            create={createReservation}
            confirm={(item) => void reservationAction(item, 'confirm')}
            cancel={(item) => void reservationAction(item, 'cancel')}
            checkIn={(item) => void reservationAction(item, 'check-in')}
            checkOut={(item) => void reservationAction(item, 'check-out')}
            edit={(item) => beginReservationEdit(item, 'update')}
            assignRoom={(item) => beginReservationEdit(item, 'assign-room')}
            extend={(item) => beginReservationEdit(item, 'extend')}
            occupants={(item) => beginReservationEdit(item, 'occupants')}
            openFolio={(item) => void openFolio(item)}
            history={(item) => void openReservationHistory(item)}
            move={(item) => beginMove(item)}
            goClients={() => navigate('clients')}
            currency={configuration.currency}
            timezone={configuration.timezone}
            checkOutTime={configuration.checkOutTime}
          />}
          {section === 'stays' && <StaysSection
            overview={overview}
            stays={stays}
            permissions={overview?.permissions ?? []}
            currency={configuration.currency}
            timezone={configuration.timezone}
            checkOut={(item) => void reservationAction(item, 'check-out')}
            extend={(item) => beginReservationEdit(item, 'extend')}
            occupants={(item) => beginReservationEdit(item, 'occupants')}
            move={(item) => beginMove(item)}
            openFolio={(item) => void openFolio(item)}
            refresh={() => void runAction(async () => { await Promise.all([loadStays(), loadOverview()]); }, 'Réception actualisée.')}
            navigate={navigate}
          />}
          {section === 'clients' && <ClientsSection
            data={clients}
            form={clientForm}
            setForm={setClientForm}
            search={clientSearch}
            setSearch={setClientSearch}
            submitSearch={(event) => { event.preventDefault(); void runAction(() => loadClients(clientSearch), 'Recherche actualisée.'); }}
            create={createClient}
            idScan={clientIdScan}
            setIdScan={setClientIdScan}
            openDetail={(client) => void openClientDetail(client)}
            edit={(client) => beginClientEdit(client)}
            canEdit={(overview?.permissions ?? []).includes('clients.update')}
            canCreate={(overview?.permissions ?? []).includes('clients.create')}
            timezone={configuration.timezone}
          />}
          {section === 'folios' && <>
            <FolioListSection
              data={folioList}
              filter={folioFilter}
              setFilter={setFolioFilter}
              open={(folioId) => void openFolioFromList(folioId)}
              openingId={folioOpeningId}
              currency={configuration.currency}
              timezone={configuration.timezone}
            />
            <div ref={folioDetailsRef} id="reception-folio-detail" tabIndex={-1}>
            <FolioSection
              data={selectedFolio}
              payerName={invoicePayerName}
              setPayerName={setInvoicePayerName}
              currency={configuration.currency}
              timezone={configuration.timezone}
              methods={overview?.paymentMethods ?? []}
              cashOpen={Boolean(overview?.cashSession)}
              service={serviceForm}
              setService={setServiceForm}
              addService={addService}
              issueInvoice={() => void issueInvoice()}
              printInvoice={() => setInvoicePrintOpen(true)}
              payment={paymentForm}
              setPayment={setPaymentForm}
              collect={collectPayment}
              openReservations={() => navigate('reservations')}
            />
            </div>
          </>}
          {section === 'restaurantOrders' && <section className="reception-panel reception-restaurant-orders">
            <div className="reception-panel-heading"><div><p>À VALIDER AVANT FACTURATION</p><h2>Commandes restaurant en attente</h2></div><Utensils size={18} /></div>
            {restaurantOrders.length ? <div className="reception-restaurant-order-list">{restaurantOrders.map((order) => <article className="reception-restaurant-order" key={order.id}>
              <header><div><strong>{order.number} · {order.room ? `Chambre ${order.room.number}` : 'Chambre à rattacher'}</strong><span>{order.reservation?.client.name ?? (order.room ? 'Client de la chambre' : order.guestName)} · {order.source === 'ROOM_SERVICE' ? 'Dans la chambre' : 'Au bar-restaurant'} · {formatDateTime(order.createdAt, configuration.timezone)}</span></div><b>{formatMoney(order.totalAmount, configuration.currency)}</b></header>
              <ul>{order.lines.map((line) => <li key={line.id}><span>{line.name}{line.billingUnit === 'ROOM_NIGHT' ? ` · ${line.quantity} nuitée(s)` : ` · × ${line.quantity}`}</span><strong>{formatMoney(line.lineTotal, configuration.currency)}</strong></li>)}</ul>
              <footer><span>{order.reservation ? `Sejour ${order.reservation.reference}` : 'Aucun séjour actif n’était lié à cette commande lors de sa saisie. Elle ne peut pas être imputée sans risquer de facturer un autre client.'} | {formatMoney(order.totalAmount, configuration.currency)}{order.reservation ? ' sera ajoute au folio.' : ''} Aucun paiement au bar.</span><div><button className="reception-button danger" onClick={() => void decideRestaurantOrder(order, 'reject')}>Refuser</button><button className="reception-button primary" disabled={!order.reservation} onClick={() => void decideRestaurantOrder(order, 'confirm')}>Confirmer et ajouter au folio</button></div></footer>
            </article>)}</div> : <EmptyState text="Aucune commande n’attend la confirmation de la réception." />}
          </section>}
          {section === 'planning' && <PlanningSection
            data={rooms}
            currency={configuration.currency}
            permissions={overview?.permissions ?? []}
            from={planner.from}
            to={planner.to}
            setPlanner={setPlanner}
            updateRoomAvailability={(room) => void updateRoomAvailability(room)}
            search={() => void runAction(() => loadRooms(planner.from, planner.to), 'Planning actualisé.')}
          />}
          {section === 'cash' && <CashSection
            sessions={cashSessions}
            current={overview?.cashSession ?? null}
            reports={shiftReports}
            openingAmount={openingAmount}
            setOpeningAmount={setOpeningAmount}
            countedAmount={countedAmount}
            setCountedAmount={setCountedAmount}
            shiftType={shiftType}
            setShiftType={setShiftType}
            expenses={shiftExpenses}
            setExpenses={setShiftExpenses}
            incidentNotes={incidentNotes}
            setIncidentNotes={setIncidentNotes}
            handoverNotes={handoverNotes}
            setHandoverNotes={setHandoverNotes}
            paymentMethods={overview?.paymentMethods ?? []}
            open={openCashSession}
            close={(session, report) => void closeCashSession(session, report)}
            viewReport={setSelectedShiftReport}
            currency={configuration.currency}
            timezone={configuration.timezone}
          />}
          {section === 'activity' && <ActivitySection
            data={activity}
            filters={activityFilters}
            setFilters={(next) => { setActivityFilters(next); void runAction(() => loadActivity(next), 'Historique actualisé.'); }}
            currency={configuration.currency}
            timezone={configuration.timezone}
          />}
          {section === 'notifications' && <NotificationsSection
            data={notifications}
            timezone={configuration.timezone}
            markRead={() => void markNotifications()}
          />}
          {section === 'profile' && <ProfileSection
            name={name}
            account={account}
            permissions={overview?.permissions ?? []}
            currency={configuration.currency}
            session={cashSessions.find((item) => item.status === 'OPEN') ?? null}
            passwordForm={passwordForm}
            setPasswordForm={setPasswordForm}
            changePassword={changePassword}
            logout={logout}
          />}
          </div>
        </section>
      </main>

      {editingReservation && <ReservationEditDialog
        data={editingReservation}
        form={reservationEditForm}
        setForm={setReservationEditForm}
        clients={clients}
        rooms={rooms.filter((room) => !room.hasOpenHousekeepingTask && room.status !== 'OUT_OF_SERVICE' && !room.reservations.some((item) => item.id !== editingReservation.reservation.id && dateRangesOverlap(item.checkInDate, item.checkOutDate, reservationEditForm.checkInDate || editingReservation.reservation.checkInDate, reservationEditForm.checkOutDate || editingReservation.reservation.checkOutDate)))}
        currency={configuration.currency}
        close={() => setEditingReservation(null)}
        submit={saveReservationEdit}
      />}
      {clientDetail && <ClientDialog data={clientDetail} close={() => setClientDetail(null)} currency={configuration.currency} timezone={configuration.timezone} />}
      {receipt && <ReceiptDialog data={receipt} close={() => setReceipt(null)} currency={configuration.currency} timezone={configuration.timezone} />}
      {selectedShiftReport && <ShiftReportPrintDialog report={selectedShiftReport} hotel={configuration} close={() => setSelectedShiftReport(null)} />}
      {invoicePrintOpen && selectedFolio?.invoice && <InvoicePrintDialog
        data={selectedFolio}
        hotelName={configuration.name}
        currency={configuration.currency}
        timezone={configuration.timezone}
        close={() => setInvoicePrintOpen(false)}
      />}
      {editingClient && <ClientEditDialog form={clientEditForm} setForm={setClientEditForm} client={editingClient} idScan={clientEditIdScan} setIdScan={setClientEditIdScan} close={() => setEditingClient(null)} submit={saveClientEdit} />}
      {moveTarget && <MoveRoomDialog
        reservation={moveTarget}
        rooms={rooms.filter((room) => !room.hasOpenHousekeepingTask && room.id !== moveTarget.room?.id && room.status === 'AVAILABLE' && room.housekeepingStatus === 'CLEAN' && !room.reservations.some((item) => dateRangesOverlap(item.checkInDate, item.checkOutDate, overview?.today ?? item.checkInDate, moveTarget.checkOutDate)))}
        value={moveRoomId}
        setValue={setMoveRoomId}
        close={() => setMoveTarget(null)}
        submit={submitMove}
      />}
      {reservationHistory && <HistoryDialog data={reservationHistory} timezone={configuration.timezone} close={() => setReservationHistory(null)} />}
    </div>
  );
}

function OverviewSection({ data, currency, timezone, navigate, period, setPeriod }: { data: Overview | null; currency: string; timezone: string; navigate: (section: Section) => void; period: StatPeriod; setPeriod: (period: StatPeriod) => void }) {
  if (!data) return (
    <div className="reception-overview-loading" role="status" aria-label="Chargement des données de l’établissement">
      <div className="reception-metrics">
        {Array.from({ length: 5 }, (_, index) => <div className="reception-metric reception-skeleton-card" key={index}><span /><small /><strong /></div>)}
      </div>
      <div className="reception-overview-grid">
        {Array.from({ length: 3 }, (_, index) => <div className="reception-panel reception-skeleton-panel" key={index}><span /><strong /><div /></div>)}
      </div>
    </div>
  );
  const cards = [
    { title: 'Chambres (total)', value: data.rooms.total, icon: BedDouble, section: 'planning' as const },
    { title: 'Arrivées du jour', value: data.arrivals, icon: DoorOpen, section: 'stays' as const },
    { title: 'Départs du jour', value: data.departures, icon: LogOut, section: 'stays' as const },
    { title: 'Clients présents', value: data.inHouse, icon: Users, section: 'stays' as const },
    { title: 'À confirmer', value: data.pendingReservations, icon: CalendarDays, section: 'reservations' as const },
    { title: 'Confirmées', value: data.confirmedReservations, icon: Check, section: 'reservations' as const },
    { title: 'Annulées', value: data.cancelledReservations, icon: X, section: 'reservations' as const },
    { title: 'Siestes en cours', value: data.stays.siestas, icon: Activity, section: 'reservations' as const },
    { title: 'Nuitées en cours', value: data.stays.overnights, icon: BedDouble, section: 'reservations' as const },
    { title: 'Siestes à échéance', value: data.stays.expiring + data.stays.overdueSiestas, icon: ShieldAlert, section: 'reservations' as const },
    { title: 'Paiements en attente', value: data.pendingPayments, detail: formatMoney(data.pendingAmount, currency), icon: CircleDollarSign, section: 'folios' as const },
  ];
  const roomCards = [
    ['Disponibles', data.rooms.available, 'available'],
    ['Occupées', data.rooms.occupied, 'occupied'],
    ['Réservées aujourd’hui', data.rooms.reserved, 'reserved'],
    ['À nettoyer', data.rooms.toClean, 'dirty'],
    ['Nettoyage en cours', data.rooms.inProgress, 'cleaning'],
    ['À inspecter', data.rooms.toInspect, 'inspect'],
    ['En maintenance / hors service', data.rooms.maintenance, 'out-of-service'],
  ] as const;
  const periodLabels: Record<StatPeriod, string> = { day: 'Jour', week: 'Semaine', month: 'Mois' };
  return <>
    <div className="reception-period-filter" role="group" aria-label="Période des statistiques personnelles">
      <span>Période d’analyse (statistiques personnelles) :</span>
      {(Object.keys(periodLabels) as StatPeriod[]).map((value) => <button key={value} type="button" className={`reception-chip${period === value ? ' is-active' : ''}`} onClick={() => setPeriod(value)}>{periodLabels[value]}</button>)}
    </div>
    <div className="reception-metrics">{cards.map(({ title, value, detail, icon: Icon, section }) => <button key={title} className="reception-metric" onClick={() => navigate(section)}><span><Icon size={18} /></span><small>{title}</small><strong>{value.toLocaleString('fr-FR')}</strong>{detail && <em>{detail} à encaisser</em>}</button>)}</div>
    <div className="reception-chart-grid">
      <article className="reception-panel reception-chart-panel"><div className="reception-panel-heading"><div><p>INVENTAIRE · ÉTAT ACTUEL</p><h2>Répartition des chambres</h2></div><BedDouble size={18} /></div><CockpitDonut total={data.rooms.total} centerValue={`${data.rooms.occupied}/${data.rooms.total}`} centerLabel="occupées" segments={[
        { label: 'Occupées', value: data.rooms.occupied, color: '#5896d0' },
        { label: 'Disponibles', value: data.rooms.available, color: '#56a986' },
        { label: 'À préparer', value: data.rooms.dirty, color: '#c6a878' },
        { label: 'Hors service', value: data.rooms.outOfService, color: '#d97868' },
        { label: 'Autres états', value: Math.max(0, data.rooms.total - data.rooms.available - data.rooms.occupied - data.rooms.dirty - data.rooms.outOfService), color: '#aab5c1' },
      ]} onSelect={() => navigate('planning')} /><p className="reception-chart-note">Sélectionnez une catégorie pour ouvrir le planning des chambres.</p></article>
      <article className="reception-panel reception-chart-panel"><div className="reception-panel-heading"><div><p>FLUX DU JOUR</p><h2>Arrivées & départs</h2></div><Activity size={18} /></div><CockpitBars rows={[{ label: 'Arrivées', value: data.arrivals, color: '#5896d0' }, { label: 'Départs', value: data.departures, color: '#c6a878' }]} /><p className="reception-chart-note">Comptage selon les dates d’arrivée et de départ prévues aujourd’hui.</p><button className="reception-link-button" onClick={() => navigate('stays')}>Ouvrir les opérations de séjour →</button></article>
    </div>
    <div className="reception-overview-grid">
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Statistiques globales de l’hôtel</p><h2>État des chambres</h2></div><BedDouble size={18} /></div><div className="reception-room-summary">{roomCards.map(([label, count, status]) => <div key={status}><span className={`reception-room-dot ${status}`} /><span>{label}</span><strong>{count}</strong></div>)}</div><button className="reception-link-button" onClick={() => navigate('planning')}>Ouvrir le planning chambres</button></article>
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Ma caisse</p><h2>{data.cashSession ? 'Session ouverte' : 'Aucune session ouverte'}</h2></div><Wallet size={18} /></div>{data.cashSession ? <><div className="reception-cash-summary"><span>Fonds initial</span><strong>{formatMoney(data.cashSession.openingAmount, currency)}</strong></div><div className="reception-cash-summary"><span>Solde espèces en caisse</span><strong>{formatMoney(data.cashSession.cashBalance, currency)}</strong></div><p className="reception-note">Les paiements nécessitent une session personnelle ouverte.</p></> : <p className="reception-note">Ouvrez votre session pour encaisser. Les mouvements resteront rattachés à votre compte.</p>}<button className="reception-button primary" onClick={() => navigate('cash')}>{data.cashSession ? 'Consulter ma caisse' : 'Ouvrir ma caisse'}</button></article>
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>File d’arrivée</p><h2>Arrivées et départs du jour</h2></div><CalendarDays size={18} /></div><div className="reception-queue-columns"><div><strong>Arrivées</strong>{data.todayArrivals.length ? data.todayArrivals.map((item) => <button key={item.id} onClick={() => navigate('reservations')}><span>{item.client.name}<small>{item.reference} · {item.room ? `ch. ${item.room.number}` : 'chambre à attribuer'}</small></span><StatusBadge value={item.status} /></button>) : <small>Aucune arrivée prévue.</small>}</div><div><strong>Départs</strong>{data.todayDepartures.length ? data.todayDepartures.map((item) => <button key={item.id} onClick={() => navigate('reservations')}><span>{item.client.name}<small>{item.reference} · {item.room ? `ch. ${item.room.number}` : 'chambre à attribuer'}</small></span><StatusBadge value="CHECKED_IN" /></button>) : <small>Aucun départ prévu.</small>}</div></div></article>
    </div>
    <div className="reception-overview-grid">
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Mon activité · {periodLabels[period].toLowerCase()}</p><h2>Indicateurs personnels</h2></div><Users size={18} /></div><div className="reception-room-summary"><div><span>Clients enregistrés</span><strong>{data.personalActivity.clientsCreated}</strong></div><div><span>Réservations créées</span><strong>{data.personalActivity.reservationsCreated}</strong></div><div><span>Arrivées / départs traités</span><strong>{data.personalActivity.checkIns} / {data.personalActivity.checkOuts}</strong></div><div><span>Paiements enregistrés</span><strong>{data.personalActivity.payments}</strong></div><div><span>Montant encaissé par moi</span><strong>{formatMoney(data.personalActivity.amountCollected, currency)}</strong></div></div></article>
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Échéances de sieste</p><h2>Alertes temporelles</h2></div><Activity size={18} /></div>{data.stays.siestaAlerts.length ? <ul className="reception-activity-list">{data.stays.siestaAlerts.map((item) => <li key={item.id} className={item.overdue ? 'is-overdue' : ''}><span><strong>{item.client} · ch. {item.room}</strong><small>{item.overdue ? 'Échéance dépassée' : 'Échéance prochaine'} · {item.reference}</small></span><time>{formatDateTime(item.expectedCheckOutAt, timezone)}</time></li>)}</ul> : <p className="reception-note">Aucune sieste proche de son échéance ou dépassée.</p>}</article>
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Activité de l’équipe · 24 h</p><h2>Opérations récentes</h2></div><Users size={18} /></div>{data.teamActivity.length ? <ul className="reception-activity-list">{data.teamActivity.map((item) => <li key={item.id}><span><strong>{item.actor}</strong><small>{receptionActionLabel(item.action)}</small></span><time>{formatDateTime(item.createdAt, timezone)}</time></li>)}</ul> : <p className="reception-note">Aucune activité enregistrée sur les dernières 24 heures.</p>}</article>
    </div>
    {data.paymentMethods.length === 0 && <div className="reception-alert is-info"><CreditCard size={16} />Aucun moyen de paiement n’est activé pour cet établissement. Les encaissements resteront indisponibles jusqu’à sa configuration.</div>}
  </>;
}

function receptionActionLabel(action: string) {
  const labels: Record<string, string> = {
    RECEPTION_CLIENT_CREATE: 'Client enregistré',
    RECEPTION_RESERVATION_CREATE: 'Réservation créée',
    RECEPTION_STAY_CHECK_IN: 'Check-in effectué',
    RECEPTION_STAY_CHECK_IN_CORRECTED: 'Arrivée corrigée',
    RECEPTION_STAY_CHECK_OUT: 'Check-out effectué',
    RECEPTION_PAYMENT_COLLECT: 'Paiement enregistré',
    RECEPTION_PAYMENT_DIRECT: 'Paiement direct client',
  };
  return labels[action] ?? 'Opération réception';
}

function ReservationsSection({ data, clients, rooms, roomCatalog, availableRoomIds, availabilityError, form, setForm, permissions, search, setSearch, submitSearch, filters, setFilters, create, confirm, cancel, checkIn, checkOut, edit, assignRoom, extend, occupants, openFolio, history, move, goClients, currency, timezone, checkOutTime }: {
  data: Reservation[];
  clients: Client[];
  rooms: Room[];
  roomCatalog: Room[];
  availableRoomIds: Set<string>;
  availabilityError: string | null;
  form: { clientId: string; roomId: string; checkInDate: string; checkOutDate: string; checkInTime: string; stayType: 'SIESTA' | 'OVERNIGHT'; agreedRate: string; rateReason: string; includeBreakfast: boolean; adults: number; children: number };
  setForm: (value: { clientId: string; roomId: string; checkInDate: string; checkOutDate: string; checkInTime: string; stayType: 'SIESTA' | 'OVERNIGHT'; agreedRate: string; rateReason: string; includeBreakfast: boolean; adults: number; children: number }) => void;
  permissions: string[];
  search: string;
  setSearch: (value: string) => void;
  submitSearch: (event: FormEvent<HTMLFormElement>) => void;
  filters: { status: string; period: string };
  setFilters: (next: { status: string; period: string }) => void;
  create: (event: FormEvent<HTMLFormElement>) => void;
  confirm: (reservation: Reservation) => void;
  cancel: (reservation: Reservation) => void;
  checkIn: (reservation: Reservation) => void;
  checkOut: (reservation: Reservation) => void;
  edit: (reservation: Reservation) => void;
  assignRoom: (reservation: Reservation) => void;
  extend: (reservation: Reservation) => void;
  occupants: (reservation: Reservation) => void;
  openFolio: (reservation: Reservation) => void;
  history: (reservation: Reservation) => void;
  move: (reservation: Reservation) => void;
  goClients: () => void;
  currency: string;
  timezone: string;
  checkOutTime: string | null;
}) {
  const [rateReasonDialogOpen, setRateReasonDialogOpen] = useState(false);
  const reservationFormRef = useRef<HTMLFormElement>(null);
  const selectedRoom = roomCatalog.find((room) => room.id === form.roomId);
  const availabilityReady = Boolean(form.checkInDate && (form.stayType === 'SIESTA'
    ? form.checkInTime
    : form.checkOutDate && checkOutTime));
  const outsideRateRange = Boolean(
    form.stayType === 'OVERNIGHT'
    && selectedRoom
    && form.agreedRate
    && isRateOutsideRange(form.agreedRate, selectedRoom.nightlyRateMin, selectedRoom.nightlyRateMax),
  );
  const estimatedAccommodation = selectedRoom
    ? form.stayType === 'SIESTA'
      ? Number(form.agreedRate || 0)
      : Number(form.agreedRate || 0) * nightsBetween(form.checkInDate, form.checkOutDate)
    : 0;
  const breakfastPrice = selectedRoom && form.stayType === 'OVERNIGHT' ? 5000 : 0;
  const estimatedTotal = estimatedAccommodation + (form.includeBreakfast ? breakfastPrice : 0);
  const can = (permission: string) => permissions.includes(permission);
  function submitReservation(event: FormEvent<HTMLFormElement>) {
    if (outsideRateRange && !form.rateReason.trim()) {
      event.preventDefault();
      setRateReasonDialogOpen(true);
      return;
    }
    create(event);
  }
  function confirmSpecialRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.rateReason.trim()) return;
    setRateReasonDialogOpen(false);
    reservationFormRef.current?.requestSubmit();
  }
  function cancelSpecialRate() {
    setRateReasonDialogOpen(false);
    setForm({ ...form, rateReason: '' });
  }
  return <>
    {permissions.includes('reservations.create') && (
    <form ref={reservationFormRef} className="reception-form-grid" onSubmit={submitReservation}>
      <div className="reception-form-title"><div><p>Nouvelle réservation</p><h2>Créer un séjour</h2></div><button type="button" className="reception-link-button" onClick={goClients}>Créer un client</button></div>
      <label><span>Client</span><select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} required><option value="">Choisir un client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}{client.phone ? ` · ${client.phone}` : ''}</option>)}</select>{clients.length === 0 && <small>Aucun client enregistré. Créez d’abord sa fiche.</small>}</label>
      <label><span>Type de séjour</span><select value={form.stayType} onChange={(event) => setForm({ ...form, stayType: event.target.value as 'SIESTA' | 'OVERNIGHT', checkInTime: event.target.value === 'SIESTA' ? '' : form.checkInTime, roomId: '', agreedRate: '', rateReason: '', includeBreakfast: false })}><option value="OVERNIGHT">Nuitée(s)</option><option value="SIESTA">Sieste · durée fixe 3 h 30</option></select></label>
      <label><span>Date d’arrivée</span><input type="date" value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value, roomId: '' })} required /></label>
      {form.stayType === 'OVERNIGHT'
        ? <label><span>Date de départ</span><input type="date" value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value, roomId: '' })} required /><small>Arrivée à l’heure souhaitée ; départ à {checkOutTime ?? '12:00'} ({timezone}).</small></label>
        : <label><span>Heure prévue d’arrivée ({timezone})</span><input type="time" value={form.checkInTime} onChange={(event) => setForm({ ...form, checkInTime: event.target.value, roomId: '' })} required /><small>La durée réelle de 3 h 30 commencera au check-in, selon l’heure du serveur.</small></label>}
      <label><span>Chambre</span><select value={form.roomId} onChange={(event) => {
        const room = rooms.find((item) => item.id === event.target.value);
        setForm({ ...form, roomId: event.target.value, agreedRate: room && form.stayType === 'OVERNIGHT' ? room.nightlyRateMin : '', rateReason: '', includeBreakfast: false });
      }}><option value="">Attribuer plus tard</option>{roomCatalog.map((room) => {
        const available = availableRoomIds.has(room.id);
        const unavailableLabel = !availabilityReady ? ' · sélectionnez les dates et heures' : ' · Indisponible';
        return <option value={room.id} key={room.id} disabled={!available}>
          {room.number} · {room.category} · {form.stayType === 'SIESTA' ? 'prix convenu' : roomNightlyRateLabel(room, currency)}{available ? '' : unavailableLabel}
        </option>;
      })}</select><small>{selectedRoom ? 'Tarif exigé dès maintenant.' : 'Sans chambre : le tarif sera saisi lors de l’attribution. Les chambres indisponibles sont désactivées.'}</small>{availabilityReady && availableRoomIds.size === 0 && <small>Aucune chambre n’est disponible sur cette période.</small>}</label>
      {selectedRoom && <div className="reception-field"><span>{form.stayType === 'SIESTA' ? 'Prix convenu avec le client' : 'Tarif chambre par nuit'}</span><input type="number" min="0.01" step="0.01" value={form.agreedRate} onChange={(event) => setForm({ ...form, agreedRate: event.target.value })} required />{form.stayType === 'OVERNIGHT' && <><small>{selectedRoom.nightlyRateMin === selectedRoom.nightlyRateMax ? `Tarif chambre : ${formatMoney(selectedRoom.nightlyRateMin, currency)} par nuit.` : `Fourchette chambre : ${formatMoney(selectedRoom.nightlyRateMin, currency)} – ${formatMoney(selectedRoom.nightlyRateMax, currency)} par nuit.`}</small><span className="reception-checkbox"><input id="include-breakfast" type="checkbox" checked={form.includeBreakfast} onChange={(event) => setForm({ ...form, includeBreakfast: event.target.checked })} /><label htmlFor="include-breakfast">Ajouter le petit déjeuner (+{formatMoney(5000, currency)})</label></span>{selectedRoom.optionalMeal?.code === 'LUNCH' && <small>{selectedRoom.optionalMeal.name} facultatif : {formatMoney(selectedRoom.optionalMeal.price, currency)}, commandé séparément au restaurant.</small>}</>}{form.stayType === 'SIESTA' && <small>Le montant est défini avec le client, sans tarif fixe.</small>}</div>}
      <label><span>Adultes</span><input type="number" min={1} value={form.adults} onChange={(event) => setForm({ ...form, adults: Number(event.target.value) })} required /></label>
      <label><span>Enfants</span><input type="number" min={0} value={form.children} onChange={(event) => setForm({ ...form, children: Number(event.target.value) })} required /></label>
      <div className="reception-estimate"><span>{selectedRoom ? `Total estimé ${form.stayType === 'SIESTA' ? '· prix convenu' : `· ${nightsBetween(form.checkInDate, form.checkOutDate)} nuit(s)${form.includeBreakfast ? ' · petit déjeuner inclus' : ''}`}` : 'Hébergement · à définir à l’attribution'}</span><strong>{selectedRoom ? formatMoney(estimatedTotal, currency) : '—'}</strong></div>
      <button className="reception-button primary" disabled={!clients.length || (Boolean(selectedRoom) && Number(form.agreedRate) <= 0) || (form.stayType === 'OVERNIGHT' && !checkOutTime)}>Créer la réservation</button>
    </form>
    )}
    {rateReasonDialogOpen && selectedRoom && <div className="reception-modal-backdrop reception-rate-reason-backdrop" role="presentation"><form className="reception-modal reception-rate-reason-modal" role="dialog" aria-modal="true" aria-labelledby="reception-rate-reason-title" onSubmit={confirmSpecialRate}>
      <div className="reception-modal-head"><div className="reception-rate-reason-title"><span className="reception-rate-reason-icon"><ShieldAlert size={20} /></span><div><p>Tarif spécial · chambre {selectedRoom.number}</p><h2 id="reception-rate-reason-title">Justification requise</h2></div></div><button type="button" className="reception-icon-button" onClick={cancelSpecialRate} aria-label="Fermer"><X size={18} /></button></div>
      <div className="reception-rate-reason-summary"><div><span>Tarif saisi</span><strong>{formatMoney(form.agreedRate, currency)}</strong></div><div><span>Tarif autorisé</span><strong>{roomNightlyRateLabel(selectedRoom, currency)}</strong></div></div>
      <p className="reception-rate-reason-copy">Ce montant sort de la fourchette chambre autorisée. Indiquez le motif de cette dérogation pour poursuivre la création de la réservation.{selectedRoom.optionalMeal && ` Le ${selectedRoom.optionalMeal.name.toLowerCase()} facultatif (${formatMoney(selectedRoom.optionalMeal.price, currency)}) se commande séparément au restaurant.`}</p>
      <label className="reception-rate-reason-field"><span>Motif de la dérogation</span><input type="text" maxLength={500} value={form.rateReason} onChange={(event) => setForm({ ...form, rateReason: event.target.value })} required autoFocus placeholder="Ex. accord exceptionnel avec le client" /></label>
      <div className="reception-modal-actions"><button type="button" className="reception-button" onClick={cancelSpecialRate}>Annuler</button><button type="submit" className="reception-button primary" disabled={!form.rateReason.trim()}>Justifier et créer</button></div>
    </form></div>}
    {availabilityError && <div className="reception-alert is-error" role="alert">{availabilityError}</div>}

    <div className="reception-period-filter" role="group" aria-label="Filtres des réservations">
      <span>Filtres :</span>
      <button type="button" className={`reception-chip${!filters.status && filters.period === 'all' ? ' is-active' : ''}`} onClick={() => setFilters({ status: '', period: 'all' })}>Toutes</button>
      <button type="button" className={`reception-chip${filters.status === 'PENDING' ? ' is-active' : ''}`} onClick={() => setFilters({ status: 'PENDING', period: 'all' })}>En attente</button>
      <button type="button" className={`reception-chip${filters.status === 'CONFIRMED' ? ' is-active' : ''}`} onClick={() => setFilters({ status: 'CONFIRMED', period: 'all' })}>Confirmées</button>
      <button type="button" className={`reception-chip${filters.status === 'CANCELLED' ? ' is-active' : ''}`} onClick={() => setFilters({ status: 'CANCELLED', period: 'all' })}>Annulées</button>
      <button type="button" className={`reception-chip${filters.period === 'upcoming' ? ' is-active' : ''}`} onClick={() => setFilters({ status: '', period: 'upcoming' })}>À venir</button>
      <button type="button" className={`reception-chip${filters.period === 'inhouse' ? ' is-active' : ''}`} onClick={() => setFilters({ status: '', period: 'inhouse' })}>En séjour</button>
      <button type="button" className={`reception-chip${filters.period === 'past' ? ' is-active' : ''}`} onClick={() => setFilters({ status: '', period: 'past' })}>Passées</button>
    </div>
    <form className="reception-search-row" onSubmit={submitSearch}>
      <div className="reception-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Référence, client, téléphone ou chambre" /><button className="reception-button" type="submit">Rechercher</button></div>
      <span>{data.length} réservation(s) affichée(s)</span>
    </form>

    <div className="reception-panel reception-table-panel">
      <div className="reception-panel-heading"><div><p>Réservations et séjours</p><h2>Suivi des clients</h2></div></div>
      {data.length ? <div className="reception-table-wrap"><table className="reception-table">
        <thead><tr><th>Référence / client / créateur</th><th>Dates / chambre</th><th>Statut</th><th>Facturé / encaissé / dû</th><th>Actions</th></tr></thead>
        <tbody>{data.map((reservation) => <tr key={reservation.id}>
          <td><strong>{reservation.reference}</strong><small>{reservation.client.name}{reservation.client.phone ? ` · ${reservation.client.phone}` : ''}</small><small>{reservation.stayType === 'SIESTA' ? 'Sieste · durée fixe 3 h 30' : 'Nuitée'}</small>{reservation.rateReason && <small>Tarif spécial : {reservation.rateReason}</small>}<small>Créée par {reservation.createdByName ?? '—'} · {formatDateTime(reservation.createdAt, timezone)}</small></td>
          <td>{formatDate(reservation.checkInDate)} – {formatDate(reservation.checkOutDate)}<small>{reservation.room ? `Ch. ${reservation.room.number} · ${reservation.room.category}` : 'Chambre à attribuer'}</small>{reservation.stay?.checkedInAt && <small>Arrivée réelle : {formatDateTime(reservation.stay.checkedInAt, timezone)}{reservation.stay.checkInRecordedAt && reservation.stay.checkInRecordedAt !== reservation.stay.checkedInAt ? ` · saisie ${formatDateTime(reservation.stay.checkInRecordedAt, timezone)}` : ''}</small>}{reservation.stay?.expectedCheckOutAt && <small>Fin prévue : {formatDateTime(reservation.stay.expectedCheckOutAt, timezone)}</small>}</td>
          <td><StatusBadge value={reservation.status} /></td>
          <td><strong>{formatMoney(reservation.folio?.billed ?? reservation.totalAmount, currency)}</strong><small>Encaissé {formatMoney(reservation.folio?.paid ?? '0', currency)} · Dû {formatMoney(reservation.folio?.balance ?? reservation.totalAmount, currency)}</small></td>
          <td><div className="reception-row-actions">
            {reservation.folio && can('folios.view') && <button className="reception-button" onClick={() => openFolio(reservation)}>Folio</button>}
            {reservation.status === 'CHECKED_IN' && can('reservations.update') && <button className="reception-button" onClick={() => move(reservation)}>Changer ch.</button>}
            {!reservation.room && ['PENDING', 'CONFIRMED'].includes(reservation.status) && can('reservations.update') && <button className="reception-button primary" onClick={() => assignRoom(reservation)}>Attribuer ch.</button>}
            {reservation.room && reservation.stayType === 'OVERNIGHT' && ['PENDING', 'CONFIRMED'].includes(reservation.status) && can('reservations.update') && <button className="reception-button" onClick={() => edit(reservation)}>Modifier</button>}
            {reservation.status === 'PENDING' && <>{can('reservations.confirm') && <button className="reception-button" onClick={() => confirm(reservation)}>Confirmer</button>}{can('reservations.cancel') && <button className="reception-button danger" onClick={() => cancel(reservation)}>Annuler</button>}</>}
            {reservation.status === 'CONFIRMED' && <>{can('stays.checkin') && reservation.room && <button className="reception-button primary" onClick={() => checkIn(reservation)}>Check-in</button>}{can('reservations.cancel') && <button className="reception-button danger" onClick={() => cancel(reservation)}>Annuler</button>}</>}
            {reservation.status === 'CHECKED_IN' && <>{can('stays.extend') && <button className="reception-button" onClick={() => occupants(reservation)}>Occupants</button>}{reservation.stayType === 'OVERNIGHT' && can('stays.extend') && <button className="reception-button" onClick={() => extend(reservation)}>Prolonger</button>}{can('stays.checkout') && <button className="reception-button primary" onClick={() => checkOut(reservation)}>Check-out</button>}</>}
            <button className="reception-button" onClick={() => history(reservation)}>Historique</button>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState text="Aucune réservation ne correspond à la recherche." />}
    </div>
  </>;
}

function ClientsSection({ data, form, setForm, idScan, setIdScan, search, setSearch, submitSearch, create, openDetail, edit, canEdit, canCreate, timezone }: {
  data: Client[];
  form: { name: string; phone: string; email: string; nationality: string; address: string; idType: string; idNumber: string; notes: string };
  setForm: (value: { name: string; phone: string; email: string; nationality: string; address: string; idType: string; idNumber: string; notes: string }) => void;
  idScan: File | null;
  setIdScan: (file: File | null) => void;
  search: string;
  setSearch: (value: string) => void;
  submitSearch: (event: FormEvent<HTMLFormElement>) => void;
  create: (event: FormEvent<HTMLFormElement>) => void;
  openDetail: (client: Client) => void;
  edit: (client: Client) => void;
  canEdit: boolean;
  canCreate: boolean;
  timezone: string;
}) {
  const idTypes = ['', 'Carte nationale d’identité', 'Passeport', 'Carte de séjour', 'Autre'];
  return <>
    {canCreate && (
    <form className="reception-client-form" onSubmit={create}><div className="reception-form-title"><div><p>Fiche client</p><h2>Créer un client</h2></div><span className="reception-note">Le créateur de la fiche est enregistré définitivement.</span></div><label><span>Nom complet</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required /></label><label><span>Téléphone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={40} autoComplete="tel" /></label><label><span>E-mail</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={191} autoComplete="email" /></label><label><span>Nationalité</span><input value={form.nationality} onChange={(event) => setForm({ ...form, nationality: event.target.value })} maxLength={80} /></label><label><span>Adresse</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={255} /></label><label><span>Type de pièce d’identité</span><select value={form.idType} onChange={(event) => setForm({ ...form, idType: event.target.value })}>{idTypes.map((type) => <option value={type} key={type || 'none'}>{type || 'Non renseignée'}</option>)}</select></label><label><span>Numéro de pièce d’identité</span><input value={form.idNumber} onChange={(event) => setForm({ ...form, idNumber: event.target.value })} maxLength={80} /></label><label className="is-wide"><span>Scan de la pièce d’identité</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setIdScan(event.target.files?.[0] ?? null)} /><small>{idScan ? `Fichier sélectionné : ${idScan.name}` : 'Photo ou scan · JPEG, PNG, WebP ou PDF · 5 Mo max. Consigné avec le nom du réceptionniste.'}</small></label><label className="is-wide"><span>Informations complémentaires</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} rows={2} /></label><button className="reception-button primary"><Plus size={15} />Enregistrer le client</button></form>
    )}
    <form className="reception-search-row" onSubmit={submitSearch}><div className="reception-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, téléphone, e-mail, pièce d’identité ou référence" /><button type="submit" className="reception-button">Rechercher</button></div><span>{data.length} fiche(s)</span></form>
    <div className="reception-panel reception-table-panel"><div className="reception-panel-heading"><div><p>Établissement actif</p><h2>Clients</h2></div></div>{data.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Client</th><th>Contact</th><th>Créé par</th><th>Séjours</th><th></th></tr></thead><tbody>{data.map((client) => <tr key={client.id}><td><strong>{client.name}</strong>{client.idNumber ? <small>Pièce : {client.idType ?? '—'} · {client.idNumber}</small> : null}{client.idDocumentName ? <small>Scan de la pièce enregistré</small> : <small className="is-missing">Scan de la pièce manquant</small>}</td><td>{client.phone ?? '—'}<small>{client.email ?? ''}</small></td><td>{client.createdByName ?? client.creator?.name ?? 'Historique non attribué'}<small>{client.createdAt ? formatDateTime(client.createdAt, timezone) : ''}</small></td><td>{client._count?.reservations ?? 0}</td><td><div className="reception-row-actions"><button className="reception-button" onClick={() => openDetail(client)}>Historique</button>{canEdit && <button className="reception-button" onClick={() => edit(client)}>Modifier</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState text="Aucun client enregistré dans cet établissement." />}</div>
  </>;
}

function FolioSection({ data, payerName, setPayerName, currency, timezone, methods, cashOpen, service, setService, addService, issueInvoice, printInvoice, payment, setPayment, collect, openReservations }: {
  data: Folio | null;
  payerName: string;
  setPayerName: (value: string) => void;
  currency: string;
  timezone: string;
  methods: PaymentMethod[];
  cashOpen: boolean;
  service: { description: string; amount: string };
  setService: (value: { description: string; amount: string }) => void;
  addService: (event: FormEvent<HTMLFormElement>) => void;
  issueInvoice: () => void;
  printInvoice: () => void;
  payment: { paymentMethodId: string; amount: string; reference: string };
  setPayment: (value: { paymentMethodId: string; amount: string; reference: string }) => void;
  collect: (event: FormEvent<HTMLFormElement>) => void;
  openReservations: () => void;
}) {
  if (!data) return <div className="reception-panel"><EmptyState text="Sélectionnez une réservation pour ouvrir son folio." /><button className="reception-button primary" onClick={openReservations}>Voir les réservations</button></div>;
  const billedAmount = Number(data.billed);
  const paidAmount = Number(data.paid);
  const balanceAmount = Number(data.balance);
  const paymentStage = billedAmount <= 0 ? 'waiting' : balanceAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';
  const paymentStageLabel = paymentStage === 'paid' ? 'Soldé' : paymentStage === 'partial' ? 'Partiellement réglé' : paymentStage === 'unpaid' ? 'Impayé' : 'En attente';
  const paymentStageDetail = paymentStage === 'waiting'
    ? 'En attente des dépenses'
    : paymentStage === 'paid'
      ? 'Aucun solde restant'
      : paymentStage === 'partial'
        ? `${formatMoney(data.balance, currency)} restent à payer`
        : data.invoice
          ? `${formatMoney(data.balance, currency)} restent à payer`
          : `Impayé · facture à produire · ${formatMoney(data.balance, currency)} dus`;
  return <>
    <div className="reception-folio-heading"><div><p>Folio · {data.reservation.reference}</p><h2>{data.reservation.client.name} · {data.reservation.room ? `chambre ${data.reservation.room}` : 'chambre à attribuer'}</h2><span>{data.reservation.stayType === 'SIESTA' ? 'Sieste · durée fixe 3 h 30' : `${nightsBetween(data.reservation.checkInDate, data.reservation.checkOutDate)} nuitée(s)`} · {formatDate(data.reservation.checkInDate)} – {formatDate(data.reservation.checkOutDate)}</span></div><StatusBadge value={data.status} /></div>
    <div className="reception-folio-totals"><div><span>Facturé</span><strong>{formatMoney(data.billed, currency)}</strong></div><div><span>Encaissé</span><strong>{formatMoney(data.paid, currency)}</strong></div><div className="is-due"><span>Reste dû</span><strong>{formatMoney(data.balance, currency)}</strong></div></div>
    <section className="reception-folio-progress" aria-label="Cheminement de facturation et de paiement">
      <article className={billedAmount > 0 ? 'is-complete' : 'is-waiting'}><span>ÉTAPE 1</span><strong>Dépenses enregistrées</strong><small>{billedAmount > 0 ? `${formatMoney(data.billed, currency)} au folio` : 'En attente de dépenses'}</small></article>
      <article className={data.invoice ? 'is-complete' : billedAmount > 0 ? 'is-current' : 'is-waiting'}><span>ÉTAPE 2</span><strong>Production de la facture</strong><small>{data.invoice ? `${data.invoice.number} · émise` : billedAmount > 0 ? 'À produire depuis le folio' : 'En attente de dépenses'}</small></article>
      <article className={`is-${paymentStage}`}><span>ÉTAPE 3</span><strong>{paymentStageLabel}</strong><small>{paymentStageDetail}</small></article>
    </section>
    <div className="reception-overview-grid">
      <section className="reception-panel"><div className="reception-panel-heading"><div><p>Pièces du séjour</p><h2>Lignes du folio</h2></div><FileText size={18} /></div>{data.lines.length ? <div className="reception-folio-lines">{data.lines.map((line) => <div key={line.id}><span>{line.description}<small>{line.type === 'ACCOMMODATION' ? 'Hébergement' : 'Prestation'}</small></span><strong>{formatMoney(line.amount, currency)}</strong></div>)}</div> : <EmptyState text="Aucune ligne sur ce folio." />}{data.invoice ? <div className="reception-invoice-chip"><FileText size={15} />Facture {data.invoice.number} · {formatMoney(data.invoice.totalAmount, currency)}<small>Payeur : {data.invoice.payerName ?? data.reservation.client.name}</small><small>Émise le {formatDateTime(data.invoice.issuedAt, timezone)}</small><small>Moyen(s) de paiement : {paymentMethodNames(data.payments).join(', ') || 'Aucun règlement enregistré'}</small><button className="reception-button" onClick={printInvoice}>Imprimer sur rouleau 80 mm</button></div> : <div className="reception-operation-form"><label><span>Nom du payeur sur la facture</span><input value={payerName} onChange={(event) => setPayerName(event.target.value)} minLength={2} maxLength={160} required /></label><button className="reception-button" disabled={data.status !== 'OPEN'} onClick={issueInvoice}>Créer la facture</button></div>}</section>
      <section className="reception-panel"><div className="reception-panel-heading"><div><p>Encaissements</p><h2>Historique des paiements</h2></div><CreditCard size={18} /></div>{data.payments.length ? <div className="reception-folio-lines">{data.payments.map((item) => <div key={item.id}><span>{item.method}<small>{formatDateTime(item.createdAt, timezone)}{item.reference ? ` · ${item.reference}` : ''}</small></span><strong>{formatMoney(item.amount, currency)}</strong></div>)}</div> : <EmptyState text="Aucun paiement enregistré." />}</section>
    </div>
    <div className="reception-overview-grid">
      {data.status === 'OPEN' && !data.invoice && <form className="reception-panel reception-operation-form" onSubmit={addService}><div className="reception-panel-heading"><div><p>Prestation autorisée</p><h2>Ajouter au folio</h2></div><Plus size={18} /></div><label><span>Libellé</span><input value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} minLength={2} maxLength={200} required /></label><label><span>Montant ({currency})</span><input type="number" value={service.amount} onChange={(event) => setService({ ...service, amount: event.target.value })} min="0.01" step="0.01" max="99999999.99" required /></label><button className="reception-button primary">Ajouter la prestation</button></form>}
      {data.status === 'OPEN' && data.balance !== '0.00' && <form className="reception-panel reception-operation-form" onSubmit={collect}><div className="reception-panel-heading"><div><p>Session de caisse</p><h2>Encaisser un paiement</h2></div><Wallet size={18} /></div>{!cashOpen && <p className="reception-note">Ouvrez d’abord votre caisse personnelle.</p>}{methods.length === 0 && <p className="reception-note">Aucun moyen de paiement actif pour cet établissement.</p>}<label><span>Montant à encaisser · solde {formatMoney(data.balance, currency)}</span><input type="number" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} min="0.01" step="0.01" max={data.balance} required /></label><label><span>Moyen de paiement</span><select value={payment.paymentMethodId} onChange={(event) => setPayment({ ...payment, paymentMethodId: event.target.value })} required><option value="">Choisir…</option>{methods.map((method) => <option value={method.id} key={method.id}>{method.name}</option>)}</select></label><label><span>Référence de transaction (facultative)</span><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} maxLength={100} /></label><button className="reception-button primary" disabled={!cashOpen || !methods.length}>Confirmer l’encaissement</button></form>}
    </div>
  </>;
}

function PlanningSection({ data, permissions, currency, from, to, setPlanner, updateRoomAvailability, search }: { data: Room[]; permissions: string[]; currency: string; from: string; to: string; setPlanner: (value: { from: string; to: string }) => void; updateRoomAvailability: (room: Room) => void; search: () => void }) {
  const days = daysBetween(from, to);
  const canBlockRooms = permissions.includes('rooms.block');
  const canReleaseRooms = permissions.includes('rooms.release');
  return <>
    <form className="reception-search-row" onSubmit={(event) => { event.preventDefault(); search(); }}>
      <label><span>Du</span><input type="date" value={from} onChange={(event) => setPlanner({ from: event.target.value, to })} required /></label>
      <label><span>Au (exclu)</span><input type="date" value={to} onChange={(event) => setPlanner({ from, to: event.target.value })} required /></label>
      <button className="reception-button primary">Afficher la période</button>
      <span>Réservations persistées · aucun calendrier fictif</span>
    </form>
    <div className="reception-panel reception-table-panel">
      <div className="reception-panel-heading"><div><p>Inventaire de l’établissement</p><h2>Planning des chambres <small>{data.length}</small></h2></div></div>
      {data.some((room) => room.hasOpenHousekeepingTask || room.status === 'OUT_OF_SERVICE' || room.technicalStatus !== 'OPERATIONAL') && (
        <div className="reception-note" role="status">
          <strong>Chambres indisponibles et motifs :</strong>{' '}
          {data.filter((room) => room.hasOpenHousekeepingTask || room.status === 'OUT_OF_SERVICE' || room.technicalStatus !== 'OPERATIONAL').map((room) => `${room.number} (${roomAvailabilityLabel(room)})`).join(' · ')}
        </div>
      )}
      {data.length && days.length ? <div className="reception-planner-wrap"><table className="reception-planner-table">
        <thead><tr><th>Chambre</th>{days.map((day) => <th key={day}><span>{new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(new Date(`${day}T12:00:00`))}</span><strong>{day.slice(8, 10)}/{day.slice(5, 7)}</strong></th>)}</tr></thead>
        <tbody>{data.map((room) => <tr key={room.id}>
          <th scope="row"><strong>{room.number}</strong><small>{room.category} · {roomAvailabilityLabel(room)}</small>{room.currentGuest && <><small>Client en séjour : {room.currentGuest}</small><span className={`reception-room-debt${room.restaurantBilled > 0 ? ' has-debt' : ''}`}><b>Consommations restaurant</b><small>Imputées : {formatMoney(room.restaurantBilled, currency)}</small><small>Solde du séjour : {formatMoney(room.folioBalance, currency)}</small></span></>}
            {room.receptionistBlocked
              ? canReleaseRooms && <button className="reception-button" onClick={() => updateRoomAvailability(room)}>Remettre à disposition</button>
              : room.status !== 'OUT_OF_SERVICE' && room.technicalStatus === 'OPERATIONAL' && canBlockRooms && <button className="reception-button danger" disabled={room.status === 'OCCUPIED'} onClick={() => updateRoomAvailability(room)}>Rendre indisponible</button>}
          </th>
          {days.map((day) => {
            const reservation = room.reservations.find((item) => item.checkInDate <= day && item.checkOutDate > day);
            const starts = reservation?.checkInDate === day;
            const cellStatus = reservation ? statusLabel(reservation.status) : roomAvailabilityLabel(room);
            return <td key={day}><div className={`reception-planner-cell${reservation ? ` is-booked status-${reservation.status.toLowerCase()}` : ''}${starts ? ' is-start' : ''}`} title={reservation ? `${reservation.reference} · ${statusLabel(reservation.status)} · ${reservation.checkInDate} – ${reservation.checkOutDate}` : `${room.number} · ${day} · ${cellStatus}`} aria-label={reservation ? `${room.number}, ${day}, ${reservation.reference}, ${statusLabel(reservation.status)}` : `${room.number}, ${day}, ${cellStatus}`}>{starts ? reservation.reference : reservation && day === reservation.checkInDate ? 'Arrivée' : ''}</div></td>;
          })}
        </tr>)}</tbody>
      </table></div> : <EmptyState text={!data.length ? 'Aucune chambre n’est configurée pour cet établissement.' : 'Choisissez une période valide pour afficher le planning.'} />}
    </div>
  </>;
}

function ReservationEditDialog({ data, form, setForm, clients, rooms, currency, close, submit }: {
  data: EditingReservation;
  form: ReservationEditForm;
  setForm: (value: ReservationEditForm) => void;
  clients: Client[];
  rooms: Room[];
  currency: string;
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { reservation, mode } = data;
  const titles = {
    update: 'Modifier la réservation',
    extend: 'Prolonger le séjour',
    occupants: 'Gérer les occupants',
    'assign-room': 'Attribuer une chambre',
  };
  const selectedRoom = rooms.find((room) => room.id === form.roomId) ?? null;
  const roomAvailable = Boolean(selectedRoom) || Boolean(form.roomId && reservation.room?.id === form.roomId);
  const outsideRateRange = Boolean(
    (mode === 'update' || mode === 'assign-room')
    && reservation.stayType === 'OVERNIGHT'
    && selectedRoom
    && form.agreedRate
    && isRateOutsideRange(form.agreedRate, selectedRoom.nightlyRateMin, selectedRoom.nightlyRateMax),
  );
  return <div className="reception-modal-backdrop" role="presentation"><form className="reception-modal reception-edit-modal" role="dialog" aria-modal="true" aria-labelledby="reception-edit-title" onSubmit={submit}><div className="reception-modal-head"><div><p>{reservation.reference} · {reservation.room ? `chambre ${reservation.room.number}` : 'sans chambre'}</p><h2 id="reception-edit-title">{titles[mode]}</h2></div><button type="button" className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button></div>
    {mode === 'update' && <>
      <label><span>Client</span><select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} required>{!clients.some((item) => item.id === reservation.client.id) && <option value={reservation.client.id}>{reservation.client.name}</option>}{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
      <div className="reception-edit-dates"><label><span>Arrivée</span><input type="date" value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value })} required /></label><label><span>Départ</span><input type="date" value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })} required /></label></div>
      <label><span>Chambre disponible sur la période</span><select value={form.roomId} onChange={(event) => {
        const room = rooms.find((item) => item.id === event.target.value);
        setForm({ ...form, roomId: event.target.value, agreedRate: room && reservation.stayType === 'OVERNIGHT' ? room.nightlyRateMin : form.agreedRate, rateReason: '' });
      }} required><option value="">Choisir une chambre</option>{reservation.room && !rooms.some((room) => room.id === reservation.room!.id) && <option value={reservation.room.id}>Chambre {reservation.room.number} · sélection actuelle</option>}{rooms.map((room) => <option value={room.id} key={room.id}>{room.number} · {room.category}</option>)}</select>{!roomAvailable && <small>La chambre actuelle n’est pas validée comme disponible pour les nouvelles dates.</small>}</label>
    </>}
    {mode === 'assign-room' && <>
      <label><span>Chambre disponible</span><select value={form.roomId} onChange={(event) => {
        const room = rooms.find((item) => item.id === event.target.value);
        setForm({ ...form, roomId: event.target.value, agreedRate: room && reservation.stayType === 'OVERNIGHT' ? room.nightlyRateMin : '', rateReason: '' });
      }} required><option value="">Choisir une chambre</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.number} · {room.category}{reservation.stayType === 'OVERNIGHT' ? ` · ${roomNightlyRateLabel(room, currency)}` : ''}</option>)}</select></label>
      <label><span>{reservation.stayType === 'SIESTA' ? 'Prix convenu' : 'Tarif chambre par nuit'}</span><input type="number" min="0.01" step="0.01" value={form.agreedRate} onChange={(event) => setForm({ ...form, agreedRate: event.target.value })} required /><small>{reservation.stayType === 'SIESTA' ? 'Montant total de la sieste.' : selectedRoom ? `Tarif chambre : ${roomNightlyRateLabel(selectedRoom, currency)}${selectedRoom.optionalMeal ? `. ${selectedRoom.optionalMeal.name} en option : ${formatMoney(selectedRoom.optionalMeal.price, currency)}.` : ''}` : 'Le tarif sera appliqué au folio.'}</small></label>
    </>}
    {(mode === 'update' || mode === 'assign-room') && reservation.stayType === 'OVERNIGHT' && <label><span>Justification du tarif spécial</span><input type="text" maxLength={500} value={form.rateReason} onChange={(event) => setForm({ ...form, rateReason: event.target.value })} required={outsideRateRange} placeholder="À renseigner si le tarif sort de la fourchette" /></label>}
    {mode !== 'extend' && <div className="reception-edit-dates"><label><span>Adultes</span><input type="number" min={1} value={form.adults} onChange={(event) => setForm({ ...form, adults: Number(event.target.value) })} required /></label><label><span>Enfants</span><input type="number" min={0} value={form.children} onChange={(event) => setForm({ ...form, children: Number(event.target.value) })} required /></label></div>}
    {mode === 'extend' && <label><span>Nouvelle date de départ</span><input type="date" min={reservation.checkOutDate} value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })} required /><small>L’hébergement supplémentaire sera ajouté au folio au tarif déjà appliqué.</small></label>}
    <div className="reception-modal-actions"><button type="button" className="reception-button" onClick={close}>Annuler</button><button className="reception-button primary" disabled={(mode === 'assign-room' || mode === 'update') && (!form.roomId || (mode === 'assign-room' && Number(form.agreedRate) <= 0))}>{mode === 'extend' ? 'Prolonger le séjour' : mode === 'occupants' ? 'Enregistrer les occupants' : mode === 'assign-room' ? 'Attribuer la chambre' : 'Enregistrer les modifications'}</button></div>
  </form></div>;
}

function CashSection({
  sessions,
  current,
  reports,
  openingAmount,
  setOpeningAmount,
  countedAmount,
  setCountedAmount,
  shiftType,
  setShiftType,
  expenses,
  setExpenses,
  incidentNotes,
  setIncidentNotes,
  handoverNotes,
  setHandoverNotes,
  paymentMethods,
  open,
  close,
  viewReport,
  currency,
  timezone,
}: {
  sessions: CashSession[];
  current: Overview['cashSession'];
  reports: ShiftReport[];
  openingAmount: string;
  setOpeningAmount: (value: string) => void;
  countedAmount: string;
  setCountedAmount: (value: string) => void;
  shiftType: ShiftReport['shiftType'];
  setShiftType: (value: ShiftReport['shiftType']) => void;
  expenses: ShiftExpenseDraft[];
  setExpenses: (value: ShiftExpenseDraft[]) => void;
  incidentNotes: string;
  setIncidentNotes: (value: string) => void;
  handoverNotes: string;
  setHandoverNotes: (value: string) => void;
  paymentMethods: PaymentMethod[];
  open: (event: FormEvent<HTMLFormElement>) => void;
  close: (session: CashSession, report: ShiftReportCloseInput) => void;
  viewReport: (report: ShiftReport) => void;
  currency: string;
  timezone: string;
}) {
  const currentSession = sessions.find((session) => session.status === 'OPEN') ?? null;
  const cashMethod = paymentMethods.find((method) => method.code === 'CASH');
  const cashExpenses = expenses
    .filter((expense) => paymentMethods.find((method) => method.id === expense.paymentMethodId)?.code === 'CASH')
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const cashReceived = currentSession?.paymentsByMethod.find((method) => method.code === 'CASH')?.amount ?? '0.00';
  const expectedCashAfterExpenses = currentSession
    ? Number(currentSession.openingAmount) + Number(cashReceived) - cashExpenses
    : 0;
  function addExpense() {
    if (!paymentMethods.length) return;
    setExpenses([...expenses, {
      id: crypto.randomUUID(),
      description: '',
      amount: '',
      paymentMethodId: cashMethod?.id ?? paymentMethods[0].id,
    }]);
  }
  function updateExpense(id: string, patch: Partial<ShiftExpenseDraft>) {
    setExpenses(expenses.map((expense) => expense.id === id ? { ...expense, ...patch } : expense));
  }

  return <>
    {!current ? <form className="reception-cash-open reception-panel" onSubmit={open}><div><p>Session personnelle</p><h2>Ouvrir ma caisse</h2><small>Une seule session ouverte par réceptionniste et établissement.</small></div><label><span>Fonds initial ({currency})</span><input type="number" min="0" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} required /></label><button className="reception-button primary">Ouvrir la session</button></form> : <section className="reception-panel reception-cash-current">
      <div className="reception-panel-heading"><div><p>Session ouverte depuis {formatDateTime(current.openedAt, timezone)}</p><h2>Votre caisse</h2></div><StatusBadge value="OPEN" /></div>
      <div className="reception-folio-totals"><div><span>Fonds initial</span><strong>{formatMoney(current.openingAmount, currency)}</strong></div><div><span>Espèces disponibles</span><strong>{formatMoney(currentSession ? Number(currentSession.openingAmount) + Number(cashReceived) : Number(current.openingAmount), currency)}</strong></div><div><span>Total des règlements</span><strong>{formatMoney(currentSession?.paymentsByMethod.reduce((sum, method) => sum + Number(method.amount), 0) ?? 0, currency)}</strong></div></div>
      <div className="reception-cash-methods">{currentSession?.paymentsByMethod.map((method) => <div key={method.code}><span>{method.name}</span><strong>{formatMoney(method.amount, currency)}</strong></div>)}</div>
      <form className="reception-close-form reception-shift-close-form" onSubmit={(event) => {
        event.preventDefault();
        if (currentSession) close(currentSession, {
          shiftType,
          incidentNotes,
          handoverNotes,
          expenses: expenses.map(({ description, amount, paymentMethodId }) => ({ description, amount, paymentMethodId })),
        });
      }}>
        <div className="reception-shift-report-intro">
          <div><p>Rapport obligatoire de fin de service</p><h3>Clôture et passation</h3></div>
          <small>Le rapport inclura automatiquement vos opérations, les encaissements, l’état des chambres et les folios ouverts. Les dépenses en espèces réduisent le théorique de caisse.</small>
        </div>
        <div className="reception-shift-close-fields">
          <label><span>Service</span><select value={shiftType} onChange={(event) => setShiftType(event.target.value === 'NIGHT' ? 'NIGHT' : 'DAY')} required><option value="DAY">Jour · 08 h–18 h</option><option value="NIGHT">Nuit · 18 h–08 h</option></select></label>
          <label><span>Espèces comptées ({currency})</span><input type="number" min="0" step="0.01" value={countedAmount} onChange={(event) => setCountedAmount(event.target.value)} required /></label>
          <div className="reception-shift-cash-preview"><span>Théorique après dépenses saisies</span><strong>{formatMoney(expectedCashAfterExpenses, currency)}</strong></div>
        </div>
        <div className="reception-shift-expenses">
          <div className="reception-shift-subheading"><div><strong>Dépenses du service</strong><small>Chaque ligne sera intégrée au rapport comptable.</small></div><button type="button" className="reception-button" onClick={addExpense} disabled={!paymentMethods.length}><Plus size={14} /> Ajouter une dépense</button></div>
          {expenses.map((expense) => <div className="reception-shift-expense-row" key={expense.id}>
            <label><span>Désignation</span><input value={expense.description} onChange={(event) => updateExpense(expense.id, { description: event.target.value })} minLength={2} maxLength={200} required /></label>
            <label><span>Montant ({currency})</span><input type="number" value={expense.amount} onChange={(event) => updateExpense(expense.id, { amount: event.target.value })} min="0.01" step="0.01" max="99999999.99" required /></label>
            <label><span>Payée par</span><select value={expense.paymentMethodId} onChange={(event) => updateExpense(expense.id, { paymentMethodId: event.target.value })} required><option value="">Choisir…</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
            <button type="button" className="reception-button danger" onClick={() => setExpenses(expenses.filter((item) => item.id !== expense.id))}>Retirer</button>
          </div>)}
          {!paymentMethods.length && <p className="reception-note">Aucun moyen de paiement actif : configurez-en un avant de saisir des dépenses.</p>}
        </div>
        <label className="reception-shift-notes"><span>Incidents et observations</span><textarea value={incidentNotes} onChange={(event) => setIncidentNotes(event.target.value)} maxLength={2000} rows={3} /></label>
        <label className="reception-shift-notes"><span>Consignes à la relève</span><textarea value={handoverNotes} onChange={(event) => setHandoverNotes(event.target.value)} maxLength={2000} rows={3} /></label>
        <button className="reception-button danger" disabled={!currentSession}>Clôturer la caisse et enregistrer le rapport</button>
      </form>
    </section>}
    <div className="reception-panel reception-table-panel"><div className="reception-panel-heading"><div><p>Session ouverte</p><h2>Transactions de ma caisse</h2></div><CreditCard size={18} /></div>{currentSession && currentSession.transactions.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Date</th><th>Réservation</th><th>Client</th><th>Moyen</th><th>Libellé / réf.</th><th>Montant</th></tr></thead><tbody>{currentSession.transactions.map((payment) => <tr key={payment.id}><td>{formatDateTime(payment.createdAt, timezone)}</td><td>{payment.reservationReference ?? 'Paiement direct'}</td><td>{payment.clientName ?? '—'}</td><td>{payment.method}</td><td>{payment.description || payment.reference || '—'}</td><td><strong>{formatMoney(payment.amount, currency)}</strong></td></tr>)}</tbody></table></div> : <EmptyState text={currentSession ? 'Aucune transaction sur cette session.' : 'Aucune session ouverte.'} />}<p className="reception-note">Aucune transaction validée ne peut être modifiée ni supprimée ; les corrections passent par une opération autorisée et journalisée.</p></div>
    <div className="reception-panel reception-table-panel"><div className="reception-panel-heading"><div><p>Historique personnel</p><h2>Rapports de service</h2></div></div>{reports.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Service</th><th>Période</th><th>Réceptionniste</th><th>Écart de caisse</th><th></th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.shiftType === 'DAY' ? 'Jour' : 'Nuit'}</td><td>{formatDateTime(report.startedAt, timezone)} – {formatDateTime(report.endedAt, timezone)}</td><td>{report.user.name}</td><td>{formatMoney(report.summary.cash.variance, currency)}</td><td><button className="reception-button" type="button" onClick={() => viewReport(report)}>Voir / PDF</button></td></tr>)}</tbody></table></div> : <EmptyState text="Aucun rapport de service enregistré." />}</div>
    <div className="reception-panel reception-table-panel"><div className="reception-panel-heading"><div><p>Historique personnel</p><h2>Sessions précédentes</h2></div></div>{sessions.filter((session) => session.status === 'CLOSED').length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Ouverture · date et heure</th><th>Fonds initial</th><th>Espèces théoriques</th><th>Comptées</th><th>Écart</th></tr></thead><tbody>{sessions.filter((session) => session.status === 'CLOSED').map((session) => <tr key={session.id}><td>{formatDateTime(session.openedAt, timezone)}</td><td>{formatMoney(session.openingAmount, currency)}</td><td>{formatMoney(session.expectedCash, currency)}</td><td>{session.countedAmount ? formatMoney(session.countedAmount, currency) : '—'}</td><td className={session.variance && session.variance !== '0.00' ? 'is-variance' : ''}>{session.variance ? formatMoney(session.variance, currency) : formatMoney(0, currency)}</td></tr>)}</tbody></table></div> : <EmptyState text="Aucune session clôturée." />}</div>
  </>;
}

function ClientDialog({ data, close, currency, timezone }: { data: { client: Client; reservations: Record<string, unknown>[] }; close: () => void; currency: string; timezone: string }) {
  const { client } = data;
  return <div className="reception-modal-backdrop" role="presentation"><section className="reception-modal" role="dialog" aria-modal="true" aria-labelledby="reception-client-title"><div className="reception-modal-head"><div><p>Fiche client</p><h2 id="reception-client-title">{client.name}</h2></div><button className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button></div>
    <dl className="reception-client-facts">
      <div><dt>Téléphone</dt><dd>{client.phone ?? 'Non renseigné'}</dd></div>
      <div><dt>E-mail</dt><dd>{client.email ?? 'Non renseigné'}</dd></div>
      <div><dt>Nationalité</dt><dd>{client.nationality ?? 'Non renseignée'}</dd></div>
      <div><dt>Adresse</dt><dd>{client.address ?? 'Non renseignée'}</dd></div>
      <div><dt>Pièce d’identité</dt><dd>{client.idType ?? 'Non renseignée'}{client.idNumber ? ` · ${client.idNumber}` : ''}</dd></div>
      <div><dt>Scan de la pièce</dt><dd>{client.idDocument ? <a className="reception-scan-link" href={`/api/reception/clients/${client.id}/document`} target="_blank" rel="noreferrer">Ouvrir le scan · {client.idDocument.name}</a> : 'Aucun scan enregistré'}</dd>{client.idDocument?.uploadedAt && <dd className="reception-note">Déposé par {client.idDocument.uploadedBy ?? '—'} le {formatDateTime(client.idDocument.uploadedAt, timezone)}</dd>}</div>
      <div><dt>Informations</dt><dd>{client.notes ?? '—'}</dd></div>
    </dl>
    <p className="reception-creator-line">Client enregistré par : <strong>{client.createdByName ?? client.creator?.name ?? 'Historique non attribué'}</strong>{client.createdAt ? ` · ${formatDateTime(client.createdAt, timezone)}` : ''}</p>
    <h3>Historique des séjours</h3>{data.reservations.length ? <div className="reception-client-history">{data.reservations.map((reservation) => <div key={String(reservation.id)}><strong>{String(reservation.reference)}</strong><span>{formatDate(String(reservation.checkInDate))} – {formatDate(String(reservation.checkOutDate))} · {reservation.room ? `chambre ${String(reservation.room)}` : 'chambre à attribuer'}</span><small>Réservation créée par : {String(reservation.createdByName ?? '—')}{reservation.createdAt ? ` · ${formatDateTime(String(reservation.createdAt), timezone)}` : ''}</small><small>Facturé {formatMoney(String(reservation.billed), currency)} · encaissé {formatMoney(String(reservation.paid), currency)} · dû {formatMoney(String(reservation.balance), currency)}{reservation.invoiceNumber ? ` · facture ${String(reservation.invoiceNumber)}` : ''}</small></div>)}</div> : <EmptyState text="Aucun séjour passé." />}<div className="reception-modal-actions"><button className="reception-button" onClick={close}>Fermer</button></div></section></div>;
}

function ReceiptDialog({ data, close, currency, timezone }: { data: Receipt; close: () => void; currency: string; timezone: string }) {
  return <div className="reception-modal-backdrop" role="presentation"><section className="reception-modal reception-receipt" role="dialog" aria-modal="true" aria-labelledby="reception-receipt-title"><div className="reception-modal-head"><div><p>BLISS HÔTEL · Reçu de paiement</p><h2 id="reception-receipt-title">Paiement enregistré</h2></div><button className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button></div><div className="reception-receipt-body"><img className="reception-print-logo" src="/logo.png" alt="Logo Bliss Hôtel" onError={(event) => { event.currentTarget.hidden = true; }} /><strong>{data.hotel}</strong><span>Client : {data.client}</span><span>Réservation : {data.reservation}</span><span>Date et heure : {formatDateTime(data.date, timezone)}</span><span>Moyen : {data.method}</span>{data.reference && <span>Référence de transaction : {data.reference}</span>}<b>{formatMoney(data.amount, currency)}</b></div><div className="reception-modal-actions"><button className="reception-button" onClick={close}>Fermer</button><button className="reception-button primary" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button></div></section></div>;
}

function InvoicePrintDialog({ data, hotelName, currency, timezone, close }: {
  data: Folio;
  hotelName: string;
  currency: string;
  timezone: string;
  close: () => void;
}) {
  const invoice = data.invoice;
  if (!invoice) return null;

  return (
    <div className="reception-modal-backdrop reception-invoice-backdrop" role="presentation">
      <section className="reception-modal reception-invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="reception-invoice-title">
        <div className="reception-modal-head">
          <div><p>Impression thermique · 80 mm</p><h2 id="reception-invoice-title">Facture {invoice.number}</h2></div>
          <button className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button>
        </div>
        <article className="reception-invoice-paper">
          <header>
            <img className="reception-print-logo" src="/logo.png" alt="Logo Bliss Hôtel" onError={(event) => { event.currentTarget.hidden = true; }} />
            <strong>{hotelName}</strong>
            <h3>FACTURE</h3>
            <span>N° {invoice.number}</span>
            <span>Émise le {formatDateTime(invoice.issuedAt, timezone)}</span>
          </header>
          <div className="reception-invoice-customer">
            <strong>Payeur : {invoice.payerName ?? data.reservation.client.name}</strong>
            <span>Client hébergé : {data.reservation.client.name}</span>
            {data.reservation.client.phone && <span>{data.reservation.client.phone}</span>}
            <span>Réservation : {data.reservation.reference}</span>
            <span>Chambre : {data.reservation.room ?? 'à attribuer'}</span>
            <span>Séjour : {formatDate(data.reservation.checkInDate)} – {formatDate(data.reservation.checkOutDate)}</span>
          </div>
          <div className="reception-invoice-lines">
            {data.lines.map((line) => (
              <div key={line.id}>
                <span>{line.description}</span>
                <strong>{formatMoney(line.amount, currency)}</strong>
              </div>
            ))}
          </div>
          <div className="reception-invoice-totals">
            <div><span>Total facturé</span><strong>{formatMoney(invoice.totalAmount, currency)}</strong></div>
            <div><span>Déjà encaissé</span><strong>{formatMoney(data.paid, currency)}</strong></div>
            <div className="is-due"><span>Reste à payer</span><strong>{formatMoney(data.balance, currency)}</strong></div>
          </div>
          <div className="reception-invoice-payments">
            <strong>Mode(s) de paiement</strong>
            {paymentMethodNames(data.payments).length
              ? paymentMethodNames(data.payments).map((method) => <span key={method}>{method}</span>)
              : <span>Aucun règlement enregistré</span>}
          </div>
          <footer>Merci de votre séjour.</footer>
        </article>
        <div className="reception-modal-actions">
          <button className="reception-button" onClick={close}>Fermer</button>
          <button className="reception-button primary" onClick={() => window.print()}>Imprimer la facture</button>
        </div>
      </section>
    </div>
  );
}

function FolioListSection({ data, filter, setFilter, open, openingId, currency, timezone }: {
  data: FolioListItem[];
  filter: string;
  setFilter: (next: string) => void;
  open: (folioId: string) => void;
  openingId: string | null;
  currency: string;
  timezone: string;
}) {
  const filters: [string, string][] = [['all', 'Toutes'], ['unpaid', 'Impayées'], ['partial', 'Partielles'], ['paid', 'Payées'], ['invoiced', 'Facturées']];
  const labels: Record<string, string> = { paid: 'Payée', partial: 'Partielle', unpaid: 'Impayée' };
  return <div className="reception-panel reception-table-panel">
    <div className="reception-panel-heading"><div><p>Facturation de l’établissement</p><h2>Factures & folios</h2></div></div>
    <div className="reception-period-filter"><span>Filtrer :</span>{filters.map(([value, label]) => <button key={value} type="button" className={`reception-chip${filter === value ? ' is-active' : ''}`} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {data.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Référence / client</th><th>Créée par</th><th>Période</th><th>Facture / payeur</th><th>Règlement</th><th>Facturé / encaissé / dû</th><th></th></tr></thead><tbody>{data.map((item) => <tr key={item.id}><td><strong>{item.reservation.reference}</strong><small>{item.reservation.client.name} · {item.reservation.room ? `ch. ${item.reservation.room}` : 'chambre à attribuer'}</small></td><td>{item.reservation.createdByName ?? '—'}</td><td>{item.reservation.stayType === 'SIESTA' ? 'Sieste · 3 h 30' : `${nightsBetween(item.reservation.checkInDate, item.reservation.checkOutDate)} nuitée(s)`}<small>{formatDate(item.reservation.checkInDate)} – {formatDate(item.reservation.checkOutDate)}</small></td><td>{item.invoice ? <>{item.invoice.number}<small>Payeur : {item.invoice.payerName ?? item.reservation.client.name}</small><small>Émise le {formatDateTime(item.invoice.issuedAt, timezone)}</small></> : '—'}</td><td><span className={`reception-status status-${item.paymentStatus}`}>{labels[item.paymentStatus]}</span></td><td><strong>{formatMoney(item.billed, currency)}</strong><small>Encaissé {formatMoney(item.paid, currency)} · Dû {formatMoney(item.balance, currency)}</small></td><td><button type="button" className="reception-button" disabled={openingId === item.id} onClick={() => open(item.id)}>{openingId === item.id ? 'Ouverture…' : 'Ouvrir'}</button></td></tr>)}</tbody></table></div> : <EmptyState text="Aucun folio pour ce filtre." />}
  </div>;
}

function StaysSection({ overview, stays, permissions, currency, timezone, checkOut, extend, occupants, move, openFolio, refresh, navigate }: {
  overview: Overview | null;
  stays: Reservation[];
  permissions: string[];
  currency: string;
  timezone: string;
  checkOut: (item: Reservation) => void;
  extend: (item: Reservation) => void;
  occupants: (item: Reservation) => void;
  move: (item: Reservation) => void;
  openFolio: (item: Reservation) => void;
  refresh: () => void;
  navigate: (section: Section) => void;
}) {
  const can = (permission: string) => permissions.includes(permission);
  return <>
    <div className="reception-heading-actions"><button className="reception-button" onClick={refresh}>Actualiser la réception</button></div>
    <div className="reception-overview-grid">
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Arrivées prévues aujourd’hui</p><h2>{overview?.arrivals ?? 0} arrivée(s)</h2></div><DoorOpen size={18} /></div>
        {overview?.todayArrivals.length ? <div className="reception-queue-columns"><div>{overview.todayArrivals.map((item) => <div className="reception-queue-row" key={item.id}><span><strong>{item.client.name}</strong><small>{item.reference} · {item.room ? `ch. ${item.room.number}` : 'chambre à attribuer'}</small></span><span><StatusBadge value={item.status} />{item.status === 'CONFIRMED' && can('stays.checkin') && <button className="reception-button primary" onClick={() => navigate('reservations')}>Check-in</button>}</span></div>)}</div></div> : <p className="reception-note">Aucune arrivée planifiée aujourd’hui. Pour un walk-in, créez la réservation du jour puis confirmez le check-in.</p>}
      </article>
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Départs prévus aujourd’hui</p><h2>{overview?.departures ?? 0} départ(s)</h2></div><LogOut size={18} /></div>
        {overview?.todayDepartures.length ? <div className="reception-queue-row-list">{overview.todayDepartures.map((item) => <div className="reception-queue-row" key={item.id}><span><strong>{item.client.name}</strong><small>{item.reference} · {item.room ? `ch. ${item.room.number}` : 'chambre à attribuer'} · {item.stayType === 'SIESTA' ? 'Sieste' : 'Nuitée'}{item.expectedCheckOutAt ? ` · fin prévue ${formatDateTime(item.expectedCheckOutAt, timezone)}` : ''}</small></span><StatusBadge value="CHECKED_IN" /></div>)}</div> : <p className="reception-note">Aucun départ prévu aujourd’hui.</p>}
      </article>
    </div>
    <div className="reception-panel reception-table-panel">
      <div className="reception-panel-heading"><div><p>Clients actuellement hébergés</p><h2>Séjours en cours · {stays.length}</h2></div><Users size={18} /></div>
      {stays.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Client / réservation</th><th>Chambre</th><th>Arrivée réelle</th><th>Fin prévue</th><th>Solde</th><th>Actions</th></tr></thead><tbody>{stays.map((item) => <tr key={item.id}><td><strong>{item.client.name}</strong><small>{item.reference} · {item.stayType === 'SIESTA' ? 'Sieste' : 'Nuitée'}</small><small>Séjour créé par {item.createdByName ?? '—'}</small></td><td>{item.room ? <>Ch. {item.room.number}<small>{item.room.category}</small></> : 'À attribuer'}</td><td>{item.stay?.checkedInAt ? formatDateTime(item.stay.checkedInAt, timezone) : '—'}</td><td>{item.stay?.expectedCheckOutAt ? formatDateTime(item.stay.expectedCheckOutAt, timezone) : formatDate(item.checkOutDate)}</td><td><strong>{formatMoney(item.folio?.balance ?? '0', currency)}</strong></td><td><div className="reception-row-actions">{can('folios.view') && <button className="reception-button" onClick={() => openFolio(item)}>Folio</button>}{can('reservations.update') && <button className="reception-button" onClick={() => move(item)}>Changer ch.</button>}{can('stays.extend') && <button className="reception-button" onClick={() => occupants(item)}>Occupants</button>}{item.stayType === 'OVERNIGHT' && can('stays.extend') && <button className="reception-button" onClick={() => extend(item)}>Prolonger</button>}{can('stays.checkout') && <button className="reception-button primary" onClick={() => checkOut(item)}>Check-out</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState text="Aucun client hébergé actuellement." />}
    </div>
  </>;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    RECEPTION_CLIENT_CREATE: 'Client enregistré',
    RECEPTION_CLIENT_UPDATE: 'Fiche client modifiée',
    RECEPTION_CLIENT_ID_DOCUMENT_SET: 'Scan de pièce d’identité enregistré',
    RECEPTION_RESERVATION_CREATE: 'Réservation créée',
    RECEPTION_RESERVATION_UPDATE: 'Réservation modifiée',
    RECEPTION_RESERVATION_CONFIRM: 'Réservation confirmée',
    RECEPTION_RESERVATION_CANCEL: 'Réservation annulée',
    RECEPTION_STAY_CHECK_IN: 'Check-in effectué',
    RECEPTION_STAY_CHECK_IN_CORRECTED: 'Heure d’arrivée corrigée',
    RECEPTION_STAY_CHECK_OUT: 'Check-out effectué',
    RECEPTION_STAY_EXTEND: 'Séjour prolongé',
    RECEPTION_STAY_OCCUPANTS_UPDATE: 'Occupants modifiés',
    RECEPTION_ROOM_MOVE: 'Changement de chambre',
    RECEPTION_PAYMENT_COLLECT: 'Paiement enregistré',
    RECEPTION_CASH_SESSION_OPEN: 'Caisse ouverte',
    RECEPTION_CASH_SESSION_CLOSE: 'Caisse clôturée',
    RECEPTION_FOLIO_LINE_ADD: 'Prestation ajoutée',
    RECEPTION_INVOICE_ISSUE: 'Facture émise',
  };
  return labels[action] ?? action;
}

function activityDetail(event: ActivityEvent, currency: string) {
  if (event.action !== 'RECEPTION_PAYMENT_COLLECT' || typeof event.details !== 'object' || event.details === null || Array.isArray(event.details)) return null;
  const details = event.details as Record<string, unknown>;
  if (typeof details.amount !== 'string' || typeof details.method !== 'string') return null;
  return `${formatMoney(details.amount, currency)} · ${details.method}`;
}

function ActivitySection({ data, filters, setFilters, currency, timezone }: {
  data: ActivityEvent[];
  filters: { scope: string; period: string };
  setFilters: (next: { scope: string; period: string }) => void;
  currency: string;
  timezone: string;
}) {
  return <div className="reception-panel reception-table-panel">
    <div className="reception-panel-heading"><div><p>Traçabilité</p><h2>Historique des opérations</h2></div><History size={18} /></div>
    <div className="reception-period-filter">
      <span>Portée :</span>
      <button type="button" className={`reception-chip${filters.scope === 'mine' ? ' is-active' : ''}`} onClick={() => setFilters({ ...filters, scope: 'mine' })}>Mes opérations</button>
      <button type="button" className={`reception-chip${filters.scope === 'all' ? ' is-active' : ''}`} onClick={() => setFilters({ ...filters, scope: 'all' })}>Toute l’équipe</button>
      <span>Période :</span>
      {(['day', 'week', 'month', 'all'] as const).map((value) => <button key={value} type="button" className={`reception-chip${filters.period === value ? ' is-active' : ''}`} onClick={() => setFilters({ ...filters, period: value })}>{{ day: 'Jour', week: 'Semaine', month: 'Mois', all: 'Tout' }[value]}</button>)}
    </div>
    {data.length ? <div className="reception-table-wrap"><table className="reception-table"><thead><tr><th>Date & heure</th><th>Auteur</th><th>Opération</th><th>Cible</th><th>Résultat</th></tr></thead><tbody>{data.map((event) => <tr key={event.id}><td>{formatDateTime(event.createdAt, timezone)}</td><td>{event.mine ? <strong>{event.actor} (moi)</strong> : event.actor}</td><td>{activityLabel(event.action)}{activityDetail(event, currency) && <small>{activityDetail(event, currency)}</small>}</td><td><small>{event.targetId ?? '—'}</small></td><td><span className={`reception-status status-${event.result.toLowerCase()}`}>{event.result === 'SUCCESS' ? 'Succès' : 'Échec'}</span></td></tr>)}</tbody></table></div> : <EmptyState text="Aucune opération sur cette période." />}
    <p className="reception-note">Les opérations des collègues sont consultables en lecture seule.</p>
  </div>;
}

function NotificationsSection({ data, timezone, markRead }: {
  data: NotificationItem[];
  timezone: string;
  markRead: () => void;
}) {
  return <div className="reception-panel reception-table-panel">
    <div className="reception-panel-heading"><div><p>Équipe & système</p><h2>Notifications</h2></div><div><button className="reception-button" onClick={markRead} disabled={!data.some((item) => !item.readAt)}>Tout marquer comme lu</button></div></div>
    {data.length ? <ul className="reception-notification-list">{data.map((item) => <li key={item.id} className={item.readAt ? '' : 'is-unread'}><span>{item.message}</span><time>{formatDateTime(item.createdAt, timezone)}</time></li>)}</ul> : <EmptyState text="Aucune notification." />}
  </div>;
}

function ProfileSection({ name, account, permissions, currency, session, passwordForm, setPasswordForm, changePassword, logout }: {
  name: string;
  account: { id: string; email: string; role: string; activeFrom: string | null; createdAt: string };
  permissions: string[];
  currency: string;
  session: CashSession | null;
  passwordForm: { currentPassword: string; newPassword: string };
  setPasswordForm: (value: { currentPassword: string; newPassword: string }) => void;
  changePassword: (event: FormEvent<HTMLFormElement>) => void;
  logout: () => void;
}) {
  return <>
    <div className="reception-overview-grid reception-profile-grid">
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Compte individuel</p><h2>{name}</h2></div><UserRound size={18} /></div>
        <dl className="reception-client-facts">
          <div><dt>E-mail</dt><dd>{account.email}</dd></div>
          <div><dt>Rôle</dt><dd>{account.role}</dd></div>
          <div><dt>Dernière connexion</dt><dd>{account.activeFrom ? formatDateTime(account.activeFrom, 'UTC') : '—'}</dd></div>
          <div><dt>Session de caisse</dt><dd>{session ? `Ouverte · ${formatMoney(session.expectedCash, currency)} attendus` : 'Fermée'}</dd></div>
        </dl>
        <p className="reception-note">Chaque réceptionniste dispose d’un identifiant individuel ; aucun compte partagé.</p>
        <button className="reception-button" onClick={logout}><LogOut size={15} />Se déconnecter</button>
      </article>
      <article className="reception-panel"><div className="reception-panel-heading"><div><p>Sécurité</p><h2>Changer mon mot de passe</h2></div><ShieldAlert size={18} /></div>
        <form className="reception-operation-form" onSubmit={changePassword}>
          <label><span>Mot de passe actuel</span><input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} minLength={8} maxLength={128} required autoComplete="current-password" /></label>
          <label><span>Nouveau mot de passe (12 caractères min.)</span><input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} minLength={12} maxLength={128} required autoComplete="new-password" /></label>
          <button className="reception-button primary">Modifier le mot de passe</button>
          <p className="reception-note">Toutes les sessions seront déconnectées après le changement.</p>
        </form>
      </article>
      <article className="reception-panel reception-profile-permissions"><div className="reception-panel-heading"><div><p>Droits attribués</p><h2>Mes permissions</h2></div><ShieldAlert size={18} /></div>
        <div className="reception-permission-list">{permissions.slice().sort().map((permission) => <span key={permission} className="reception-chip">{permission}</span>)}</div>
      </article>
    </div>
  </>;
}

function ClientEditDialog({ form, setForm, client, idScan, setIdScan, close, submit }: {
  form: { name: string; phone: string; email: string; nationality: string; address: string; idType: string; idNumber: string; notes: string };
  setForm: (value: { name: string; phone: string; email: string; nationality: string; address: string; idType: string; idNumber: string; notes: string }) => void;
  client: Client;
  idScan: File | null;
  setIdScan: (file: File | null) => void;
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const idTypes = ['', 'Carte nationale d’identité', 'Passeport', 'Carte de séjour', 'Autre'];
  return <div className="reception-modal-backdrop" role="presentation"><form className="reception-modal reception-edit-modal" role="dialog" aria-modal="true" aria-labelledby="reception-client-edit-title" onSubmit={submit}>
    <div className="reception-modal-head"><div><p>Fiche client · créée par {client.createdByName ?? client.creator?.name ?? '—'}</p><h2 id="reception-client-edit-title">Modifier {client.name}</h2></div><button type="button" className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button></div>
    <label><span>Nom complet</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required /></label>
    <label><span>Téléphone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={40} /></label>
    <label><span>E-mail</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={191} /></label>
    <label><span>Nationalité</span><input value={form.nationality} onChange={(event) => setForm({ ...form, nationality: event.target.value })} maxLength={80} /></label>
    <label><span>Adresse</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={255} /></label>
    <label><span>Type de pièce d’identité</span><select value={form.idType} onChange={(event) => setForm({ ...form, idType: event.target.value })}>{idTypes.map((type) => <option value={type} key={type || 'none'}>{type || 'Non renseignée'}</option>)}</select></label>
    <label><span>Numéro de pièce</span><input value={form.idNumber} onChange={(event) => setForm({ ...form, idNumber: event.target.value })} maxLength={80} /></label>
    <label><span>Scan de la pièce d’identité</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setIdScan(event.target.files?.[0] ?? null)} /><small>{idScan ? `Nouveau fichier : ${idScan.name}` : client.idDocumentName ? `Scan déjà enregistré : ${client.idDocumentName}. Choisir un fichier le remplacera.` : 'Aucun scan enregistré · JPEG, PNG, WebP ou PDF · 5 Mo max.'}</small></label>
    {client.idDocumentName && <p className="reception-note"><a className="reception-scan-link" href={`/api/reception/clients/${client.id}/document`} target="_blank" rel="noreferrer">Ouvrir le scan actuel</a></p>}
    <label><span>Informations complémentaires</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} rows={2} /></label>
    <p className="reception-note">Le créateur d’origine reste {client.createdByName ?? client.creator?.name ?? 'inconnu'} : cette mention n’est jamais écrasée.</p>
    <div className="reception-modal-actions"><button type="button" className="reception-button" onClick={close}>Annuler</button><button className="reception-button primary">Enregistrer</button></div>
  </form></div>;
}

function MoveRoomDialog({ reservation, rooms, value, setValue, close, submit }: {
  reservation: Reservation;
  rooms: Room[];
  value: string;
  setValue: (id: string) => void;
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="reception-modal-backdrop" role="presentation"><form className="reception-modal reception-edit-modal" role="dialog" aria-modal="true" aria-labelledby="reception-move-title" onSubmit={submit}>
    <div className="reception-modal-head"><div><p>{reservation.reference} · chambre actuelle {reservation.room?.number ?? '—'}</p><h2 id="reception-move-title"><ArrowLeftRight size={16} /> Changer de chambre</h2></div><button type="button" className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button></div>
    <label><span>Chambre propre et disponible pour la fin du séjour</span><select value={value} onChange={(event) => setValue(event.target.value)} required><option value="">Choisir une chambre</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.number} · {room.category}</option>)}</select>{!rooms.length && <small>Aucune chambre disponible propre. Planifiez le housekeeping ou choisissez une autre période.</small>}</label>
    <p className="reception-note">L’ancienne chambre sera automatiquement transmise au housekeeping. L’opération est journalisée à votre nom.</p>
    <div className="reception-modal-actions"><button type="button" className="reception-button" onClick={close}>Annuler</button><button className="reception-button primary" disabled={!value}>Confirmer le transfert</button></div>
  </form></div>;
}

function HistoryDialog({ data, timezone, close }: { data: { reservation: Reservation; events: ActivityEvent[] }; timezone: string; close: () => void }) {
  return <div className="reception-modal-backdrop" role="presentation"><section className="reception-modal" role="dialog" aria-modal="true" aria-labelledby="reception-history-title"><div className="reception-modal-head"><div><p>{data.reservation.reference} · {data.reservation.client.name}</p><h2 id="reception-history-title">Historique des modifications</h2></div><button className="reception-icon-button" onClick={close} aria-label="Fermer"><X size={18} /></button></div>
    {data.events.length ? <ul className="reception-activity-list">{data.events.map((event) => <li key={event.id}><span><strong>{event.actor}{event.mine ? ' (moi)' : ''}</strong><small>{activityLabel(event.action)} · {formatDateTime(event.createdAt, timezone)}</small></span></li>)}</ul> : <EmptyState text="Aucune opération enregistrée." />}
    <div className="reception-modal-actions"><button className="reception-button" onClick={close}>Fermer</button></div></section></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="reception-empty"><span><Search size={18} /></span><p>{text}</p></div>;
}
