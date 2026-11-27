CREATE TABLE `CurrencyRate` (
    `currency` CHAR(3) NOT NULL,
    `xafPerUnit` DECIMAL(16, 6) NOT NULL,
    `effectiveAt` DATETIME(3) NOT NULL,
    `source` VARCHAR(60) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`currency`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Reservation`
    ADD COLUMN `inputNightlyRate` DECIMAL(10, 2) NULL,
    ADD COLUMN `inputCurrency` CHAR(3) NULL;

UPDATE `Reservation`
SET `inputNightlyRate` = `nightlyRate`, `inputCurrency` = 'XAF';

ALTER TABLE `Payment`
    ADD COLUMN `inputAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `inputCurrency` CHAR(3) NULL;

UPDATE `Payment`
SET `inputAmount` = `amount`, `inputCurrency` = 'XAF';

INSERT INTO `PaymentMethod` (`id`, `code`, `name`, `active`)
VALUES
    ('payment-method-mtn-money', 'MTN_MONEY', 'MTN Money', TRUE),
    ('payment-method-airtel-money', 'AIRTEL_MONEY', 'Airtel Money', TRUE),
    ('payment-method-cash', 'CASH', 'Cash', TRUE)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `active` = TRUE;
