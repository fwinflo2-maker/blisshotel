ALTER TABLE `HotelConfiguration`
  ALTER COLUMN `currency` SET DEFAULT 'XAF';

UPDATE `HotelConfiguration`
SET `currency` = 'XAF'
WHERE `id` = 1;
