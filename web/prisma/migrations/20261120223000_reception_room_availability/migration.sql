INSERT IGNORE INTO `Permission` (`code`, `group`)
VALUES ('rooms.block', 'ROOMS'), ('rooms.release', 'ROOMS');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT `Role`.`id`, `Permission`.`code`
FROM `Role`
JOIN `Permission` ON `Permission`.`code` IN ('rooms.block', 'rooms.release')
WHERE `Role`.`code` = 'RECEPTIONIST';
