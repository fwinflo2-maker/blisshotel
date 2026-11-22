ALTER TABLE `HousekeepingTask`
    ADD COLUMN `title` VARCHAR(160) NOT NULL DEFAULT 'Entretien chambre',
    ADD COLUMN `notes` VARCHAR(500) NULL,
    ADD COLUMN `assignedTo` VARCHAR(191) NULL,
    ADD COLUMN `activeRoomId` VARCHAR(191) NULL,
    ADD COLUMN `startedAt` DATETIME(3) NULL,
    ADD COLUMN `readyForInspectionAt` DATETIME(3) NULL,
    ADD COLUMN `inspectedBy` VARCHAR(191) NULL,
    ADD COLUMN `inspectedAt` DATETIME(3) NULL,
    ADD COLUMN `inspectionNote` VARCHAR(500) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE UNIQUE INDEX `HousekeepingTask_activeRoomId_key`
    ON `HousekeepingTask`(`activeRoomId`);

CREATE INDEX `HousekeepingTask_assignedTo_status_createdAt_idx`
    ON `HousekeepingTask`(`assignedTo`, `status`, `createdAt`);

ALTER TABLE `HousekeepingTask`
    ADD CONSTRAINT `HousekeepingTask_assignedTo_fkey`
        FOREIGN KEY (`assignedTo`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `HousekeepingTask_inspectedBy_fkey`
        FOREIGN KEY (`inspectedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
