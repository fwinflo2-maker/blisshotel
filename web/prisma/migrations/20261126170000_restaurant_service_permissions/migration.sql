INSERT IGNORE INTO `Permission` (`code`, `group`) VALUES
  ('restaurant.stock.view', 'RESTAURANT'),
  ('restaurant.stock.count', 'RESTAURANT');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT role.`id`, permission.`code`
FROM `Role` role
JOIN `Permission` permission ON permission.`code` IN ('restaurant.stock.view', 'restaurant.stock.count')
WHERE role.`code` = 'BAR_SERVER';

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT role.`id`, permission.`code`
FROM `Role` role
JOIN `Permission` permission ON permission.`code` IN ('restaurant.menu.manage', 'restaurant.orders.manage', 'restaurant.folio.transfer', 'restaurant.stock.view', 'restaurant.stock.count', 'restaurant.stock.manage', 'restaurant.reports.view', 'restaurant.tables.manage')
WHERE role.`code` = 'RESTAURANT_MANAGER';

DELETE rolePermission
FROM `RolePermission` rolePermission
JOIN `Role` role ON role.`id` = rolePermission.`roleId`
WHERE role.`code` = 'BAR_SERVER'
  AND rolePermission.`permissionCode` IN ('restaurant.menu.manage', 'restaurant.stock.manage');
