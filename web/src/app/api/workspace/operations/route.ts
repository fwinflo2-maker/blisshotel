import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { authorizedScope, requireSession } from '@/server/auth';
import { AppError, roomAssignmentFilter } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

const addDays = (date: Date, days: number) => { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; };

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const platformAdmin = session.user.platformAdmin;
    const scope = platformAdmin ? null : await authorizedScope('dashboard.view');
    const roleCode = platformAdmin ? 'SUPER_ADMIN' : scope!.roleCode;
    const permissions = new Set(scope?.permissions ?? []);
    const can = (permission: string) => platformAdmin || permissions.has(permission);
    const configuration = await hotelConfiguration();
    const params = new URL(request.url).searchParams;
    const todayKey = hotelDateKey(new Date(), configuration.timezone);
    const fromText = params.get('from') ?? todayKey;
    const toText = params.get('to') ?? todayKey;
    const fromDate = parseDateOnly(fromText);
    const inclusiveTo = parseDateOnly(toText);
    if (fromDate > inclusiveTo || inclusiveTo.getTime() - fromDate.getTime() > 30 * 86_400_000) {
      return NextResponse.json({ error: 'Choisissez une période valide de 1 à 31 jours.' }, { status: 400 });
    }
    const untilDate = addDays(inclusiveTo, 1);
    const periodLengthDays = Math.round((untilDate.getTime() - fromDate.getTime()) / 86_400_000);
    const previousFromDate = addDays(fromDate, -periodLengthDays);
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    const until = parseHotelDateTime(`${untilDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const previousFrom = parseHotelDateTime(`${previousFromDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const adminRoomScope = scope?.roleCode === 'HOTEL_ADMIN' ? roomAssignmentFilter(roleCode, session.user.id) : {};
    const canRooms = can('rooms.view');
    const roomRows = canRooms ? await db.room.findMany({
      where: { active: true, ...adminRoomScope },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      select: {
        id: true, number: true, floor: true, status: true, housekeepingStatus: true, technicalStatus: true,
        reservations: { where: { stay: { is: { checkedOutAt: null } } }, take: 1, select: { client: { select: { name: true } } } },
        housekeepingTasks: { where: { status: { not: 'COMPLETED' } }, take: 1, select: { id: true, dueAt: true } },
      },
    }) : [];
    const roomIds = roomRows.map((room) => room.id);
    const reservationsEnabled = can('reservations.view') || can('stays.view') || roleCode === 'HOTEL_ADMIN';
    const taskPermissions = ['housekeeping.tasks.view', 'housekeeping.tasks.assign', 'housekeeping.tasks.execute'];
    const tasksEnabled = taskPermissions.some(can);
    const incidentsEnabled = can('maintenance.view') || can('maintenance.incidents.report');
    const roomReservationScope = scope?.roleCode === 'HOTEL_ADMIN' ? { roomId: { in: roomIds } } : {};
    const [reservations, tasks, incidents, notifications, activity, financial, paymentRows, roomPerformance] = await Promise.all([
      reservationsEnabled ? db.reservation.findMany({
        where: {
          ...roomReservationScope,
          status: scope?.roleCode === 'HOTEL_ADMIN' && !can('reservations.view') && !can('stays.view') ? 'CHECKED_IN' : { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
          OR: [
            { checkInDate: { gte: fromDate, lt: untilDate } },
            { checkOutDate: { gte: fromDate, lt: untilDate } },
            { status: 'CHECKED_IN' },
          ],
        },
        orderBy: [{ checkInDate: 'asc' }, { createdAt: 'desc' }], take: 250,
        select: { id: true, reference: true, status: true, stayType: true, checkInDate: true, checkOutDate: true, plannedCheckInAt: true, roomId: true, client: { select: { name: true } }, room: { select: { number: true, floor: true } }, stay: { select: { expectedCheckOutAt: true } } },
      }) : Promise.resolve([]),
      tasksEnabled ? db.housekeepingTask.findMany({
        where: {
          ...(scope?.roleCode === 'HOTEL_ADMIN' ? { roomId: { in: roomIds } } : {}),
          ...(can('housekeeping.tasks.assign') ? {} : { OR: [{ assignedTo: session.user.id }, { assignments: { some: { agentId: session.user.id } } }, { createdBy: session.user.id }] }),
          status: { not: 'COMPLETED' },
        },
        orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }], take: 150,
        select: { id: true, title: true, status: true, priority: true, dueAt: true, room: { select: { id: true, number: true } }, assignee: { select: { name: true } }, assignments: { select: { agent: { select: { name: true } } } } },
      }) : Promise.resolve([]),
      incidentsEnabled ? db.roomIncident.findMany({
        where: {
          status: { not: 'RESOLVED' },
          ...(scope?.roleCode === 'HOTEL_ADMIN' ? { roomId: { in: roomIds } } : {}),
          ...(!can('maintenance.view') ? { reportedBy: session.user.id } : {}),
        },
        orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, title: true, status: true, createdAt: true, room: { select: { id: true, number: true } } },
      }) : Promise.resolve([]),
      db.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, message: true, readAt: true, createdAt: true } }),
      db.auditLog.findMany({
        where: {
          createdAt: { gte: from, lt: until }, result: 'SUCCESS',
          ...(platformAdmin || can('audit.view') ? {} : { actorId: session.user.id }),
        },
        orderBy: { createdAt: 'desc' }, take: 30,
        select: { id: true, action: true, targetId: true, actorId: true, createdAt: true },
      }),
      can('accounting.view') || can('reports.financial.view') ? (async () => {
        const folioRoomFilter = scope?.roleCode === 'HOTEL_ADMIN' ? { reservation: { is: { roomId: { in: roomIds } } } } : {};
        const [invoices, payments, folios, expenses, previousInvoices, previousPayments] = await Promise.all([
          db.invoice.aggregate({ where: { issuedAt: { gte: from, lt: until }, ...(scope?.roleCode === 'HOTEL_ADMIN' ? { folio: { is: folioRoomFilter } } : {}) }, _sum: { totalAmount: true }, _count: { id: true } }),
          db.payment.aggregate({ where: { createdAt: { gte: from, lt: until }, ...(scope?.roleCode === 'HOTEL_ADMIN' ? { folio: { is: folioRoomFilter } } : {}) }, _sum: { amount: true }, _count: { id: true } }),
          db.folio.findMany({ where: { status: 'OPEN', ...folioRoomFilter }, select: { lines: { select: { amount: true } }, payments: { select: { amount: true } } } }),
          can('accounting.view') ? db.receptionShiftExpense.aggregate({ where: { report: { is: { shiftDate: { gte: fromDate, lt: untilDate } } } }, _sum: { amount: true }, _count: { id: true } }) : Promise.resolve(null),
          db.invoice.aggregate({ where: { issuedAt: { gte: previousFrom, lt: from }, ...(scope?.roleCode === 'HOTEL_ADMIN' ? { folio: { is: folioRoomFilter } } : {}) }, _sum: { totalAmount: true } }),
          db.payment.aggregate({ where: { createdAt: { gte: previousFrom, lt: from }, ...(scope?.roleCode === 'HOTEL_ADMIN' ? { folio: { is: folioRoomFilter } } : {}) }, _sum: { amount: true } }),
        ]);
        const outstanding = folios.reduce((sum, folio) => {
          const billed = folio.lines.reduce((total, line) => total.add(line.amount), new Prisma.Decimal(0));
          const paid = folio.payments.reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
          return sum.add(Prisma.Decimal.max(billed.sub(paid), 0));
        }, new Prisma.Decimal(0));
        return { invoiced: invoices._sum.totalAmount?.toFixed(2) ?? '0.00', invoices: invoices._count.id, collected: payments._sum.amount?.toFixed(2) ?? '0.00', payments: payments._count.id, outstanding: outstanding.toFixed(2), expenses: expenses?._sum.amount?.toFixed(2) ?? null, expenseCount: expenses?._count.id ?? null, previousInvoiced: previousInvoices._sum.totalAmount?.toFixed(2) ?? '0.00', previousCollected: previousPayments._sum.amount?.toFixed(2) ?? '0.00' };
      })() : Promise.resolve(null),
      can('accounting.view') || can('reports.financial.view') ? db.payment.findMany({
        where: { createdAt: { gte: addDays(from, -6), lt: until }, ...(scope?.roleCode === 'HOTEL_ADMIN' ? { folio: { is: { reservation: { is: { roomId: { in: roomIds } } } } } } : {}) },
        select: { amount: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 2000,
      }) : Promise.resolve([]),
      can('accounting.view') || can('reports.financial.view') ? db.reservation.findMany({
        where: { checkOutDate: { gte: fromDate, lt: untilDate }, ...(scope?.roleCode === 'HOTEL_ADMIN' ? { roomId: { in: roomIds } } : {}) },
        select: { roomId: true, stayType: true, folio: { select: { payments: { where: { createdAt: { gte: from, lt: until } }, select: { amount: true } } } } }, take: 3000,
      }) : Promise.resolve([]),
    ]);

    const now = new Date();
    const visibleRoomIds = new Set(roomRows.map((room) => room.id));
    const reservedRoomIds = new Set(reservations.filter((item) => ['PENDING', 'CONFIRMED'].includes(item.status) && item.roomId && visibleRoomIds.has(item.roomId)).map((item) => item.roomId as string));
    const effectiveRoomStatus = (room: typeof roomRows[number]) => room.reservations.length
      ? 'OCCUPIED'
      : room.status === 'OCCUPIED'
        ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
        : room.status;
    const readyRooms = roomRows.filter((room) => effectiveRoomStatus(room) === 'AVAILABLE' && room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' && !room.housekeepingTasks.length && !reservedRoomIds.has(room.id)).length;
    const occupiedRooms = roomRows.filter((room) => room.reservations.length > 0).length;
    const arrivalRows = reservations.filter((item) => ['PENDING', 'CONFIRMED'].includes(item.status) && item.checkInDate >= fromDate && item.checkInDate < untilDate);
    const departureRows = reservations.filter((item) => item.status === 'CHECKED_IN' && item.checkOutDate >= fromDate && item.checkOutDate < untilDate);
    const todayArrivals = reservations.filter((item) => ['PENDING', 'CONFIRMED'].includes(item.status) && hotelDateKey(item.checkInDate, configuration.timezone) === todayKey);
    const overdueStays = reservations.filter((item) => item.status === 'CHECKED_IN' && item.stay?.expectedCheckOutAt && item.stay.expectedCheckOutAt < now);
    const overdueTasks = tasks.filter((task) => task.dueAt && task.dueAt < now);
    const unreadyArrivalRooms = new Set(roomRows.filter((room) => effectiveRoomStatus(room) !== 'AVAILABLE' || room.housekeepingStatus !== 'CLEAN' || room.technicalStatus !== 'OPERATIONAL' || room.housekeepingTasks.length).map((room) => room.id));
    const alerts = [
      ...overdueStays.map((item) => ({ id: `stay-${item.id}`, priority: 'high', type: 'departure_overdue', title: `Départ dépassé · chambre ${item.room?.number ?? '—'}`, detail: `${item.client.name} · ${item.reference}`, href: '/reception' })),
      ...overdueTasks.map((task) => ({ id: `task-${task.id}`, priority: task.priority === 'URGENT' ? 'high' : 'medium', type: 'task_overdue', title: `Tâche en retard · chambre ${task.room.number}`, detail: task.title, href: '/housekeeping' })),
      ...todayArrivals.filter((item) => item.roomId && unreadyArrivalRooms.has(item.roomId)).map((item) => ({ id: `arrival-${item.id}`, priority: 'high', type: 'arrival_unready', title: `Arrivée avec chambre · préparer · ${item.room?.number ?? '—'}`, detail: `${item.client.name} · ${item.reference}`, href: '/reception' })),
      ...incidents.map((incident) => ({ id: `incident-${incident.id}`, priority: 'medium', type: 'incident_open', title: `${incident.title} · chambre ${incident.room.number}`, detail: incident.status === 'IN_PROGRESS' ? 'Intervention en cours' : 'Incident · traiter', href: roleCode === 'HOTEL_ADMIN' ? '/admin-hotel' : '/maintenance' })),
    ].sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));
    const activityActorIds = [...new Set(activity.flatMap((item) => item.actorId ? [item.actorId] : []))];
    const activityActors = activityActorIds.length ? await db.user.findMany({ where: { id: { in: activityActorIds } }, select: { id: true, name: true } }) : [];
    const activityActorNames = new Map(activityActors.map((actor) => [actor.id, actor.name]));

    const events = [
      ...reservations.filter((item) => item.status !== 'CHECKED_IN' && item.checkInDate >= fromDate && item.checkInDate < untilDate).map((item) => ({ id: `arrival-${item.id}`, date: item.plannedCheckInAt?.toISOString() ?? item.checkInDate.toISOString(), kind: 'arrival', title: `Arrivée · ${item.client.name}`, room: item.room?.number ?? 'à attribuer', status: item.status })),
      ...departureRows.map((item) => ({ id: `departure-${item.id}`, date: item.stay?.expectedCheckOutAt?.toISOString() ?? item.checkOutDate.toISOString(), kind: 'departure', title: `Départ · ${item.client.name}`, room: item.room?.number ?? '—', status: item.status })),
      ...tasks.filter((task) => task.dueAt && task.dueAt >= from && task.dueAt < until).map((task) => ({ id: `task-${task.id}`, date: task.dueAt!.toISOString(), kind: 'housekeeping', title: task.title, room: task.room.number, status: task.status })),
      ...incidents.filter((incident) => incident.createdAt >= from && incident.createdAt < until).map((incident) => ({ id: `incident-${incident.id}`, date: incident.createdAt.toISOString(), kind: 'maintenance', title: incident.title, room: incident.room.number, status: incident.status })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 300);

    const trendStart = addDays(parseDateOnly(todayKey), -6);
    const trend = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(trendStart, index);
      const key = day.toISOString().slice(0, 10);
      const amount = paymentRows.filter((payment) => hotelDateKey(payment.createdAt, configuration.timezone) === key).reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      return { date: key, amount: amount.toFixed(2) };
    });
    const performanceMap = new Map<string, { stays: number; siestas: number; overnight: number; revenue: Prisma.Decimal }>();
    for (const reservation of roomPerformance) {
      if (!reservation.roomId) continue;
      const item = performanceMap.get(reservation.roomId) ?? { stays: 0, siestas: 0, overnight: 0, revenue: new Prisma.Decimal(0) };
      item.stays += 1;
      if (reservation.stayType === 'SIESTA') item.siestas += 1;
      else item.overnight += 1;
      for (const payment of reservation.folio?.payments ?? []) item.revenue = item.revenue.add(payment.amount);
      performanceMap.set(reservation.roomId, item);
    }
    const roomPerformanceRows = roomRows.map((room) => ({ room: room.number, floor: room.floor, stays: performanceMap.get(room.id)?.stays ?? 0, siestas: performanceMap.get(room.id)?.siestas ?? 0, overnight: performanceMap.get(room.id)?.overnight ?? 0, revenue: performanceMap.get(room.id)?.revenue.toFixed(2) ?? '0.00' })).sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 30);

    return NextResponse.json({
      user: { name: session.user.name, roleCode },
      permissions: [...permissions], currency: configuration.currency,
      period: { from: fromText, to: toText },
      kpis: {
        rooms: roomRows.length, occupied: occupiedRooms, ready: readyRooms,
        reserved: reservedRoomIds.size,
        arrivals: arrivalRows.length, departures: departureRows.length,
        tasks: tasks.length, overdueTasks: overdueTasks.length, incidents: incidents.length,
        activeStays: reservations.filter((item) => item.status === 'CHECKED_IN').length,
        occupancyRate: roomRows.length ? Math.round((occupiedRooms / roomRows.length) * 100) : 0,
      },
      finance: financial,
      trend: financial ? trend : [],
      events, alerts: alerts.slice(0, 50),
      tasks: tasks.slice(0, 100).map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, dueAt: task.dueAt?.toISOString() ?? null, room: task.room.number, assignee: task.assignee?.name ?? (task.assignments.map((assignment) => assignment.agent.name).join(', ') || null) })),
      incidents: incidents.slice(0, 50).map((incident) => ({ id: incident.id, title: incident.title, status: incident.status, room: incident.room.number, createdAt: incident.createdAt.toISOString() })),
      notifications: notifications.map((item) => ({ ...item, priority: 'info', href: roleCode === 'HOTEL_ADMIN' ? '/admin-hotel' : '/reception' })),
      activity: activity.map((item) => ({ id: item.id, action: item.action, targetId: item.targetId, createdAt: item.createdAt.toISOString(), actor: item.actorId ? activityActorNames.get(item.actorId) ?? null : null })),
      roomPerformance: can('accounting.view') || can('reports.financial.view') ? roomPerformanceRows : [],
      modules: { commissions: 'not_configured', restaurant: 'not_configured', approvals: 'not_configured', staffAttendance: 'not_configured', inventory: 'not_configured' },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RangeError) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
    throw error;
  }
}
