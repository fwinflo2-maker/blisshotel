CREATE TABLE `ChatConversation` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(120) NULL,
  `isGroup` BOOLEAN NOT NULL DEFAULT false,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `ChatConversation_updatedAt_idx` (`updatedAt`),
  INDEX `ChatConversation_createdById_idx` (`createdById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatParticipant` (
  `id` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` ENUM('ACCEPTED', 'INVITED', 'DECLINED') NOT NULL DEFAULT 'ACCEPTED',
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastReadAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChatParticipant_conversationId_userId_key` (`conversationId`, `userId`),
  INDEX `ChatParticipant_userId_status_idx` (`userId`, `status`),
  CONSTRAINT `ChatParticipant_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ChatParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatMessage` (
  `id` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `senderId` VARCHAR(191) NOT NULL,
  `body` VARCHAR(4000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ChatMessage_conversationId_createdAt_idx` (`conversationId`, `createdAt`),
  INDEX `ChatMessage_senderId_createdAt_idx` (`senderId`, `createdAt`),
  CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ChatMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
