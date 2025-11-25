-- CreateIndex
CREATE INDEX "Session_accessToken_idx" ON "Session"("accessToken");

-- CreateIndex
CREATE INDEX "Session_refreshToken_idx" ON "Session"("refreshToken");
