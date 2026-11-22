export const groups = {
  FOUNDATION: ['dashboard.view', 'users.view', 'users.manage', 'roles.view', 'roles.assign', 'permissions.manage', 'audit.view'],
  RESERVATIONS: ['reservations.view', 'reservations.create', 'reservations.update', 'reservations.cancel', 'reservations.confirm', 'clients.view', 'clients.create', 'clients.update'],
  FRONT_DESK: ['stays.view', 'stays.checkin', 'stays.checkout', 'stays.extend', 'folios.view', 'folios.manage', 'invoices.view', 'invoices.create'],
  CASHIER_OPERATIONS: ['payments.view', 'payments.collect', 'cash_sessions.open_own', 'cash_sessions.view_own', 'cash_sessions.close_own'],
  SHIFT_REPORTS: ['shift_reports.view'],
  ACCOUNTING: ['accounting.view', 'expenses.manage', 'reconciliation.manage', 'cash_sessions.view_all', 'reports.financial.view', 'reports.export'],
  SENSITIVE: ['payments.refund', 'payments.reverse', 'invoices.correct', 'cash_sessions.reopen', 'approvals.view', 'approvals.decide', 'stays.checkin.correct'],
  ROOMS: ['rooms.view', 'rooms.manage', 'rooms.block', 'rooms.release', 'rooms.rates.view'],
  HOUSEKEEPING: ['housekeeping.tasks.view', 'housekeeping.tasks.assign', 'housekeeping.tasks.execute', 'housekeeping.rooms.inspect', 'housekeeping.agents.manage'],
  RESTAURANT: ['restaurant.menu.manage', 'restaurant.orders.manage', 'restaurant.folio.transfer'],
  MAINTENANCE: ['maintenance.view', 'maintenance.incidents.report', 'maintenance.tickets.manage', 'maintenance.rooms.block', 'maintenance.rooms.release'],
  PLATFORM: ['platform.manage'],
} as const;
export type PermissionCode = typeof groups[keyof typeof groups][number];
export const allPermissions = Object.values(groups).flat() as PermissionCode[];

export const hotelAdminDelegablePermissions = [
  'rooms.manage', 'rooms.rates.view',
  'reservations.view', 'reservations.update', 'reservations.cancel', 'reservations.confirm',
  'clients.view',
  'stays.view', 'stays.checkin', 'stays.checkout', 'stays.extend',
  'housekeeping.tasks.view',
  'maintenance.view', 'maintenance.incidents.report',
  'reports.financial.view', 'reports.export',
] as const satisfies readonly PermissionCode[];

export const platformFeatures = [
  { key: 'RESERVATIONS', name: 'Réservations', description: 'Recherche, création et gestion des réservations.' },
  { key: 'FRONT_DESK', name: 'Réception et séjours', description: 'Arrivées, départs, séjours et folios.' },
  { key: 'CASHIER_OPERATIONS', name: 'Caisse et encaissements', description: 'Sessions de caisse et paiements ordinaires.' },
  { key: 'ACCOUNTING', name: 'Comptabilité', description: 'Dépenses, rapprochements et rapports financiers.' },
  { key: 'SENSITIVE', name: 'Opérations sensibles', description: 'Remboursements, corrections et validations.' },
  { key: 'ROOMS', name: 'Gestion des chambres', description: 'Inventaire, blocage et disponibilité des chambres.' },
  { key: 'HOUSEKEEPING', name: 'Service d’entretien', description: 'Tâches et inspections des chambres.' },
  { key: 'RESTAURANT', name: 'Restaurant et bar', description: 'Menus, commandes et transferts vers les folios.' },
  { key: 'MAINTENANCE', name: 'Maintenance', description: 'Tickets et indisponibilités techniques.' },
] as const;

const permissionGroups = new Map<string, string>(
  Object.entries(groups).flatMap(([group, permissions]) => permissions.map((permission) => [permission, group])),
);
const featureKeys = new Set<string>(platformFeatures.map((feature) => feature.key));

export function permissionsWithEnabledFeatures(
  permissions: string[],
  disabledFeatures: ReadonlySet<string>,
) {
  return permissions.filter((permission) => {
    const group = permissionGroups.get(permission);
    return !group || !featureKeys.has(group) || !disabledFeatures.has(group);
  });
}

const base: PermissionCode[] = ['dashboard.view'];
export const roleTemplates: { code: string; name: string; optional?: boolean; permissions: PermissionCode[] }[] = [
  { code: 'SUPER_ADMIN', name: 'Super Administrateur', permissions: ['platform.manage'] },
  {
    code: 'OWNER',
    name: 'Propriétaire',
    permissions: [
      ...groups.FOUNDATION,
      ...groups.RESERVATIONS,
      ...groups.FRONT_DESK,
      ...groups.CASHIER_OPERATIONS,
      ...groups.SHIFT_REPORTS,
      ...groups.ACCOUNTING,
      ...groups.SENSITIVE,
      ...groups.ROOMS,
      ...groups.HOUSEKEEPING,
      ...groups.RESTAURANT,
      ...groups.MAINTENANCE,
    ],
  },
  { code: 'GENERAL_MANAGER', name: 'Directeur Général', permissions: [...base, 'rooms.view', 'reservations.view', 'stays.view', 'reports.financial.view', 'approvals.view', 'approvals.decide', 'audit.view'] },
  { code: 'HOTEL_ADMIN', name: 'Administrateur Hôtel', permissions: ['dashboard.view', 'rooms.view'] },
  { code: 'RECEPTIONIST', name: 'Réceptionniste', permissions: [...base, ...groups.RESERVATIONS, 'rooms.view', 'rooms.block', 'rooms.release', ...groups.FRONT_DESK, ...groups.CASHIER_OPERATIONS, ...groups.SHIFT_REPORTS, 'restaurant.folio.transfer'] },
  { code: 'ACCOUNTANT', name: 'Comptable', permissions: [...base, ...groups.ACCOUNTING, 'invoices.view', 'payments.view'] },
  { code: 'GOUVERNANTE', name: 'Gouvernante', permissions: [...base, 'rooms.view', 'housekeeping.tasks.assign', 'housekeeping.rooms.inspect', 'housekeeping.agents.manage'] },
  { code: 'HOUSEKEEPER', name: "Agent d’entretien", permissions: [...base, 'housekeeping.tasks.execute'] },
  { code: 'RESTAURANT_MANAGER', name: 'Responsable Restaurant et Bar', permissions: [...base, ...groups.RESTAURANT] },
  { code: 'BAR_SERVER', name: 'Servant(e) du bar', permissions: [...base, 'restaurant.orders.manage'] },
  { code: 'MAINTENANCE_MANAGER', name: 'Responsable Maintenance', permissions: [...base, ...groups.MAINTENANCE] },
];
