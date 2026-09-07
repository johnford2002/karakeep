import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { DB } from "../drizzle";
import { dialect, getInMemoryDB } from "../drizzle";
import { config } from "../schema";
import { withTransaction } from "../transaction";

const isPostgres = dialect === "postgresql";

// This is withTransaction's contract, and it runs against whichever dialect the
// suite is pointed at. SQLite is the one that constrains the design -- drizzle's
// own transaction() rejects an async callback on better-sqlite3 >= 12, so
// withTransaction issues BEGIN/COMMIT itself there -- while PostgreSQL delegates
// to postgres-js's native async transaction. Both must satisfy everything below;
// the single exception is marked.
describe(`withTransaction (${dialect})`, () => {
  let db: DB;

  beforeEach(async () => {
    db = (await getInMemoryDB(true)) as DB;
  });

  async function keys() {
    const rows = await db.select().from(config);
    return rows.map((r) => r.key).sort();
  }

  it("accepts an async callback and commits its writes", async () => {
    await withTransaction(db, async (tx) => {
      await tx.insert(config).values({ key: "a", value: "1" });
      await tx.insert(config).values({ key: "b", value: "2" });
    });

    expect(await keys()).toEqual(["a", "b"]);
  });

  it("returns the callback's value", async () => {
    const result = await withTransaction(db, async (tx) => {
      await tx.insert(config).values({ key: "a", value: "1" });
      return "returned";
    });

    expect(result).toBe("returned");
  });

  it("rolls every write back when the callback throws", async () => {
    await expect(
      withTransaction(db, async (tx) => {
        await tx.insert(config).values({ key: "a", value: "1" });
        await tx.insert(config).values({ key: "b", value: "2" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await keys()).toEqual([]);
  });

  it("rolls back writes made before a failing statement", async () => {
    await withTransaction(db, async (tx) => {
      await tx.insert(config).values({ key: "existing", value: "0" });
    });

    await expect(
      withTransaction(db, async (tx) => {
        await tx.insert(config).values({ key: "a", value: "1" });
        // Duplicate primary key - fails inside the transaction.
        await tx.insert(config).values({ key: "existing", value: "9" });
      }),
    ).rejects.toThrow();

    expect(await keys()).toEqual(["existing"]);
    const [row] = await db
      .select()
      .from(config)
      .where(eq(config.key, "existing"));
    expect(row.value).toBe("0");
  });

  it("honours the immediate behavior option", async () => {
    await withTransaction(
      db,
      async (tx) => {
        await tx.insert(config).values({ key: "a", value: "1" });
      },
      { behavior: "immediate" },
    );

    expect(await keys()).toEqual(["a"]);
  });

  it("nests via savepoints, rolling back only the inner scope", async () => {
    await withTransaction(db, async (tx) => {
      await tx.insert(config).values({ key: "outer", value: "1" });

      await expect(
        withTransaction(tx, async (inner) => {
          await inner.insert(config).values({ key: "inner", value: "2" });
          throw new Error("inner boom");
        }),
      ).rejects.toThrow("inner boom");
    });

    expect(await keys()).toEqual(["outer"]);
  });

  it("commits a nested transaction that succeeds", async () => {
    await withTransaction(db, async (tx) => {
      await tx.insert(config).values({ key: "outer", value: "1" });
      await withTransaction(tx, async (inner) => {
        await inner.insert(config).values({ key: "inner", value: "2" });
      });
    });

    expect(await keys()).toEqual(["inner", "outer"]);
  });

  it("leaves no transaction open after a rollback", async () => {
    await expect(
      withTransaction(db, async (tx) => {
        await tx.insert(config).values({ key: "a", value: "1" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A further transaction would fail with "cannot start a transaction within
    // a transaction" if the failed one had not been closed out.
    await withTransaction(db, async (tx) => {
      await tx.insert(config).values({ key: "b", value: "2" });
    });

    expect(await keys()).toEqual(["b"]);
  });

  it("serialises concurrent top-level transactions", async () => {
    // Callers do this - deleting a list's children runs each delete's
    // transaction under Promise.all. SQLite has no nested BEGIN, so these have
    // to queue rather than overlap.
    await Promise.all(
      ["a", "b", "c", "d"].map((key) =>
        withTransaction(db, async (tx) => {
          await tx.insert(config).values({ key, value: key });
        }),
      ),
    );

    expect(await keys()).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps concurrent transactions independent when one fails", async () => {
    const results = await Promise.allSettled(
      ["ok1", "boom", "ok2"].map((key) =>
        withTransaction(db, async (tx) => {
          await tx.insert(config).values({ key, value: key });
          if (key === "boom") {
            throw new Error("boom");
          }
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(await keys()).toEqual(["ok1", "ok2"]);
  });

  it("recovers the queue after a failed transaction", async () => {
    await expect(
      withTransaction(db, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await Promise.all(
      ["a", "b"].map((key) =>
        withTransaction(db, async (tx) => {
          await tx.insert(config).values({ key, value: key });
        }),
      ),
    );

    expect(await keys()).toEqual(["a", "b"]);
  });

  // SQLite only, for two reasons: the probe reads with `.all()`, which exists
  // only on drizzle's SQLite builders, and the property itself is specific to
  // better-sqlite3 being one synchronous connection. PostgreSQL pools, so a
  // concurrent read is expected to run during a transaction -- it just cannot
  // see the uncommitted rows, which is the database's job, not ours.
  it.skipIf(isPostgres)(
    "does not let other work interleave between BEGIN and COMMIT",
    async () => {
      let sawPartialState = false;

      const probe = setInterval(() => {
        // Reading mid-transaction on the same connection would see the partial
        // write; microtask draining should prevent this timer from ever running
        // while the transaction is open.
        const rows = db.select().from(config).all();
        if (rows.length === 1) {
          sawPartialState = true;
        }
      }, 0);

      await withTransaction(db, async (tx) => {
        await tx.insert(config).values({ key: "a", value: "1" });
        await tx.insert(config).values({ key: "b", value: "2" });
      });

      clearInterval(probe);
      expect(sawPartialState).toBe(false);
      expect(await keys()).toEqual(["a", "b"]);
    },
  );
});
