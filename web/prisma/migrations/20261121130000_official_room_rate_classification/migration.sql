-- Official overnight rate bands supplied for the single BLISS HOTEL inventory.
-- Day-stay pricing remains separate and is not changed by this migration.
UPDATE `Room`
SET
  `nightlyRateMin` = CASE
    WHEN `number` = '107' THEN 20000
    WHEN `number` = '202' THEN NULL
    WHEN `number` IN ('304', '404', '206') THEN 20000
    WHEN `number` IN ('106', '203', '205', '207', '208', '302', '308', '201') THEN 25000
    WHEN `number` IN ('301', '306', '307', '402', '406', '101', '303', '401', '403') THEN 30000
    WHEN `number` IN ('305', '405') THEN 35000
    WHEN `number` = '440' THEN 50000
    ELSE `nightlyRateMin`
  END,
  `nightlyRateMax` = CASE
    WHEN `number` = '107' THEN 20000
    WHEN `number` IN ('304', '404') THEN 25000
    WHEN `number` = '206' THEN 30000
    WHEN `number` IN ('106', '203', '205', '207', '208', '302', '308') THEN 30000
    WHEN `number` = '201' THEN 35000
    WHEN `number` IN ('301', '306', '307', '402', '406') THEN 35000
    WHEN `number` IN ('101', '303', '401', '403') THEN 40000
    WHEN `number` IN ('305', '405') THEN 40000
    WHEN `number` = '440' THEN 80000
    WHEN `number` = '202' THEN NULL
    ELSE `nightlyRateMax`
  END
WHERE `number` IN ('101','106','107','201','202','203','205','206','207','208','301','302','303','304','305','306','307','308','401','402','403','404','405','406','440');
