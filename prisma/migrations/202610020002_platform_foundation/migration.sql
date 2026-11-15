CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT, "passwordHash" TEXT, "emailVerifiedAt" TIMESTAMP(3),
  "nickname" TEXT NOT NULL, "avatarPath" TEXT, "role" TEXT NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Template" (
  "id" TEXT NOT NULL, "ownerId" TEXT, "name" TEXT NOT NULL, "description" TEXT, "mediaType" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL, "thumbnailPath" TEXT, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[], "language" TEXT NOT NULL DEFAULT 'de', "rating" TEXT NOT NULL DEFAULT 'family',
  "nsfw" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Template_ownerId_active_idx" ON "Template"("ownerId", "active");
CREATE INDEX "Template_active_language_idx" ON "Template"("active", "language");

CREATE TABLE "TemplatePack" (
  "id" TEXT NOT NULL, "ownerId" TEXT, "name" TEXT NOT NULL, "description" TEXT, "coverPath" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false, "tags" TEXT[] DEFAULT ARRAY[]::TEXT[], "language" TEXT NOT NULL DEFAULT 'de',
  "ageRating" TEXT NOT NULL DEFAULT 'family', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TemplatePack_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TemplatePack_isPublic_language_idx" ON "TemplatePack"("isPublic", "language");
CREATE TABLE "TemplatePackItem" (
  "packId" TEXT NOT NULL, "templateId" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TemplatePackItem_pkey" PRIMARY KEY ("packId", "templateId")
);
CREATE INDEX "TemplatePackItem_templateId_idx" ON "TemplatePackItem"("templateId");

CREATE TABLE "LobbyPreset" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LobbyPreset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LobbyPreset_userId_name_key" ON "LobbyPreset"("userId", "name");

CREATE TABLE "Friendship" (
  "requesterId" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("requesterId", "recipientId")
);
CREATE INDEX "Friendship_recipientId_status_idx" ON "Friendship"("recipientId", "status");

CREATE TABLE "Report" (
  "id" TEXT NOT NULL, "reporterId" TEXT NOT NULL, "reportedUserId" TEXT, "lobbyCode" TEXT,
  "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3), CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_reportedUserId_createdAt_idx" ON "Report"("reportedUserId", "createdAt");
CREATE TABLE "UserMute" (
  "userId" TEXT NOT NULL, "mutedId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMute_pkey" PRIMARY KEY ("userId", "mutedId")
);

CREATE TABLE "GameHistory" (
  "id" TEXT NOT NULL, "lobbyCode" TEXT NOT NULL, "mode" TEXT NOT NULL, "config" JSONB NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GameHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GameHistory_mode_finishedAt_idx" ON "GameHistory"("mode", "finishedAt");
CREATE TABLE "GameResult" (
  "id" TEXT NOT NULL, "gameId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "nickname" TEXT NOT NULL,
  "score" INTEGER NOT NULL, "placement" INTEGER NOT NULL, CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameResult_gameId_playerId_key" ON "GameResult"("gameId", "playerId");
CREATE INDEX "GameResult_playerId_placement_idx" ON "GameResult"("playerId", "placement");

CREATE TABLE "PlayerStatistic" (
  "userId" TEXT NOT NULL, "gamesPlayed" INTEGER NOT NULL DEFAULT 0, "wins" INTEGER NOT NULL DEFAULT 0,
  "roundsPlayed" INTEGER NOT NULL DEFAULT 0, "memesCreated" INTEGER NOT NULL DEFAULT 0, "likesReceived" INTEGER NOT NULL DEFAULT 0,
  "dislikesReceived" INTEGER NOT NULL DEFAULT 0, "totalScore" INTEGER NOT NULL DEFAULT 0,
  "highestRoundScore" INTEGER NOT NULL DEFAULT 0, "buddyHits" INTEGER NOT NULL DEFAULT 0,
  "buddyAttempts" INTEGER NOT NULL DEFAULT 0, "favoriteMode" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerStatistic_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "Achievement" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Achievement_key_key" ON "Achievement"("key");
CREATE TABLE "UserAchievement" (
  "userId" TEXT NOT NULL, "achievementId" TEXT NOT NULL, "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId", "achievementId")
);

ALTER TABLE "Template" ADD CONSTRAINT "Template_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TemplatePack" ADD CONSTRAINT "TemplatePack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TemplatePackItem" ADD CONSTRAINT "TemplatePackItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TemplatePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplatePackItem" ADD CONSTRAINT "TemplatePackItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LobbyPreset" ADD CONSTRAINT "LobbyPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserMute" ADD CONSTRAINT "UserMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMute" ADD CONSTRAINT "UserMute_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerStatistic" ADD CONSTRAINT "PlayerStatistic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
