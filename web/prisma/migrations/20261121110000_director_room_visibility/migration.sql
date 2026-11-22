INSERT IGNORE INTO `Permission` (`code`, `group`)
VALUES ('rooms.view', 'ROOMS');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT `id`, 'rooms.view'
FROM `Role`
WHERE `code` = 'GENERAL_MANAGER';
