ALTER TABLE `RestaurantOrder`
  DROP FOREIGN KEY `RestaurantOrder_reservationId_fkey`,
  DROP FOREIGN KEY `RestaurantOrder_roomId_fkey`;

ALTER TABLE `RestaurantOrder`
  MODIFY `reservationId` VARCHAR(191) NULL,
  MODIFY `roomId` VARCHAR(191) NULL;

ALTER TABLE `RestaurantOrder`
  ADD CONSTRAINT `RestaurantOrder_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `RestaurantOrder_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;