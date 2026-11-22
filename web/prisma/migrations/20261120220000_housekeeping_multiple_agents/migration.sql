CREATE TABLE `HousekeepingTaskAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `HousekeepingTaskAssignment_taskId_agentId_key` (`taskId`, `agentId`),
  INDEX `HousekeepingTaskAssignment_agentId_createdAt_idx` (`agentId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `HousekeepingTaskAssignment` (`id`, `taskId`, `agentId`, `createdAt`)
SELECT CONCAT('legacy_', SUBSTRING(MD5(CONCAT(`id`, `assignedTo`)), 1, 24)), `id`, `assignedTo`, `createdAt`
FROM `HousekeepingTask`
WHERE `assignedTo` IS NOT NULL;

ALTER TABLE `HousekeepingTaskAssignment`
  ADD CONSTRAINT `HousekeepingTaskAssignment_taskId_fkey`
    FOREIGN KEY (`taskId`) REFERENCES `HousekeepingTask` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `HousekeepingTaskAssignment_agentId_fkey`
    FOREIGN KEY (`agentId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
