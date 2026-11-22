CREATE TABLE `RestaurantMenuItem` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(60) NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` VARCHAR(500) NULL,
  `category` ENUM('FOOD', 'DRINK', 'BREAKFAST') NOT NULL,
  `billingUnit` ENUM('ITEM', 'ROOM_NIGHT') NOT NULL DEFAULT 'ITEM',
  `price` DECIMAL(10,2) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RestaurantMenuItem_code_key` (`code`),
  INDEX `RestaurantMenuItem_active_category_name_idx` (`active`, `category`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestaurantOrder` (
  `id` VARCHAR(191) NOT NULL,
  `number` VARCHAR(40) NOT NULL,
  `source` ENUM('ROOM_SERVICE', 'RESTAURANT') NOT NULL,
  `status` ENUM('PENDING_RECEPTION', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_RECEPTION',
  `reservationId` VARCHAR(191) NOT NULL,
  `roomId` VARCHAR(191) NOT NULL,
  `guestName` VARCHAR(160) NOT NULL,
  `notes` VARCHAR(500) NULL,
  `totalAmount` DECIMAL(10,2) NOT NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdByName` VARCHAR(160) NOT NULL,
  `confirmedBy` VARCHAR(191) NULL,
  `confirmedByName` VARCHAR(160) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `rejectedBy` VARCHAR(191) NULL,
  `rejectedByName` VARCHAR(160) NULL,
  `rejectedAt` DATETIME(3) NULL,
  `preparedAt` DATETIME(3) NULL,
  `readyAt` DATETIME(3) NULL,
  `servedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RestaurantOrder_number_key` (`number`),
  INDEX `RestaurantOrder_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `RestaurantOrder_reservationId_createdAt_idx` (`reservationId`, `createdAt`),
  INDEX `RestaurantOrder_roomId_createdAt_idx` (`roomId`, `createdAt`),
  INDEX `RestaurantOrder_confirmedAt_idx` (`confirmedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RestaurantOrder_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RestaurantOrder_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RestaurantOrderLine` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `menuItemId` VARCHAR(191) NULL,
  `name` VARCHAR(160) NOT NULL,
  `category` ENUM('FOOD', 'DRINK', 'BREAKFAST') NOT NULL,
  `billingUnit` ENUM('ITEM', 'ROOM_NIGHT') NOT NULL,
  `quantity` INTEGER NOT NULL,
  `unitPrice` DECIMAL(10,2) NOT NULL,
  `lineTotal` DECIMAL(10,2) NOT NULL,
  INDEX `RestaurantOrderLine_orderId_idx` (`orderId`),
  INDEX `RestaurantOrderLine_menuItemId_idx` (`menuItemId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RestaurantOrderLine_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `RestaurantOrder` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RestaurantOrderLine_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `RestaurantMenuItem` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FolioLine`
  ADD COLUMN `restaurantOrderId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `FolioLine_restaurantOrderId_key` (`restaurantOrderId`),
  ADD CONSTRAINT `FolioLine_restaurantOrderId_fkey` FOREIGN KEY (`restaurantOrderId`) REFERENCES `RestaurantOrder` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT IGNORE INTO `Permission` (`code`, `group`) VALUES ('restaurant.folio.transfer', 'RESTAURANT');
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT `id`, 'restaurant.folio.transfer' FROM `Role` WHERE `key` = 'template:RECEPTIONIST';
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT `id`, 'restaurant.folio.transfer' FROM `Role` WHERE `code` = 'RECEPTIONIST';

INSERT INTO `RestaurantMenuItem` (`id`, `code`, `name`, `description`, `category`, `billingUnit`, `price`, `active`, `updatedAt`)
VALUES ('restaurant-breakfast-room-night', 'BREAKFAST_ROOM_NIGHT', 'Petit-déjeuner à la carte', 'Portion facultative à commander à l’unité', 'BREAKFAST', 'ITEM', 5000.00, true, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);
