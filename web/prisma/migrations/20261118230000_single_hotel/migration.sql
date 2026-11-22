CREATE TABLE `_single_hotel_guard` (
    `valid` BOOLEAN NOT NULL,
    CONSTRAINT `_single_hotel_guard_valid_check` CHECK (`valid` = true)
);

INSERT INTO `_single_hotel_guard` (`valid`)
SELECT CASE
    WHEN (SELECT COUNT(*) FROM `Property`) = 0
      AND (SELECT COUNT(*) FROM `Organization`) = 0
      AND (SELECT COUNT(*) FROM `Membership`) = 0
      AND NOT EXISTS (SELECT 1 FROM `User` WHERE `organizationId` IS NOT NULL)
      AND NOT EXISTS (
          SELECT 1 FROM `AuditLog`
          WHERE `propertyId` IS NOT NULL OR `organizationId` IS NOT NULL
      )
    THEN true
    WHEN (SELECT COUNT(*) FROM `Property`) = 1
      AND (SELECT COUNT(*) FROM `Organization`) = 1
      AND (SELECT COUNT(*) FROM `Membership` WHERE `propertyId` <> (SELECT `id` FROM `Property` LIMIT 1)) = 0
      AND NOT EXISTS (SELECT 1 FROM `Property` WHERE CHAR_LENGTH(`timezone`) > 64)
      AND EXISTS (
          SELECT 1
          FROM `Property` p
          JOIN `Organization` o ON o.`id` = p.`organizationId`
          WHERE p.`name` = 'BLISS HOTEL'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM `User` u
          WHERE u.`organizationId` IS NOT NULL
            AND u.`organizationId` <> (SELECT `organizationId` FROM `Property` LIMIT 1)
      )
      AND NOT EXISTS (
          SELECT 1 FROM `AuditLog`
          WHERE (`propertyId` IS NOT NULL AND `propertyId` <> (SELECT `id` FROM `Property` LIMIT 1))
             OR (`organizationId` IS NOT NULL AND `organizationId` <> (SELECT `organizationId` FROM `Property` LIMIT 1))
      )
    THEN true
    ELSE false
END;

DROP TABLE `_single_hotel_guard`;

