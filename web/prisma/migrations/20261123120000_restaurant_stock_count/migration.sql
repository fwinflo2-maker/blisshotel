ALTER TABLE `RestaurantMenuItem`
  ADD COLUMN `stockQuantity` DECIMAL(10,2) NULL,
  ADD COLUMN `stockUnit` VARCHAR(30) NULL,
  ADD COLUMN `stockAlertAt` DECIMAL(10,2) NULL;

CREATE TABLE `RestaurantStockCount` (
  `id` VARCHAR(191) NOT NULL,
  `menuItemId` VARCHAR(191) NOT NULL,
  `countedBy` VARCHAR(191) NOT NULL,
  `countedByName` VARCHAR(160) NOT NULL,
  `previousQuantity` DECIMAL(10,2) NULL,
  `countedQuantity` DECIMAL(10,2) NOT NULL,
  `note` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RestaurantStockCount_menuItemId_createdAt_idx` (`menuItemId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RestaurantStockCount_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `RestaurantMenuItem` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
