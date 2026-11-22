CREATE TABLE `UserPermission` (
  `userId` VARCHAR(191) NOT NULL,
  `permissionCode` VARCHAR(100) NOT NULL,
  `grantedById` VARCHAR(191) NULL,
  `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `permissionCode`),
  INDEX `UserPermission_permissionCode_userId_idx` (`permissionCode`, `userId`),
  CONSTRAINT `UserPermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserPermission_permissionCode_fkey` FOREIGN KEY (`permissionCode`) REFERENCES `Permission` (`code`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `Permission` (`code`, `group`) VALUES
  ('rooms.rates.view', 'ROOMS'),
  ('housekeeping.tasks.view', 'HOUSEKEEPING'),
  ('maintenance.view', 'MAINTENANCE'),
  ('maintenance.incidents.report', 'MAINTENANCE');

DELETE FROM `RolePermission`
WHERE `roleId` = (SELECT `id` FROM `Role` WHERE `code` = 'HOTEL_ADMIN' LIMIT 1);

INSERT INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT r.`id`, p.`code`
FROM `Role` r
JOIN `Permission` p ON p.`code` IN ('dashboard.view', 'rooms.view')
WHERE r.`code` = 'HOTEL_ADMIN';
