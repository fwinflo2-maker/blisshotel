DELETE FROM `Session`
WHERE `userId` IN (
    SELECT `id` FROM `User`
    WHERE `roleId` IN (SELECT `id` FROM `Role` WHERE `code` = 'GUEST')
);

UPDATE `User`
SET `roleId` = NULL
WHERE `roleId` IN (SELECT `id` FROM `Role` WHERE `code` = 'GUEST');

DELETE FROM `RolePermission`
WHERE `roleId` IN (SELECT `id` FROM `Role` WHERE `code` = 'GUEST')
   OR `permissionCode` IN ('guest.reservations.own', 'guest.documents.own');

DELETE FROM `Role` WHERE `code` = 'GUEST';
DELETE FROM `Permission` WHERE `code` IN ('guest.reservations.own', 'guest.documents.own');
DELETE FROM `PlatformFeature` WHERE `key` = 'GUEST';
