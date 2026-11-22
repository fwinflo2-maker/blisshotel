CREATE TABLE `ReceptionShiftReport` (
    `id` VARCHAR(191) NOT NULL,
    `cashSessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `shiftType` ENUM('DAY', 'NIGHT') NOT NULL,
    `shiftDate` DATE NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NOT NULL,
    `summary` JSON NOT NULL,
    `incidentNotes` VARCHAR(2000) NULL,
    `handoverNotes` VARCHAR(2000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ReceptionShiftReport_cashSessionId_key` (`cashSessionId`),
    INDEX `ReceptionShiftReport_shiftDate_shiftType_idx` (`shiftDate`, `shiftType`),
    INDEX `ReceptionShiftReport_userId_startedAt_idx` (`userId`, `startedAt`),
    INDEX `ReceptionShiftReport_startedAt_idx` (`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReceptionShiftExpense` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `paymentMethodId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ReceptionShiftExpense_reportId_createdAt_idx` (`reportId`, `createdAt`),
    INDEX `ReceptionShiftExpense_paymentMethodId_createdAt_idx` (`paymentMethodId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ReceptionShiftReport`
    ADD CONSTRAINT `ReceptionShiftReport_cashSessionId_fkey`
    FOREIGN KEY (`cashSessionId`) REFERENCES `CashSession`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ReceptionShiftReport`
    ADD CONSTRAINT `ReceptionShiftReport_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ReceptionShiftExpense`
    ADD CONSTRAINT `ReceptionShiftExpense_reportId_fkey`
    FOREIGN KEY (`reportId`) REFERENCES `ReceptionShiftReport`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ReceptionShiftExpense`
    ADD CONSTRAINT `ReceptionShiftExpense_paymentMethodId_fkey`
    FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `Permission` (`code`, `group`)
VALUES ('shift_reports.view', 'SHIFT_REPORTS')
ON DUPLICATE KEY UPDATE `group` = VALUES(`group`);

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT `id`, 'shift_reports.view'
FROM `Role`
WHERE `code` IN ('OWNER', 'HOTEL_ADMIN', 'RECEPTIONIST');
