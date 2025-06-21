import type { AdapterAccount } from "@auth/core/adapters";
import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import {
  AnyPgColumn,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  boolean,
} from "drizzle-orm/pg-core";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

function createdAtField() {
  return timestamp("createdAt", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date());
}

function modifiedAtField() {
  return timestamp("modifiedAt", { mode: "date" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
}

export const users = pgTable("user", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
  salt: text("salt").notNull().default(""),
  role: text("role").$type<"admin" | "user">().default("user"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const apiKeys = pgTable(
  "apiKey",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    keyId: text("keyId").notNull().unique(),
    keyHash: text("keyHash").notNull(),
    createdAt: createdAtField(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (apiKey) => [
    index("apiKey_userId_idx").on(apiKey.userId),
    index("apiKey_keyId_idx").on(apiKey.keyId),
  ],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    title: text("title"),
    note: text("note"),
    summary: text("summary"),
    summaryStatus: text("summaryStatus").$type<"processing" | "success" | "failure">(),
    archived: boolean("archived").notNull().default(false),
    favourited: boolean("favourited").notNull().default(false),
    taggingStatus: text("taggingStatus").$type<"success" | "failure">(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<(typeof BookmarkTypes)[keyof typeof BookmarkTypes]>().notNull(),
  },
  (b) => [
    index("bookmarks_userId_idx").on(b.userId),
    index("bookmarks_archived_idx").on(b.archived),
    index("bookmarks_favourited_idx").on(b.favourited),
    index("bookmarks_createdAt_idx").on(b.createdAt),
  ],
);

export const bookmarkLinks = pgTable(
  "bookmarkLinks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId())
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    author: text("author"),
    publisher: text("publisher"),
    datePublished: timestamp("datePublished", { mode: "date" }),
    dateModified: timestamp("dateModified", { mode: "date" }),
    imageUrl: text("imageUrl"),
    favicon: text("favicon"),
    content: text("content"),
    htmlContent: text("htmlContent"),
    crawledAt: timestamp("crawledAt", { mode: "date" }),
    baseUrl: text("baseUrl"),
    metadataRaw: text("metadataRaw"),
  },
  (bl) => [index("bookmarkLinks_url_idx").on(bl.url)],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    assetType: text("assetType").notNull(),
    size: integer("size").notNull().default(0),
    contentType: text("contentType"),
    fileName: text("fileName"),
    bookmarkId: text("bookmarkId").references(() => bookmarks.id, {
      onDelete: "cascade",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (tb) => [
    index("assets_bookmarkId_idx").on(tb.bookmarkId),
    index("assets_assetType_idx").on(tb.assetType),
    index("assets_userId_idx").on(tb.userId),
  ],
);

export const highlights = pgTable(
  "highlights",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    text: text("text").notNull(),
    note: text("note"),
    startOffset: integer("startOffset").notNull(),
    endOffset: integer("endOffset").notNull(),
    color: text("color").notNull().default("blue"),
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (h) => [
    index("highlights_bookmarkId_idx").on(h.bookmarkId),
    index("highlights_userId_idx").on(h.userId),
  ],
);

export const bookmarkTexts = pgTable("bookmarkTexts", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId())
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
});

export const bookmarkAssets = pgTable("bookmarkAssets", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId())
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  assetType: text("assetType").notNull(),
  content: text("content"),
  fileName: text("fileName"),
  sourceUrl: text("sourceUrl"),
});

export const bookmarkTags = pgTable(
  "bookmarkTags",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (bt) => [
    index("bookmarkTags_name_idx").on(bt.name),
    index("bookmarkTags_userId_idx").on(bt.userId),
    unique().on(bt.name, bt.userId),
  ],
);

export const tagsOnBookmarks = pgTable(
  "tagsOnBookmarks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    tagId: text("tagId")
      .notNull()
      .references(() => bookmarkTags.id, { onDelete: "cascade" }),
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    attachedBy: text("attachedBy", { enum: ["ai", "human"] }).notNull(),
  },
  (tb) => [
    index("tagsOnBookmarks_tagId_idx").on(tb.tagId),
    index("tagsOnBookmarks_bookmarkId_idx").on(tb.bookmarkId),
    unique().on(tb.tagId, tb.bookmarkId),
  ],
);

export const bookmarkLists = pgTable(
  "bookmarkLists",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").notNull(),
    createdAt: createdAtField(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["manual", "smart"] }).notNull(),
    query: text("query"),
    parentId: text("parentId").references(
      (): AnyPgColumn => bookmarkLists.id,
      { onDelete: "set null" },
    ),
    rssToken: text("rssToken"),
    public: boolean("public").notNull().default(false),
  },
  (bl) => [
    index("bookmarkLists_userId_idx").on(bl.userId),
    unique("bookmarkLists_userId_id_idx").on(bl.userId, bl.id),
  ],
);

