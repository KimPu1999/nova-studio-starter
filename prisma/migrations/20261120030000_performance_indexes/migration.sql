-- Supports public blog queries that filter publication state and schedule
-- before ordering by the publication date.
CREATE INDEX IF NOT EXISTS "BlogPost_status_scheduledAt_publishedAt_idx"
ON "BlogPost"("status", "scheduledAt", "publishedAt");
