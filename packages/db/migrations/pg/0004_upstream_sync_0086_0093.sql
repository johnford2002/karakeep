CREATE TABLE "chatMessages" (
	"id" text PRIMARY KEY NOT NULL,
	"chatId" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatSessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"modifiedAt" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "bookmarkTags_userId_idx";--> statement-breakpoint
DROP INDEX "bookmarks_userId_idx";--> statement-breakpoint
DROP INDEX "bookmarks_createdAt_idx";--> statement-breakpoint
DROP INDEX "bookmarks_userId_createdAt_id_idx";--> statement-breakpoint
DROP INDEX "bookmarks_userId_archived_createdAt_id_idx";--> statement-breakpoint
DROP INDEX "bookmarks_userId_favourited_createdAt_id_idx";--> statement-breakpoint
DROP INDEX "bookmarksInLists_bookmarkId_idx";--> statement-breakpoint
DROP INDEX "bookmarksInLists_listId_idx";--> statement-breakpoint
DROP INDEX "importSessionBookmarks_sessionId_idx";--> statement-breakpoint
DROP INDEX "tagsOnBookmarks_tagId_idx";--> statement-breakpoint
DROP INDEX "tagsOnBookmarks_bookmarkId_idx";--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD COLUMN "readerViewStatus" text;--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD COLUMN "readerViewScore" integer;--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD COLUMN "readerViewReasons" jsonb;--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD COLUMN "readerViewClassifierVersion" integer;--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD COLUMN "probeMetadataAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "lastSavedAt" timestamp with time zone;--> statement-breakpoint
UPDATE "bookmarks" SET "lastSavedAt" = "createdAt";--> statement-breakpoint
ALTER TABLE "bookmarks" ALTER COLUMN "lastSavedAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "importSessions" ADD COLUMN "completedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "importSessions" ADD COLUMN "totalBookmarks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "importSessions" ADD COLUMN "completedBookmarks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "importSessions" ADD COLUMN "failedBookmarks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "importSessions" ADD COLUMN "pendingBookmarks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "importSessions" ADD COLUMN "processingBookmarks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "manualTierName" text;--> statement-breakpoint
ALTER TABLE "chatMessages" ADD CONSTRAINT "chatMessages_chatId_chatSessions_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chatSessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatSessions" ADD CONSTRAINT "chatSessions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chatMessages_chatId_idx" ON "chatMessages" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "chatMessages_chatId_createdAt_idx" ON "chatMessages" USING btree ("chatId","createdAt");--> statement-breakpoint
CREATE INDEX "chatSessions_userId_idx" ON "chatSessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "chatSessions_userId_modifiedAt_idx" ON "chatSessions" USING btree ("userId","modifiedAt");--> statement-breakpoint
CREATE INDEX "bookmarks_lastSavedAt_idx" ON "bookmarks" USING btree ("lastSavedAt");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_lastSavedAt_id_idx" ON "bookmarks" USING btree ("userId","lastSavedAt","id");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_archived_lastSavedAt_id_idx" ON "bookmarks" USING btree ("userId","archived","lastSavedAt","id");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_favourited_lastSavedAt_id_idx" ON "bookmarks" USING btree ("userId","favourited","lastSavedAt","id");--> statement-breakpoint
CREATE INDEX "importSessions_status_completedAt_idx" ON "importSessions" USING btree ("status","completedAt");--> statement-breakpoint
CREATE INDEX "importStaging_resultBookmarkId_idx" ON "importStagingBookmarks" USING btree ("resultBookmarkId");--> statement-breakpoint
CREATE INDEX "rssFeedImports_bookmarkId_idx" ON "rssFeedImports" USING btree ("bookmarkId");