-- CreateTable
CREATE TABLE `PlatformFeature` (
    `key` VARCHAR(100) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    INDEX `PlatformFeature_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Keep room visibility governed by the room module, independent from reservations.
UPDATE `Permission` SET `group` = 'ROOMS' WHERE `code` = 'rooms.view';
