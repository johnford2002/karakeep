-- PostgreSQL counterpart of upstream SQLite migrations 0094-0097:
--   0094_migrate_to_better_auth
--   0095_add_in_app_subscriptions
--   0096_add_highlight_text_anchors
--   0097_assets_highlights_pagination_indexes
--
-- Hand-written rather than drizzle-kit's raw output: the generated diff adds
-- NOT NULL columns to populated tables and casts emailVerified without USING,
-- both of which fail on a live database, and it would discard every password
-- and OAuth link. The data steps mirror upstream's 0094 statement for
-- statement. The resulting schema matches meta/0005_snapshot.json.

-- 0094: better-auth -------------------------------------------------------

-- account: rebuilt, with existing OAuth links and passwords carried over.
ALTER TABLE "account" RENAME TO "account_legacy";--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "accounts_providerId_accountId_unique" UNIQUE("providerId","accountId")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
-- NextAuth stored expires_at in epoch seconds.
INSERT INTO "account" (
	"id",
	"accountId",
	"providerId",
	"userId",
	"accessToken",
	"refreshToken",
	"idToken",
	"accessTokenExpiresAt",
	"scope",
	"createdAt",
	"updatedAt"
)
SELECT
	'legacy-oauth:' || "provider" || ':' || "providerAccountId",
	"providerAccountId",
	"provider",
	"userId",
	"access_token",
	"refresh_token",
	"id_token",
	CASE WHEN "expires_at" IS NULL THEN NULL ELSE to_timestamp("expires_at") END,
	"scope",
	now(),
	now()
FROM "account_legacy"
WHERE "userId" IN (SELECT "id" FROM "user");--> statement-breakpoint
-- Passwords move to better-auth's credential accounts. Legacy hashes are
-- bcrypt(password + salt), so the salt is kept alongside the hash.
INSERT INTO "account" (
	"id",
	"accountId",
	"providerId",
	"userId",
	"password",
	"createdAt",
	"updatedAt"
)
SELECT
	'legacy-credential:' || "id",
	"id",
	'credential',
	"id",
	CASE
		WHEN "salt" = '' THEN "password"
		ELSE 'bcrypt-salted:' || "salt" || ':' || "password"
	END,
	now(),
	now()
FROM "user"
WHERE "password" IS NOT NULL;--> statement-breakpoint
DROP TABLE "account_legacy";--> statement-breakpoint

-- verificationToken: rebuilt (short-lived tokens; nothing worth carrying over).
DROP TABLE "verificationToken";--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationTokens_identifier_value_unique" UNIQUE("identifier","value")
);
--> statement-breakpoint
CREATE INDEX "verificationTokens_identifier_idx" ON "verificationToken" USING btree ("identifier");--> statement-breakpoint

-- session: rebuilt. Existing sessions are dropped, as upstream does, so every
-- user signs in again once after this migration.
DROP TABLE "session";--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"userId" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint

DROP TABLE "passwordResetToken" CASCADE;--> statement-breakpoint

-- user: emailVerified changes from a timestamp to a boolean, and the row gains
-- createdAt/updatedAt.
ALTER TABLE "user" ADD COLUMN "createdAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "updatedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "emailVerified" SET DATA TYPE boolean USING ("emailVerified" IS NOT NULL);--> statement-breakpoint
UPDATE "user" SET "createdAt" = now(), "updatedAt" = now();--> statement-breakpoint
-- better-auth looks users up by lowercased email. Emails that would collide
-- with another user once lowercased are left untouched.
UPDATE "user"
SET "email" = lower("email")
WHERE "email" != lower("email")
	AND NOT EXISTS (
		SELECT 1 FROM "user" AS "other"
		WHERE lower("other"."email") = lower("user"."email")
			AND "other"."id" != "user"."id"
	);--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "password";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "salt";--> statement-breakpoint

-- 0095: in-app subscriptions ----------------------------------------------
CREATE TABLE "inAppSubscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"store" text,
	"productId" text,
	"status" text NOT NULL,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"billingIssue" boolean DEFAULT false NOT NULL,
	"isSandbox" boolean DEFAULT false NOT NULL,
	"startDate" timestamp with time zone,
	"endDate" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"modifiedAt" timestamp with time zone,
	CONSTRAINT "inAppSubscriptions_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "inAppSubscriptions" ADD CONSTRAINT "inAppSubscriptions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 0096: highlight text anchors --------------------------------------------
ALTER TABLE "highlights" ADD COLUMN "prefix" text;--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "suffix" text;--> statement-breakpoint

-- 0097: pagination indexes ------------------------------------------------
DROP INDEX "assets_userId_idx";--> statement-breakpoint
CREATE INDEX "assets_userId_size_idx" ON "assets" USING btree ("userId","size","id","assetType","bookmarkId");--> statement-breakpoint
DROP INDEX "highlights_userId_idx";--> statement-breakpoint
CREATE INDEX "highlights_userId_createdAt_id_idx" ON "highlights" USING btree ("userId","createdAt","id");
