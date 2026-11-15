CREATE TABLE "DomainEvent" ("id" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "gameId" TEXT NOT NULL, "lobbyCode" TEXT NOT NULL, "payload" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "DomainEvent_gameId_createdAt_idx" ON "DomainEvent"("gameId", "createdAt");
CREATE INDEX "DomainEvent_type_createdAt_idx" ON "DomainEvent"("type", "createdAt");
