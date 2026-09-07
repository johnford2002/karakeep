import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";

import type { DB, KarakeepDBTransaction } from "./drizzle";
import { dialect } from "./drizzle";

/**
 * SQLite locking behavior for the outermost transaction.  Ignored on
 * PostgreSQL, which relies on MVCC rather than a database-wide write lock.
 */
export type TransactionBehavior = "deferred" | "immediate" | "exclusive";

export interface TransactionOptions {
  behavior?: TransactionBehavior;
}

/**
 * Run `cb` inside a database transaction, on either dialect.
 *
 * Drizzle's own `db.transaction()` can't span both:
 *
 *   - better-sqlite3 >= 12 throws "Transaction function cannot return a
 *     promise", so its callback must be strictly synchronous, which in turn
 *     forces the driver's sync API (`.all()` / `.run()` / `.get()`).
 *   - postgres-js is asynchronous end to end; those sync methods don't exist
 *     on its query builders at all, and its callback must return a promise.
 *
 * So callbacks here are always `async` and always `await` their queries -- a
 * form both dialects' query builders support -- and this helper supplies the
 * transaction itself: natively on PostgreSQL, and by issuing the statements
 * directly on SQLite, bypassing better-sqlite3's promise check.
 *
 * On SQLite that leaves two things to get right, both handled below:
 *
 *   - **Overlap.** better-sqlite3 is one connection, and SQLite has no nested
 *     BEGIN, so two transactions must never be open at once. An async callback
 *     can yield, and callers do run transactions concurrently (deleting a
 *     list's children with `Promise.all`, for one), so top-level transactions
 *     are queued and run one at a time.
 *   - **Nesting.** A transaction that legitimately opens another -- the same
 *     logical unit of work, reached through a helper -- must not wait on that
 *     queue, or it would deadlock against itself. Nested calls are detected via
 *     `AsyncLocalStorage` and emit savepoints instead.
 *
 * Atomicity then holds as long as callbacks only await queries: those resolve
 * on the microtask queue, which drains before the event loop moves on, so
 * nothing lands between BEGIN and COMMIT. A real asynchronous gap (network,
 * timer, filesystem) inside a callback breaks that, and would also hold the
 * write lock across it. Keep I/O out of these callbacks -- do it before or
 * after, as the surrounding code already does.
 */
export async function withTransaction<T>(
  db: DB | KarakeepDBTransaction,
  cb: (tx: KarakeepDBTransaction) => Promise<T>,
  opts?: TransactionOptions,
): Promise<T> {
  if (dialect === "postgresql") {
    // postgres-js takes an async callback directly, pools its connections, and
    // emits savepoints for nesting, so this covers both cases on its own.
    return await (
      db as unknown as {
        transaction: (
          fn: (tx: KarakeepDBTransaction) => Promise<T>,
        ) => Promise<T>;
      }
    ).transaction(cb);
  }
  return await sqliteTransaction(db, cb, opts?.behavior);
}

/** Set while a SQLite transaction is open, to spot genuinely nested calls. */
const sqliteTxDepth = new AsyncLocalStorage<number>();

/** Tail of the queue of top-level SQLite transactions. */
let sqliteQueue: Promise<unknown> = Promise.resolve();

interface Runner {
  run: (query: ReturnType<typeof sql.raw>) => unknown;
}

async function sqliteTransaction<T>(
  db: DB | KarakeepDBTransaction,
  cb: (tx: KarakeepDBTransaction) => Promise<T>,
  behavior: TransactionBehavior = "deferred",
): Promise<T> {
  const runner = db as unknown as Runner;
  const tx = db as unknown as KarakeepDBTransaction;
  const depth = sqliteTxDepth.getStore();

  if (depth !== undefined) {
    return await savepointScope(runner, tx, cb, depth);
  }

  // Top-level: take the queue slot before opening the transaction.
  const predecessor = sqliteQueue;
  let release!: () => void;
  sqliteQueue = new Promise<void>((resolve) => (release = resolve));
  await predecessor.catch(() => undefined);

  try {
    runner.run(sql.raw(`BEGIN ${behavior.toUpperCase()}`));
    try {
      const result = await sqliteTxDepth.run(1, () => cb(tx));
      runner.run(sql.raw("COMMIT"));
      return result;
    } catch (e) {
      runner.run(sql.raw("ROLLBACK"));
      throw e;
    }
  } finally {
    release();
  }
}

async function savepointScope<T>(
  runner: Runner,
  tx: KarakeepDBTransaction,
  cb: (tx: KarakeepDBTransaction) => Promise<T>,
  depth: number,
): Promise<T> {
  const name = `karakeep_sp_${depth}`;
  runner.run(sql.raw(`SAVEPOINT ${name}`));
  try {
    const result = await sqliteTxDepth.run(depth + 1, () => cb(tx));
    runner.run(sql.raw(`RELEASE ${name}`));
    return result;
  } catch (e) {
    runner.run(sql.raw(`ROLLBACK TO ${name}`));
    runner.run(sql.raw(`RELEASE ${name}`));
    throw e;
  }
}