CREATE TABLE `HotelConfiguration` (
    `id` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `name` VARCHAR(160) NOT NULL DEFAULT 'BLISS HOTEL',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `currency` CHAR(3) NOT NULL DEFAULT 'EUR',
    `allowCheckoutWithBalance` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `HotelConfiguration` (`id`, `name`, `timezone`, `currency`, `allowCheckoutWithBalance`, `updatedAt`)
SELECT 1, 'BLISS HOTEL', COALESCE(p.`timezone`, 'UTC'), COALESCE(p.`currency`, 'EUR'),
       COALESCE(p.`allowCheckoutWithBalance`, false), CURRENT_TIMESTAMP(3)
FROM (SELECT 1) AS seed
LEFT JOIN `Property` p ON p.`name` = 'BLISS HOTEL';

ALTER TABLE `User` ADD COLUMN `roleId` VARCHAR(191) NULL;

UPDATE `User` u
LEFT JOIN `Membership` m ON m.`userId` = u.`id`
LEFT JOIN `Property` p ON p.`id` = m.`propertyId`
LEFT JOIN `Organization` o ON o.`id` = p.`organizationId`
SET u.`roleId` = m.`roleId`,
    u.`active` = CASE
        WHEN u.`platformAdmin` OR m.`id` IS NULL THEN u.`active`
        WHEN m.`active` AND p.`active` AND o.`active` THEN u.`active`
        ELSE false
    END;

UPDATE `CashSession`
SET `activeKey` = `userId`
WHERE `status` = 'OPEN';

DELETE rp
FROM `RolePermission` rp
JOIN `Permission` p ON p.`code` = rp.`permissionCode`
WHERE p.`code` IN ('properties.view', 'properties.manage');
DELETE FROM `Permission` WHERE `code` IN ('properties.view', 'properties.manage');

ALTER TABLE `Property` DROP FOREIGN KEY `Property_organizationId_fkey`;
ALTER TABLE `User` DROP FOREIGN KEY `User_organizationId_fkey`;
ALTER TABLE `Membership` DROP FOREIGN KEY `Membership_userId_fkey`;
ALTER TABLE `Membership` DROP FOREIGN KEY `Membership_propertyId_fkey`;
ALTER TABLE `Membership` DROP FOREIGN KEY `Membership_roleId_fkey`;
ALTER TABLE `Role` DROP FOREIGN KEY `Role_propertyId_fkey`;
ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_propertyId_fkey`;
ALTER TABLE `RoomCategory` DROP FOREIGN KEY `RoomCategory_propertyId_fkey`;
ALTER TABLE `Room` DROP FOREIGN KEY `Room_propertyId_fkey`;
ALTER TABLE `Client` DROP FOREIGN KEY `Client_propertyId_fkey`;
ALTER TABLE `Reservation` DROP FOREIGN KEY `Reservation_propertyId_fkey`;
ALTER TABLE `Stay` DROP FOREIGN KEY `Stay_propertyId_fkey`;
ALTER TABLE `Folio` DROP FOREIGN KEY `Folio_propertyId_fkey`;
ALTER TABLE `Invoice` DROP FOREIGN KEY `Invoice_propertyId_fkey`;
ALTER TABLE `PaymentMethod` DROP FOREIGN KEY `PaymentMethod_propertyId_fkey`;
ALTER TABLE `CashSession` DROP FOREIGN KEY `CashSession_propertyId_fkey`;
ALTER TABLE `Payment` DROP FOREIGN KEY `Payment_propertyId_fkey`;
ALTER TABLE `HousekeepingTask` DROP FOREIGN KEY `HousekeepingTask_propertyId_fkey`;

ALTER TABLE `User` DROP COLUMN `organizationId`;
ALTER TABLE `User` ADD INDEX `User_roleId_idx` (`roleId`);
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX `Membership_propertyId_active_idx` ON `Membership`;
DROP INDEX `Membership_roleId_idx` ON `Membership`;
DROP INDEX `Membership_userId_propertyId_key` ON `Membership`;
DROP TABLE `Membership`;

ALTER TABLE `Role` DROP INDEX `Role_propertyId_code_key`;
ALTER TABLE `Role` DROP COLUMN `propertyId`;
ALTER TABLE `Role` ADD INDEX `Role_code_idx` (`code`);

DROP INDEX `AuditLog_propertyId_createdAt_idx` ON `AuditLog`;
DROP INDEX `AuditLog_organizationId_createdAt_idx` ON `AuditLog`;
ALTER TABLE `AuditLog` DROP COLUMN `propertyId`, DROP COLUMN `organizationId`;
ALTER TABLE `AuditLog` ADD INDEX `AuditLog_createdAt_idx` (`createdAt`);

ALTER TABLE `Notification` ADD INDEX `Notification_userId_createdAt_idx` (`userId`, `createdAt`);
DROP INDEX `Notification_userId_propertyId_createdAt_idx` ON `Notification`;
ALTER TABLE `Notification` DROP COLUMN `propertyId`;

DROP INDEX `RoomCategory_propertyId_active_idx` ON `RoomCategory`;
DROP INDEX `RoomCategory_propertyId_name_key` ON `RoomCategory`;
ALTER TABLE `RoomCategory` DROP COLUMN `propertyId`;
ALTER TABLE `RoomCategory` ADD UNIQUE INDEX `RoomCategory_name_key` (`name`);
ALTER TABLE `RoomCategory` ADD INDEX `RoomCategory_active_idx` (`active`);

DROP INDEX `Room_propertyId_status_idx` ON `Room`;
DROP INDEX `Room_propertyId_number_key` ON `Room`;
ALTER TABLE `Room` DROP COLUMN `propertyId`;
ALTER TABLE `Room` ADD UNIQUE INDEX `Room_number_key` (`number`);
ALTER TABLE `Room` ADD INDEX `Room_status_idx` (`status`);

DROP INDEX `Client_propertyId_name_idx` ON `Client`;
DROP INDEX `Client_propertyId_phone_idx` ON `Client`;
ALTER TABLE `Client` DROP COLUMN `propertyId`;
ALTER TABLE `Client` ADD INDEX `Client_name_idx` (`name`);
ALTER TABLE `Client` ADD INDEX `Client_phone_idx` (`phone`);

DROP INDEX `Reservation_propertyId_status_checkInDate_idx` ON `Reservation`;
DROP INDEX `Reservation_propertyId_reference_key` ON `Reservation`;
DROP INDEX `Reservation_propertyId_idempotencyKey_key` ON `Reservation`;
ALTER TABLE `Reservation` DROP COLUMN `propertyId`;
ALTER TABLE `Reservation` ADD UNIQUE INDEX `Reservation_reference_key` (`reference`);
ALTER TABLE `Reservation` ADD UNIQUE INDEX `Reservation_idempotencyKey_key` (`idempotencyKey`);
ALTER TABLE `Reservation` ADD INDEX `Reservation_status_checkInDate_idx` (`status`, `checkInDate`);

DROP INDEX `Stay_propertyId_checkedInAt_checkedOutAt_idx` ON `Stay`;
ALTER TABLE `Stay` DROP COLUMN `propertyId`;
ALTER TABLE `Stay` ADD INDEX `Stay_checkedInAt_checkedOutAt_idx` (`checkedInAt`, `checkedOutAt`);

DROP INDEX `Folio_propertyId_status_createdAt_idx` ON `Folio`;
ALTER TABLE `Folio` DROP COLUMN `propertyId`;
ALTER TABLE `Folio` ADD INDEX `Folio_status_createdAt_idx` (`status`, `createdAt`);

DROP INDEX `Invoice_propertyId_issuedAt_idx` ON `Invoice`;
DROP INDEX `Invoice_propertyId_number_key` ON `Invoice`;
ALTER TABLE `Invoice` DROP COLUMN `propertyId`;
ALTER TABLE `Invoice` ADD UNIQUE INDEX `Invoice_number_key` (`number`);
ALTER TABLE `Invoice` ADD INDEX `Invoice_issuedAt_idx` (`issuedAt`);

DROP INDEX `PaymentMethod_propertyId_active_idx` ON `PaymentMethod`;
DROP INDEX `PaymentMethod_propertyId_code_key` ON `PaymentMethod`;
ALTER TABLE `PaymentMethod` DROP COLUMN `propertyId`;
ALTER TABLE `PaymentMethod` ADD UNIQUE INDEX `PaymentMethod_code_key` (`code`);
ALTER TABLE `PaymentMethod` ADD INDEX `PaymentMethod_active_idx` (`active`);

DROP INDEX `CashSession_propertyId_userId_status_idx` ON `CashSession`;
ALTER TABLE `CashSession` DROP COLUMN `propertyId`;
ALTER TABLE `CashSession` ADD INDEX `CashSession_userId_status_idx` (`userId`, `status`);

DROP INDEX `Payment_propertyId_createdAt_idx` ON `Payment`;
ALTER TABLE `Payment` DROP COLUMN `propertyId`;
ALTER TABLE `Payment` ADD INDEX `Payment_createdAt_idx` (`createdAt`);

DROP INDEX `HousekeepingTask_propertyId_status_createdAt_idx` ON `HousekeepingTask`;
ALTER TABLE `HousekeepingTask` DROP COLUMN `propertyId`;
ALTER TABLE `HousekeepingTask` ADD INDEX `HousekeepingTask_status_createdAt_idx` (`status`, `createdAt`);

DROP TABLE `Property`;
DROP TABLE `Organization`;
