ALTER TABLE `RestaurantOrder`
  ADD COLUMN `paidAt` DATETIME(3) NULL,
  ADD COLUMN `paidBy` VARCHAR(191) NULL,
  ADD COLUMN `paidByName` VARCHAR(160) NULL,
  ADD COLUMN `paymentMethodId` VARCHAR(191) NULL,
  ADD INDEX `RestaurantOrder_paidAt_idx` (`paidAt`),
  ADD CONSTRAINT `RestaurantOrder_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
