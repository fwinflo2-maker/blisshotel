ALTER TABLE `RestaurantMenuItem`
  ADD COLUMN `purchasePrice` DECIMAL(10,2) NULL,
  MODIFY `category` ENUM('FOOD','DRINK','BREAKFAST','SOFT_DRINK','JUICE','WATER','BEER','WINE','WHISKY','SPIRIT','COCKTAIL','STARTER','DESSERT','OTHER') NOT NULL;

ALTER TABLE `RestaurantOrderLine`
  MODIFY `category` ENUM('FOOD','DRINK','BREAKFAST','SOFT_DRINK','JUICE','WATER','BEER','WINE','WHISKY','SPIRIT','COCKTAIL','STARTER','DESSERT','OTHER') NOT NULL;

CREATE TABLE `RestaurantStockMovement` (
  `id` VARCHAR(191) NOT NULL,
  `menuItemId` VARCHAR(191) NOT NULL,
  `type` ENUM('SUPPLY','SALE','LOSS','INTERNAL_USE','ADJUSTMENT','COUNT','REVERSAL') NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL,
  `previousQuantity` DECIMAL(10,2) NULL,
  `resultingQuantity` DECIMAL(10,2) NULL,
  `reference` VARCHAR(100) NULL,
  `note` VARCHAR(500) NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdByName` VARCHAR(160) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RestaurantStockMovement_menuItemId_createdAt_idx` (`menuItemId`, `createdAt`),
  INDEX `RestaurantStockMovement_type_createdAt_idx` (`type`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RestaurantStockMovement_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `RestaurantMenuItem` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestaurantRecipeLine` (
  `id` VARCHAR(191) NOT NULL,
  `dishId` VARCHAR(191) NOT NULL,
  `ingredientId` VARCHAR(191) NOT NULL,
  `quantity` DECIMAL(10,3) NOT NULL,
  `ingredientUnit` VARCHAR(30) NOT NULL,
  UNIQUE INDEX `RestaurantRecipeLine_dishId_ingredientId_key` (`dishId`, `ingredientId`),
  INDEX `RestaurantRecipeLine_ingredientId_idx` (`ingredientId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RestaurantRecipeLine_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `RestaurantMenuItem` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RestaurantRecipeLine_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `RestaurantMenuItem` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestaurantTable` (
  `id` VARCHAR(191) NOT NULL,
  `number` VARCHAR(30) NOT NULL,
  `capacity` INTEGER NOT NULL,
  `status` ENUM('FREE','OCCUPIED','TO_CLEAN') NOT NULL DEFAULT 'FREE',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RestaurantTable_number_key` (`number`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RestaurantOrder`
  ADD COLUMN `tableId` VARCHAR(191) NULL,
  ADD INDEX `RestaurantOrder_tableId_idx` (`tableId`),
  ADD CONSTRAINT `RestaurantOrder_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `RestaurantTable` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `RestaurantPayment` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `paymentMethodId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `reference` VARCHAR(100) NULL,
  `receivedBy` VARCHAR(191) NOT NULL,
  `receivedByName` VARCHAR(160) NOT NULL,
  `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `RestaurantPayment_idempotencyKey_key` (`idempotencyKey`),
  INDEX `RestaurantPayment_orderId_confirmedAt_idx` (`orderId`, `confirmedAt`),
  INDEX `RestaurantPayment_paymentMethodId_confirmedAt_idx` (`paymentMethodId`, `confirmedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RestaurantPayment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `RestaurantOrder` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RestaurantPayment_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
