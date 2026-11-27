import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { platformApi } from '@/server/platform-admin';
import { db } from '@/server/db';

export async function GET() {
  return platformApi(async (actor) => {
    if (!actor.platformAdmin) return NextResponse.json({ error: 'Accès réservé au Super Administrateur.' }, { status: 403 });
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [users, roleCounts, newUsers, activeSessions, recentLogins, failedLoginEvents, failedLogins, lockedAccounts, sensitiveEvents, database, rateLimits, restaurantItems, servedRestaurantOrders, commissionPayments] = await Promise.all([
      db.user.findMany({ select: { id: true, active: true, platformAdmin: true, createdAt: true, lastLoginAt: true, role: { select: { code: true } } } }),
      db.role.findMany({ select: { code: true, users: { where: { platformAdmin: false }, select: { active: true } } } }),
      db.user.count({ where: { createdAt: { gte: weekAgo } } }),
      db.session.count({ where: { expiresAt: { gt: now }, user: { active: true } } }),
      db.user.findMany({ where: { lastLoginAt: { not: null } }, orderBy: { lastLoginAt: 'desc' }, take: 8, select: { id: true, name: true, email: true, platformAdmin: true, lastLoginAt: true, role: { select: { name: true, code: true } } } }),
      db.auditLog.findMany({ where: { action: 'AUTH_LOGIN', result: 'FAILURE', createdAt: { gte: dayAgo } }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, action: true, result: true, createdAt: true, details: true } }),
      db.auditLog.count({ where: { action: 'AUTH_LOGIN', result: 'FAILURE', createdAt: { gte: dayAgo } } }),
      db.rateLimit.count({ where: { attempts: { gte: 5 }, expiresAt: { gt: now } } }),
      db.auditLog.findMany({ where: { createdAt: { gte: dayAgo }, OR: [{ action: { startsWith: 'PLATFORM_' } }, { action: { startsWith: 'HOTEL_ADMIN_PERMISSIONS' } }, { action: { startsWith: 'ROOM_ADMIN_' } }] }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, actorId: true, action: true, result: true, targetId: true, createdAt: true } }),
      db.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
      db.rateLimit.aggregate({ where: { expiresAt: { gt: now } }, _sum: { attempts: true } }),
      db.restaurantMenuItem.findMany({ where: { deletedAt: null }, select: { active: true, stockQuantity: true, stockAlertAt: true } }),
      db.restaurantOrder.count({ where: { createdAt: { gte: dayAgo }, status: 'SERVED' } }),
      db.payment.findMany({ where: { createdAt: { gte: monthAgo }, description: { startsWith: 'Commission réservation' }, amount: { lt: 0 } }, select: { amount: true, receivedBy: true } }),
    ]);
    const roleCount = (code: string) => roleCounts.find((role) => role.code === code)?.users.length ?? 0;
    const activeRoleCount = (code: string) => roleCounts.find((role) => role.code === code)?.users.filter((user) => user.active).length ?? 0;
    const ownerCount = roleCount('OWNER');
    const hotelAdminCount = roleCount('HOTEL_ADMIN');
    const managerCount = roleCount('GENERAL_MANAGER');
    const receptionistCount = roleCount('RECEPTIONIST');
    const activeUsers = users.filter((user) => user.active).length;
    const actors = [...new Set(sensitiveEvents.flatMap((event) => event.actorId ? [event.actorId] : []))];
    const actorRows = actors.length ? await db.user.findMany({ where: { id: { in: actors } }, select: { id: true, name: true, email: true } }) : [];
    const actorMap = new Map(actorRows.map((actor) => [actor.id, actor]));
    const commissionUserIds = [...new Set(commissionPayments.map((payment) => payment.receivedBy))];
    const commissionUsers = commissionUserIds.length ? await db.user.findMany({ where: { id: { in: commissionUserIds } }, select: { id: true, name: true } }) : [];
    const commissionNames = new Map(commissionUsers.map((user) => [user.id, user.name]));
    const commissionTotals = new Map<string, Prisma.Decimal>();
    for (const payment of commissionPayments) {
      const receptionist = commissionNames.get(payment.receivedBy) ?? 'Inconnu';
      commissionTotals.set(receptionist, (commissionTotals.get(receptionist) ?? new Prisma.Decimal(0)).add(payment.amount.abs()));
    }
    const commissions = {
      total: commissionPayments.reduce((sum, payment) => sum.add(payment.amount.abs()), new Prisma.Decimal(0)).toFixed(2),
      count: commissionPayments.length,
      byReceptionist: [...commissionTotals].map(([receptionist, amount]) => ({ receptionist, amount: amount.toFixed(2) })),
    };
    return NextResponse.json({
      counts: {
        users: users.length, activeUsers, suspendedUsers: users.length - activeUsers,
        platformAdmins: users.filter((user) => user.platformAdmin).length,
        owners: ownerCount, hotelAdmins: hotelAdminCount, managers: managerCount,
        receptionists: receptionistCount,
        otherStaff: Math.max(0, users.filter((user) => !user.platformAdmin).length - ownerCount - hotelAdminCount - managerCount - receptionistCount),
        newUsersThisWeek: newUsers, activeSessions,
      },
      restaurantModule: {
        activeManagers: activeRoleCount('RESTAURANT_MANAGER'),
        activeBarStaff: activeRoleCount('BAR_SERVER'),
        activeMenuItems: restaurantItems.filter((item) => item.active).length,
        lowStock: restaurantItems.filter((item) => item.stockQuantity && item.stockAlertAt && item.stockQuantity.gt(0) && item.stockQuantity.lte(item.stockAlertAt)).length,
        outOfStock: restaurantItems.filter((item) => item.stockQuantity?.lte(0)).length,
        servedOrders24h: servedRestaurantOrders,
      },
      cashCommissions: commissions,
      security: {
        failedLogins24h: failedLogins,
        lockedAccounts: lockedAccounts,
        rateLimitAttempts: rateLimits._sum.attempts ?? 0,
        recentFailures: failedLoginEvents.map((event) => ({ id: event.id, action: event.action, result: event.result, createdAt: event.createdAt, email: typeof event.details === 'object' && event.details !== null && 'email' in event.details && typeof event.details.email === 'string' ? event.details.email : null })),
        sensitiveEvents: sensitiveEvents.map((event) => ({ ...event, actor: event.actorId ? actorMap.get(event.actorId)?.name ?? 'Compte indisponible' : 'Système' })),
      },
      recentLogins: recentLogins.map((user) => ({ ...user, role: user.platformAdmin ? { code: 'SUPER_ADMIN', name: 'Super Administrateur' } : user.role })),
      services: {
        backend: 'available',
        database: database[0]?.ok === 1 ? 'available' : 'unavailable',
        email: 'not_configured', frontend: 'available',
        scheduledTasks: 'not_configured', backups: 'not_configured', storage: 'not_available',
        recentFailures: failedLogins,
      },
      version: process.env.npm_package_version ?? '0.1.0',
      environment: process.env.NODE_ENV ?? 'unknown',
      availability: { monitoring: 'audit_failures_only', mfa: 'not_configured', backupHistory: 'not_configured', multiTenant: 'single_hotel' },
    });
  });
}
