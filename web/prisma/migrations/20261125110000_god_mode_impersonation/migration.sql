ALTER TABLE `Session`
  ADD COLUMN `impersonatedById` VARCHAR(191) NULL,
  ADD INDEX `Session_impersonatedById_idx` (`impersonatedById`),
  ADD CONSTRAINT `Session_impersonatedById_fkey`
    FOREIGN KEY (`impersonatedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
