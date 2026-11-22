-- The hotel OWNER role is the full hotel-management administrator, but it
-- must never receive the platform.manage capability reserved for Super Admin.
DELETE rp
FROM `RolePermission` rp
INNER JOIN `Role` r ON r.id = rp.roleId
WHERE r.code = 'OWNER';

INSERT INTO `RolePermission` (`roleId`, `permissionCode`)
SELECT r.id, p.code
FROM `Role` r
CROSS JOIN `Permission` p
WHERE r.code = 'OWNER'
  AND p.code <> 'platform.manage';