export const bookmarksInLists = pgTable(
  "bookmarksInLists",
  {
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    listId: text("listId")
      .notNull()
      .references(() => bookmarkLists.id, { onDelete: "cascade" }),
    addedAt: timestamp("addedAt", { mode: "date" }).$defaultFn(
      () => new Date(),
    ),
  },
  (tb) => [
    primaryKey({ columns: [tb.bookmarkId, tb.listId] }),
    index("bookmarksInLists_bookmarkId_idx").on(tb.bookmarkId),
    index("bookmarksInLists_listId_idx").on(tb.listId),
  ],
);

export const customPrompts = pgTable(
  "customPrompts",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    text: text("text").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAtField(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (cp) => [index("customPrompts_userId_idx").on(cp.userId)],
);

export const rssFeedsTable = pgTable(
  "rssFeeds",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    lastFetched: timestamp("lastFetched", { mode: "date" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
  },
  (rf) => [index("rssFeeds_userId_idx").on(rf.userId)],
);

export const webhooksTable = pgTable(
  "webhooks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    url: text("url").notNull(),
    description: text("description"),
    eventTypes: text("eventTypes").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (w) => [index("webhooks_userId_idx").on(w.userId)],
);

export const rssFeedImportsTable = pgTable(
  "rssFeedImports",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    entryId: text("entryId").notNull(),
    rssFeedId: text("rssFeedId")
      .notNull()
      .references(() => rssFeedsTable.id, { onDelete: "cascade" }),
    bookmarkId: text("bookmarkId").references(() => bookmarks.id, {
      onDelete: "set null",
    }),
  },
  (bl) => [
    index("rssFeedImports_feedIdIdx_idx").on(bl.rssFeedId),
    index("rssFeedImports_entryIdIdx_idx").on(bl.entryId),
    unique().on(bl.rssFeedId, bl.entryId),
  ],
);

export const config = pgTable("config", {
  key: text("key").notNull().primaryKey(),
  value: text("value").notNull(),
});

export const ruleEngineRulesTable = pgTable(
  "ruleEngineRules",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
    event: text("event").notNull(),
    conditions: text("conditions").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runCount: integer("runCount").notNull().default(0),
  },
  (rer) => [index("ruleEngineRules_userId_idx").on(rer.userId)],
);

export const ruleEngineActionsTable = pgTable(
  "ruleEngineActions",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    ruleId: text("ruleId")
      .notNull()
      .references(() => ruleEngineRulesTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: text("data").notNull(),
    actionOrder: integer("actionOrder").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    webhookId: text("webhookId").references(() => webhooksTable.id, {
      onDelete: "cascade",
    }),
    listId: text("listId").references(() => bookmarkLists.id, {
      onDelete: "cascade",
    }),
  },
  (rea) => [
    index("ruleEngineActions_ruleId_idx").on(rea.ruleId),
    index("ruleEngineActions_userId_idx").on(rea.userId),
    foreignKey({
      columns: [rea.userId, rea.listId],
      foreignColumns: [bookmarkLists.userId, bookmarkLists.id],
    }),
  ],
);

export const userSettings = pgTable("userSettings", {
  userId: text("userId")
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  archiveDisplayBehaviour: text("archiveDisplayBehaviour", {
    enum: ["show", "hide"],
  })
    .notNull()
    .default("show"),
});

// Relations remain the same as the SQLite version
// Copy all relations from schema.ts...