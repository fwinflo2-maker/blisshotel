-- Réservations sans chambre attribuée : la chambre devient facultative et
-- peut être attribuée plus tard, au check-in ou après confirmation.
ALTER TABLE `Reservation`
  DROP FOREIGN KEY `Reservation_roomId_fkey`;

ALTER TABLE `Reservation`
  MODIFY COLUMN `roomId` VARCHAR(191) NULL;

ALTER TABLE `Reservation`
  ADD CONSTRAINT `Reservation_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Paiements directs hors réservation : le folio devient facultatif et le
-- paiement est rattaché au client avec un libellé obligatoire.
ALTER TABLE `Payment`
  DROP FOREIGN KEY `Payment_folioId_fkey`;

ALTER TABLE `Payment`
  MODIFY COLUMN `folioId` VARCHAR(191) NULL,
  ADD COLUMN `clientId` VARCHAR(191) NULL,
  ADD COLUMN `description` VARCHAR(200) NULL;

CREATE INDEX `Payment_clientId_createdAt_idx` ON `Payment`(`clientId`, `createdAt`);

ALTER TABLE `Payment`
  ADD CONSTRAINT `Payment_folioId_fkey` FOREIGN KEY (`folioId`) REFERENCES `Folio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Payment_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
