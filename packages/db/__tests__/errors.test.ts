import { describe, expect, it } from "vitest";

import { isUniqueConstraintError } from "../errors";

describe("isUniqueConstraintError", () => {
  it("matches a bare sqlite unique violation", () => {
    expect(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_UNIQUE" })).toBe(
      true,
    );
    expect(
      isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_PRIMARYKEY" }),
    ).toBe(true);
  });

  it("matches a bare postgres unique violation", () => {
    expect(isUniqueConstraintError({ code: "23505" })).toBe(true);
  });

  it("matches through a DrizzleQueryError wrapper", () => {
    // What drizzle actually throws: the wrapper has no code of its own and
    // keeps the PostgresError on `cause`.
    const wrapped = Object.assign(new Error("Failed query"), {
      query: "insert into ...",
      params: [],
      cause: Object.assign(new Error("duplicate key value"), { code: "23505" }),
    });
    expect(isUniqueConstraintError(wrapped)).toBe(true);
  });

  it("matches through more than one level of wrapping", () => {
    const inner = Object.assign(new Error("dup"), { code: "23505" });
    const mid = Object.assign(new Error("mid"), { cause: inner });
    const outer = Object.assign(new Error("outer"), { cause: mid });
    expect(isUniqueConstraintError(outer)).toBe(true);
  });

  it("rejects unrelated errors and non-objects", () => {
    expect(isUniqueConstraintError(new Error("nope"))).toBe(false);
    expect(isUniqueConstraintError({ code: "23503" })).toBe(false);
    expect(
      isUniqueConstraintError({
        cause: { code: "SQLITE_CONSTRAINT_FOREIGNKEY" },
      }),
    ).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
    expect(isUniqueConstraintError("23505")).toBe(false);
  });

  it("terminates on a self-referential cause chain", () => {
    const e: Record<string, unknown> = { code: "nope" };
    e.cause = e;
    expect(isUniqueConstraintError(e)).toBe(false);
  });
});
