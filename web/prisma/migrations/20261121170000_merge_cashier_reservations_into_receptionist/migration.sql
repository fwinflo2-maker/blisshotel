-- Reception staff owns reservation handling and personal cash sessions.
-- Preserve existing user accounts while consolidating both legacy profiles.
UPDATE `User` user
JOIN `Role` legacy ON legacy.`id` = user.`roleId`
JOIN `Role` receptionist ON receptionist.`key` = 'template:RECEPTIONIST'
SET user.`roleId` = receptionist.`id`
WHERE legacy.`code` IN ('CASHIER', 'RESERVATION_MANAGER');

UPDATE `User`
SET
  `name` = CASE `email`
    WHEN 'demo.caissier@blisshotel.test' THEN 'Réceptionniste caisse démo'
    WHEN 'demo.reservations@blisshotel.test' THEN 'Réceptionniste réservations démo'
    WHEN 'qa.caissier@blisshotel.test' THEN 'Réceptionniste QA · caisse'
    WHEN 'qa.reservations@blisshotel.test' THEN 'Réceptionniste QA · réservations'
    ELSE `name`
  END,
  `email` = CASE `email`
    WHEN 'demo.caissier@blisshotel.test' THEN 'demo.reception.caisse@blisshotel.test'
    WHEN 'demo.reservations@blisshotel.test' THEN 'demo.reception.reservations@blisshotel.test'
    WHEN 'qa.caissier@blisshotel.test' THEN 'qa.reception.caisse@blisshotel.test'
    WHEN 'qa.reservations@blisshotel.test' THEN 'qa.reception.reservations@blisshotel.test'
    ELSE `email`
  END
WHERE `email` IN (
  'demo.caissier@blisshotel.test', 'demo.reservations@blisshotel.test',
  'qa.caissier@blisshotel.test', 'qa.reservations@blisshotel.test'
);

DELETE FROM `RolePermission`
WHERE `roleId` IN (SELECT `id` FROM `Role` WHERE `code` IN ('CASHIER', 'RESERVATION_MANAGER'));

DELETE FROM `Role`
WHERE `code` IN ('CASHIER', 'RESERVATION_MANAGER');
