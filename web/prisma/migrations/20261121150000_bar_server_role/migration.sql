INSERT INTO `Role` (`id`, `key`, `code`, `name`, `optional`)
SELECT CONCAT('role-', LOWER(REPLACE(UUID(), '-', ''))), 'template:BAR_SERVER', 'BAR_SERVER', 'Servant(e) du bar', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Role` WHERE `key` = 'template:BAR_SERVER' OR `code` = 'BAR_SERVER');

INSERT IGNORE INTO `Permission` (`code`, `group`) VALUES ('dashboard.view', 'FOUNDATION');
INSERT IGNORE INTO `Permission` (`code`, `group`) VALUES ('restaurant.orders.manage', 'RESTAURANT');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT role.`id`, permission.`code`
FROM `Role` role
JOIN `Permission` permission ON permission.`code` IN ('dashboard.view', 'restaurant.orders.manage')
WHERE role.`key` = 'template:BAR_SERVER';
