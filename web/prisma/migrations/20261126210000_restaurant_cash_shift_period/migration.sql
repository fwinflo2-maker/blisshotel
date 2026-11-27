ALTER TABLE `CashSession`
  ADD COLUMN `shiftType` ENUM('DAY', 'NIGHT') NULL,
  ADD COLUMN `shiftStartedAt` DATETIME(3) NULL,
  ADD COLUMN `shiftEndedAt` DATETIME(3) NULL;
