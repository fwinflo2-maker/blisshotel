-- Move legacy Governess users to the Housekeeping manager role without deleting
-- users, sessions, audit history, or task attribution.
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT manager.`id`, permission.`permissionCode`
FROM `Role` legacy
JOIN `RolePermission` permission ON permission.`roleId` = legacy.`id`
JOIN `Role` manager ON manager.`key` = 'template:HOUSEKEEPING_MANAGER'
WHERE legacy.`code` = 'GOUVERNANTE';

DELETE managerPermission
FROM `RolePermission` managerPermission
JOIN `Role` manager ON manager.`id` = managerPermission.`roleId`
WHERE manager.`key` = 'template:HOUSEKEEPING_MANAGER'
  AND managerPermission.`permissionCode` = 'housekeeping.tasks.execute';

UPDATE `User` user
JOIN `Role` legacy ON legacy.`id` = user.`roleId` AND legacy.`code` = 'GOUVERNANTE'
JOIN `Role` manager ON manager.`key` = 'template:HOUSEKEEPING_MANAGER'
SET user.`roleId` = manager.`id`;

DELETE FROM `RolePermission`
WHERE `permissionCode` = 'users.create.gouvernante';
DELETE FROM `Permission` WHERE `code` = 'users.create.gouvernante';

DELETE rolePermission
FROM `RolePermission` rolePermission
JOIN `Role` legacy ON legacy.`id` = rolePermission.`roleId`
WHERE legacy.`code` = 'GOUVERNANTE';
DELETE FROM `Role` WHERE `code` = 'GOUVERNANTE';
