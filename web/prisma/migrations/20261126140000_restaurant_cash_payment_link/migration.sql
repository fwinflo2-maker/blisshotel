ALTER TABLE `Payment`
  ADD COLUMN `restaurantOrderId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Payment_restaurantOrderId_key` (`restaurantOrderId`),
  ADD CONSTRAINT `Payment_restaurantOrderId_fkey` FOREIGN KEY (`restaurantOrderId`) REFERENCES `RestaurantOrder` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
