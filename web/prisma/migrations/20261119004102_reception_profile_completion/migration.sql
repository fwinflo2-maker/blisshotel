-- AlterTable
ALTER TABLE `client` ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `createdByName` VARCHAR(160) NULL,
    ADD COLUMN `idNumber` VARCHAR(80) NULL,
    ADD COLUMN `idType` VARCHAR(40) NULL,
    ADD COLUMN `nationality` VARCHAR(80) NULL,
    ADD COLUMN `notes` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `reservation` ADD COLUMN `createdByName` VARCHAR(160) NULL;

-- CreateIndex
CREATE INDEX `AuditLog_actorId_createdAt_idx` ON `AuditLog`(`actorId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: historical creator display names (never overwritten afterwards).
UPDATE `Reservation` r
JOIN `User` u ON u.id = r.createdBy
SET r.createdByName = u.name;

UPDATE `Client` c
JOIN `User` u ON u.id = c.createdBy
SET c.createdByName = u.name;
