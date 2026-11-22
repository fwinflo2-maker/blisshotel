ALTER TABLE `HotelConfiguration`
    ADD COLUMN `checkInTime` VARCHAR(5) NULL,
    ADD COLUMN `checkOutTime` VARCHAR(5) NULL;

ALTER TABLE `RoomCategory` ADD COLUMN `siestaRate` DECIMAL(10, 2) NULL;

ALTER TABLE `Room`
    ADD COLUMN `housekeepingStatus` ENUM('CLEAN', 'TO_CLEAN', 'IN_PROGRESS', 'TO_INSPECT', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'CLEAN';

UPDATE `Room`
SET `housekeepingStatus` = CASE
    WHEN `status` = 'DIRTY' THEN 'TO_CLEAN'
    WHEN `status` = 'OUT_OF_SERVICE' THEN 'OUT_OF_SERVICE'
    ELSE 'CLEAN'
END;

ALTER TABLE `Client` ADD COLUMN `createdBy` VARCHAR(191) NULL;
ALTER TABLE `Client`
    ADD CONSTRAINT `Client_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Reservation`
    ADD COLUMN `stayType` ENUM('SIESTA', 'OVERNIGHT') NOT NULL DEFAULT 'OVERNIGHT',
    ADD COLUMN `plannedCheckInAt` DATETIME(3) NULL,
    ADD COLUMN `plannedCheckOutAt` DATETIME(3) NULL;

ALTER TABLE `Stay`
    ADD COLUMN `checkInRecordedAt` DATETIME(3) NULL,
    ADD COLUMN `expectedCheckOutAt` DATETIME(3) NULL,
    ADD COLUMN `checkOutRecordedAt` DATETIME(3) NULL;

UPDATE `Stay`
SET `checkInRecordedAt` = `checkedInAt`,
    `checkOutRecordedAt` = `checkedOutAt`;
