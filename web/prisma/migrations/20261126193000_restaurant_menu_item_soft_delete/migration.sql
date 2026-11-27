ALTER TABLE `RestaurantMenuItem`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD INDEX `RestaurantMenuItem_deletedAt_active_category_idx` (`deletedAt`, `active`, `category`);
