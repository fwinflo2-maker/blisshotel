ALTER TABLE `Room`
  ADD COLUMN `capacity` INTEGER NULL,
  ADD COLUMN `bedType` VARCHAR(100) NULL,
  ADD COLUMN `area` DECIMAL(8,2) NULL,
  ADD COLUMN `description` VARCHAR(2000) NULL,
  ADD COLUMN `observations` VARCHAR(2000) NULL,
  ADD COLUMN `equipment` JSON NULL,
  ADD COLUMN `photos` JSON NULL,
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `technicalStatus` ENUM('OPERATIONAL','INTERVENTION_REQUIRED','UNDER_MAINTENANCE','OUT_OF_SERVICE') NOT NULL DEFAULT 'OPERATIONAL';

ALTER TABLE `HousekeepingTask`
  ADD COLUMN `taskType` VARCHAR(40) NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `checklist` JSON NULL,
  ADD COLUMN `observation` VARCHAR(1000) NULL,
  ADD COLUMN `dueAt` DATETIME(3) NULL;

CREATE TABLE `RoomStatusHistory` (
  `id` VARCHAR(191) NOT NULL,
  `roomId` VARCHAR(191) NOT NULL,
  `dimension` VARCHAR(30) NOT NULL,
  `previousStatus` VARCHAR(50) NULL,
  `nextStatus` VARCHAR(50) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `source` VARCHAR(50) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RoomIncident` (
  `id` VARCHAR(191) NOT NULL,
  `roomId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `description` VARCHAR(1000) NULL,
  `status` ENUM('OPEN','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'OPEN',
  `reportedBy` VARCHAR(191) NOT NULL,
  `resolvedBy` VARCHAR(191) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RoomStatusHistory_roomId_createdAt_idx` ON `RoomStatusHistory`(`roomId`, `createdAt`);
CREATE INDEX `RoomStatusHistory_dimension_createdAt_idx` ON `RoomStatusHistory`(`dimension`, `createdAt`);
CREATE INDEX `RoomIncident_roomId_status_createdAt_idx` ON `RoomIncident`(`roomId`, `status`, `createdAt`);
CREATE INDEX `RoomIncident_status_createdAt_idx` ON `RoomIncident`(`status`, `createdAt`);

ALTER TABLE `RoomStatusHistory`
  ADD CONSTRAINT `RoomStatusHistory_roomId_fkey`
  FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `RoomIncident`
  ADD CONSTRAINT `RoomIncident_roomId_fkey`
  FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
