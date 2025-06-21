CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "apiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"keyId" text NOT NULL,
	"keyHash" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "apiKey_keyId_unique" UNIQUE("keyId")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"assetType" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"contentType" text,
	"fileName" text,
	"bookmarkId" text,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarkAssets" (
	"id" text PRIMARY KEY NOT NULL,
	"assetType" text NOT NULL,
	"content" text,
	"fileName" text,
	"sourceUrl" text
);
--> statement-breakpoint
CREATE TABLE "bookmarkLinks" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"author" text,
	"publisher" text,
	"datePublished" timestamp,
	"dateModified" timestamp,
	"imageUrl" text,
	"favicon" text,
	"content" text,
	"htmlContent" text,
	"crawledAt" timestamp,
	"baseUrl" text,
	"metadataRaw" text
);
--> statement-breakpoint
CREATE TABLE "bookmarkLists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"query" text,
	"parentId" text,
	"rssToken" text,
	"public" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bookmarkLists_userId_id_idx" UNIQUE("userId","id")
);
--> statement-breakpoint
CREATE TABLE "bookmarkTags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "bookmarkTags_name_userId_unique" UNIQUE("name","userId")
);
--> statement-breakpoint
CREATE TABLE "bookmarkTexts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp NOT NULL,
	"title" text,
	"note" text,
	"summary" text,
	"summaryStatus" text,
	"archived" boolean DEFAULT false NOT NULL,
	"favourited" boolean DEFAULT false NOT NULL,
	"taggingStatus" text,
	"userId" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarksInLists" (
	"bookmarkId" text NOT NULL,
	"listId" text NOT NULL,
	"addedAt" timestamp,
	CONSTRAINT "bookmarksInLists_bookmarkId_listId_pk" PRIMARY KEY("bookmarkId","listId")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customPrompts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp NOT NULL,
	"text" text NOT NULL,
	"note" text,
	"startOffset" integer NOT NULL,
	"endOffset" integer NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"bookmarkId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rssFeedImports" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp NOT NULL,
	"entryId" text NOT NULL,
	"rssFeedId" text NOT NULL,
	"bookmarkId" text,
	CONSTRAINT "rssFeedImports_rssFeedId_entryId_unique" UNIQUE("rssFeedId","entryId")
);
--> statement-breakpoint
CREATE TABLE "rssFeeds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"lastFetched" timestamp,
	"userId" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruleEngineActions" (
	"id" text PRIMARY KEY NOT NULL,
	"ruleId" text NOT NULL,
	"type" text NOT NULL,
	"data" text NOT NULL,
	"actionOrder" integer NOT NULL,
	"userId" text NOT NULL,
	"webhookId" text,
	"listId" text
);
--> statement-breakpoint
CREATE TABLE "ruleEngineRules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp NOT NULL,
	"modifiedAt" timestamp,
	"event" text NOT NULL,
	"conditions" text NOT NULL,
	"userId" text NOT NULL,
	"runCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tagsOnBookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"tagId" text NOT NULL,
	"bookmarkId" text NOT NULL,
	"attachedBy" text NOT NULL,
	CONSTRAINT "tagsOnBookmarks_tagId_bookmarkId_unique" UNIQUE("tagId","bookmarkId")
);
--> statement-breakpoint
CREATE TABLE "userSettings" (
	"userId" text PRIMARY KEY NOT NULL,
	"archiveDisplayBehaviour" text DEFAULT 'show' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"password" text,
	"salt" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'user',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"eventTypes" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkAssets" ADD CONSTRAINT "bookmarkAssets_id_bookmarks_id_fk" FOREIGN KEY ("id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD CONSTRAINT "bookmarkLinks_id_bookmarks_id_fk" FOREIGN KEY ("id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkLists" ADD CONSTRAINT "bookmarkLists_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkLists" ADD CONSTRAINT "bookmarkLists_parentId_bookmarkLists_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."bookmarkLists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkTags" ADD CONSTRAINT "bookmarkTags_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkTexts" ADD CONSTRAINT "bookmarkTexts_id_bookmarks_id_fk" FOREIGN KEY ("id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarksInLists" ADD CONSTRAINT "bookmarksInLists_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarksInLists" ADD CONSTRAINT "bookmarksInLists_listId_bookmarkLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."bookmarkLists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customPrompts" ADD CONSTRAINT "customPrompts_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rssFeedImports" ADD CONSTRAINT "rssFeedImports_rssFeedId_rssFeeds_id_fk" FOREIGN KEY ("rssFeedId") REFERENCES "public"."rssFeeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rssFeedImports" ADD CONSTRAINT "rssFeedImports_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rssFeeds" ADD CONSTRAINT "rssFeeds_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_ruleId_ruleEngineRules_id_fk" FOREIGN KEY ("ruleId") REFERENCES "public"."ruleEngineRules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_webhookId_webhooks_id_fk" FOREIGN KEY ("webhookId") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_listId_bookmarkLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."bookmarkLists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_userId_listId_bookmarkLists_userId_id_fk" FOREIGN KEY ("userId","listId") REFERENCES "public"."bookmarkLists"("userId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineRules" ADD CONSTRAINT "ruleEngineRules_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagsOnBookmarks" ADD CONSTRAINT "tagsOnBookmarks_tagId_bookmarkTags_id_fk" FOREIGN KEY ("tagId") REFERENCES "public"."bookmarkTags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagsOnBookmarks" ADD CONSTRAINT "tagsOnBookmarks_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apiKey_userId_idx" ON "apiKey" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "apiKey_keyId_idx" ON "apiKey" USING btree ("keyId");--> statement-breakpoint
CREATE INDEX "assets_bookmarkId_idx" ON "assets" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "assets_assetType_idx" ON "assets" USING btree ("assetType");--> statement-breakpoint
CREATE INDEX "assets_userId_idx" ON "assets" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarkLinks_url_idx" ON "bookmarkLinks" USING btree ("url");--> statement-breakpoint
CREATE INDEX "bookmarkLists_userId_idx" ON "bookmarkLists" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarkTags_name_idx" ON "bookmarkTags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "bookmarkTags_userId_idx" ON "bookmarkTags" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_idx" ON "bookmarks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarks_archived_idx" ON "bookmarks" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "bookmarks_favourited_idx" ON "bookmarks" USING btree ("favourited");--> statement-breakpoint
CREATE INDEX "bookmarks_createdAt_idx" ON "bookmarks" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "bookmarksInLists_bookmarkId_idx" ON "bookmarksInLists" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "bookmarksInLists_listId_idx" ON "bookmarksInLists" USING btree ("listId");--> statement-breakpoint
CREATE INDEX "customPrompts_userId_idx" ON "customPrompts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "highlights_bookmarkId_idx" ON "highlights" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "highlights_userId_idx" ON "highlights" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "rssFeedImports_feedIdIdx_idx" ON "rssFeedImports" USING btree ("rssFeedId");--> statement-breakpoint
CREATE INDEX "rssFeedImports_entryIdIdx_idx" ON "rssFeedImports" USING btree ("entryId");--> statement-breakpoint
CREATE INDEX "rssFeeds_userId_idx" ON "rssFeeds" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ruleEngineActions_ruleId_idx" ON "ruleEngineActions" USING btree ("ruleId");--> statement-breakpoint
CREATE INDEX "ruleEngineActions_userId_idx" ON "ruleEngineActions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ruleEngineRules_userId_idx" ON "ruleEngineRules" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "tagsOnBookmarks_tagId_idx" ON "tagsOnBookmarks" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "tagsOnBookmarks_bookmarkId_idx" ON "tagsOnBookmarks" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "webhooks_userId_idx" ON "webhooks" USING btree ("userId");