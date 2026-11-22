-- Remplace le rôle technique consolidé par le rôle métier Gouvernante.
INSERT INTO `Role` (`id`, `key`, `code`, `name`, `optional`)
SELECT
  CONCAT('role-', LOWER(REPLACE(UUID(), '-', ''))),
  'template:GOUVERNANTE',
  'GOUVERNANTE',
  'Gouvernante',
  0
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Role` WHERE `key` = 'template:GOUVERNANTE' OR `code` = 'GOUVERNANTE'
);

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT gouvernante.`id`, permission.`permissionCode`
FROM `Role` gouvernante
JOIN `RolePermission` permission
  ON permission.`roleId` = (
    SELECT legacy.`id`
    FROM `Role` legacy
    WHERE legacy.`code` = 'HOUSEKEEPING_MANAGER'
    LIMIT 1
  )
WHERE gouvernante.`key` = 'template:GOUVERNANTE';

DELETE FROM `RolePermission`
WHERE `roleId` IN (
  SELECT `id` FROM `Role` WHERE `code` = 'HOUSEKEEPING_MANAGER'
)
AND `permissionCode` IN ('housekeeping.tasks.assign', 'housekeeping.rooms.inspect');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT legacy.`id`, 'housekeeping.tasks.execute'
FROM `Role` legacy
WHERE legacy.`code` = 'HOUSEKEEPING_MANAGER';

UPDATE `User` user
JOIN `Role` legacy ON legacy.`id` = user.`roleId` AND legacy.`code` = 'HOUSEKEEPING_MANAGER'
JOIN `Role` gouvernante ON gouvernante.`key` = 'template:GOUVERNANTE'
SET user.`roleId` = gouvernante.`id`;

DELETE FROM `RolePermission`
WHERE `roleId` IN (
  SELECT `id` FROM `Role` WHERE `code` = 'HOUSEKEEPING_MANAGER'
);
DELETE FROM `Role` WHERE `code` = 'HOUSEKEEPING_MANAGER';
