ALTER TABLE `Invoice`
    ADD COLUMN `payerName` VARCHAR(160) NULL;

INSERT INTO `PaymentMethod` (`id`, `code`, `name`, `active`)
VALUES
    (UUID(), 'AIRTEL_MONEY', 'Airtel Money', TRUE),
    (UUID(), 'MTN_MONEY', 'MTN Money', TRUE)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `active` = TRUE;
