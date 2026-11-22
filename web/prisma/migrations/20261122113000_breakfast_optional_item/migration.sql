UPDATE `RestaurantMenuItem`
SET `name` = 'Petit-déjeuner à la carte',
    `description` = 'Portion facultative à commander à l’unité',
    `billingUnit` = 'ITEM'
WHERE `code` = 'BREAKFAST_ROOM_NIGHT';
