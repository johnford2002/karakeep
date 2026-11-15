import { describe, expect, it } from "vitest";

import {
  buildTablePlans,
  convertValue,
  orderSelfReferencingRows,
} from "../scripts/migrateToPgPlan";

// buildTablePlans() throws on any column it can't classify, so this file also
// fails the moment an upstream sync adds a column migrate-to-pg would have
// copied wrong.
const plans = buildTablePlans();
const plan = (table: string) => {
  const p = plans.find((x) => x.table === table);
  if (!p) throw new Error(`no plan for ${table}`);
  return p;
};
const conversionOf = (table: string, column: string) =>
  plan(table).columns.find((c) => c.name === column)?.conversion;

describe("migrate-to-pg table plans", () => {
  it("covers every table, including the chat tables", () => {
    expect(plans.map((p) => p.table)).toEqual(
      expect.arrayContaining([
        "chatSessions",
        "chatMessages",
        "user",
        "account",
      ]),
    );
  });

  it("reads timestamps at the precision they're stored in", () => {
    // bookmarks.createdAt is stored in the lastSavedAt column, in seconds.
    expect(conversionOf("bookmarks", "lastSavedAt")).toBe("epochSecondsToDate");
    expect(conversionOf("bookmarkLinks", "probeMetadataAt")).toBe(
      "epochSecondsToDate",
    );
    expect(conversionOf("importSessions", "completedAt")).toBe(
      "epochSecondsToDate",
    );
    expect(conversionOf("session", "expiresAt")).toBe("epochMsToDate");
  });

  it("parses JSON text going into jsonb", () => {
    expect(conversionOf("apiKey", "scopes")).toBe("parseJson");
    expect(conversionOf("bookmarkLinks", "readerViewReasons")).toBe(
      "parseJson",
    );
  });

  it("converts 0/1 integers going into booleans", () => {
    expect(conversionOf("bookmarks", "captureVideo")).toBe("intToBool");
    expect(conversionOf("user", "emailVerified")).toBe("intToBool");
  });

  it("leaves generated columns to the database", () => {
    expect(conversionOf("bookmarkTags", "normalizedName")).toBeUndefined();
  });

  it("orders each table after the tables it references", () => {
    const position = new Map(plans.map((p, i) => [p.table, i]));
    expect(position.get("user")!).toBeLessThan(position.get("bookmarks")!);
    expect(position.get("bookmarks")!).toBeLessThan(
      position.get("bookmarkLinks")!,
    );
    expect(position.get("chatSessions")!).toBeLessThan(
      position.get("chatMessages")!,
    );
  });
});

describe("convertValue", () => {
  it("converts epoch seconds and milliseconds", () => {
    expect(convertValue("epochSecondsToDate", 1700000000)).toEqual(
      new Date("2023-11-14T22:13:20Z"),
    );
    expect(convertValue("epochMsToDate", 1700000000000)).toEqual(
      new Date("2023-11-14T22:13:20Z"),
    );
  });

  it("parses JSON text and keeps nulls", () => {
    expect(convertValue("parseJson", '["read"]')).toEqual(["read"]);
    expect(convertValue("parseJson", null)).toBeNull();
    expect(convertValue("intToBool", 0)).toBe(false);
  });
});

describe("orderSelfReferencingRows", () => {
  it("puts parents before their children", () => {
    const rows = [
      { id: "c", parentId: "b" },
      { id: "b", parentId: "a" },
      { id: "a", parentId: null },
    ];
    const ordered = orderSelfReferencingRows(rows, [
      { column: "parentId", references: "id" },
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps rows it can't place at the end instead of dropping them", () => {
    const rows = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
      { id: "a", parentId: null },
    ];
    const ordered = orderSelfReferencingRows(rows, [
      { column: "parentId", references: "id" },
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["a", "x", "y"]);
  });
});
