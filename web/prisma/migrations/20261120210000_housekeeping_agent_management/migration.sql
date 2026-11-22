INSERT INTO `Permission` (`code`, `group`)
VALUES ('housekeeping.agents.manage', 'HOUSEKEEPING')
ON DUPLICATE KEY UPDATE `group` = VALUES(`group`);

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT `id`, 'housekeeping.agents.manage'
FROM `Role`
WHERE `code` = 'GOUVERNANTE';
