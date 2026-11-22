ALTER TABLE `Room`
  ADD COLUMN `assignedHotelAdminId` VARCHAR(191) NULL,
  ADD INDEX `Room_assignedHotelAdminId_idx` (`assignedHotelAdminId`),
  ADD CONSTRAINT `Room_assignedHotelAdminId_fkey`
    FOREIGN KEY (`assignedHotelAdminId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
