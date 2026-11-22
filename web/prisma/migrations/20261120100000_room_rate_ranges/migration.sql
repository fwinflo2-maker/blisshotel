ALTER TABLE `Room`
  ADD COLUMN `nightlyRateMin` DECIMAL(10, 2) NULL,
  ADD COLUMN `nightlyRateMax` DECIMAL(10, 2) NULL;

ALTER TABLE `Reservation`
  ADD COLUMN `rateReason` VARCHAR(500) NULL;

UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 40000 WHERE `number` = '101';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '106';
UPDATE `Room` SET `nightlyRateMin` = 20000, `nightlyRateMax` = 20000 WHERE `number` = '107';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 35000 WHERE `number` = '201';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '203';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '205';
UPDATE `Room` SET `nightlyRateMin` = 20000, `nightlyRateMax` = 30000 WHERE `number` = '206';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '207';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '208';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 35000 WHERE `number` = '301';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '302';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 40000 WHERE `number` = '303';
UPDATE `Room` SET `nightlyRateMin` = 20000, `nightlyRateMax` = 25000 WHERE `number` = '304';
UPDATE `Room` SET `nightlyRateMin` = 35000, `nightlyRateMax` = 40000 WHERE `number` = '305';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 35000 WHERE `number` = '306';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 35000 WHERE `number` = '307';
UPDATE `Room` SET `nightlyRateMin` = 25000, `nightlyRateMax` = 30000 WHERE `number` = '308';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 40000 WHERE `number` = '401';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 35000 WHERE `number` = '402';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 40000 WHERE `number` = '403';
UPDATE `Room` SET `nightlyRateMin` = 20000, `nightlyRateMax` = 25000 WHERE `number` = '404';
UPDATE `Room` SET `nightlyRateMin` = 35000, `nightlyRateMax` = 40000 WHERE `number` = '405';
UPDATE `Room` SET `nightlyRateMin` = 30000, `nightlyRateMax` = 35000 WHERE `number` = '406';
UPDATE `Room` SET `nightlyRateMin` = 50000, `nightlyRateMax` = 80000 WHERE `number` = '440';
