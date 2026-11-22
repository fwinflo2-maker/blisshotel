-- AlterTable : scan de la pièce d'identité conservé dans la fiche client.
ALTER TABLE `client`
    ADD COLUMN `idDocumentName` VARCHAR(160) NULL,
    ADD COLUMN `idDocumentMime` VARCHAR(60) NULL,
    ADD COLUMN `idDocumentSize` INTEGER NULL,
    ADD COLUMN `idDocumentData` MEDIUMBLOB NULL,
    ADD COLUMN `idDocumentUploadedAt` DATETIME(3) NULL,
    ADD COLUMN `idDocumentUploadedBy` VARCHAR(160) NULL;
