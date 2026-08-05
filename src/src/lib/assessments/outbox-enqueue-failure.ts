/**
 * Assessment outbox enqueue — classify an enqueue failure (GH #257).
 *
 * The invited submit route inserts its outbox rows INSIDE `db.$transaction`, and
 * has historically wrapped each insert in try/catch on the stated contract that
 * "a write failure for one email NEVER rolls back the submission". That contract
 * is only half true, and the half that fails is the important one.
 *
 * PROVEN in `integration-tests/tx-swallowed-error.pg.test.ts` against real
 * PostgreSQL (not a mock — a mocked Prisma has no transaction state, which is why
 * the false claim survived review for so long):
 *
 *   - A failure that REACHED the database aborts the transaction
 *     (`25P02 current transaction is aborted`). Every later statement in that
 *     transaction fails, so the submission does NOT commit. Prisma wraps no
 *     per-operation savepoints, so catching the error in JavaScript has nothing to
 *     roll back to — the catch and the server-side transaction state are different
 *     things. Swallowing here achieves nothing except losing the real cause: the
 *     error that eventually surfaces is `25P02` raised by a LATER statement, which
 *     is a red herring pointing at the wrong line.
 *
 *   - A failure raised BEFORE the statement was sent (a client-side validation
 *     error) leaves the transaction intact, so swallowing genuinely works and the
 *     submission commits without that email.
 *
 * Hence the classification below, whose default is deliberately "rethrow": we only
 * swallow when we can positively identify a pre-database failure. Losing a
 * respondent's submission is worse than losing one email, but pretending we kept
 * the submission when the database has already discarded it is worse than both.
 */

/** What the caller should do with a failed outbox insert. */
export type OutboxEnqueueFailure =
  /** The statement never reached the database; the transaction is intact. Skip
   *  this email and carry on — the submission is still committable. */
  | { disposition: "skip-email" }
  /** The database rejected the statement, so the transaction is already aborted
   *  and the submission is lost regardless. Rethrow so the surfaced error is the
   *  real cause rather than a downstream `25P02`. */
  | { disposition: "rethrow" };

/**
 * Prisma's error classes all set `.name`. Matching on the name rather than
 * `instanceof` avoids the classic failure where two copies of `@prisma/client`
 * (or a mocked client in tests) produce objects that fail an `instanceof` check
 * against the constructor this module happens to have imported.
 */
const PRE_DATABASE_ERROR_NAMES = new Set([
  // Prisma rejected the arguments before generating a query, so nothing was sent.
  "PrismaClientValidationError",
]);

function errorName(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

/**
 * Decide what to do with an outbox insert failure.
 *
 * Everything that is not positively identifiable as pre-database is treated as a
 * database failure, including a plain `Error` of unknown provenance: if we cannot
 * prove the transaction is intact, we must not claim it is.
 */
export function classifyOutboxEnqueueFailure(
  err: unknown,
): OutboxEnqueueFailure {
  const name = errorName(err);
  if (name !== null && PRE_DATABASE_ERROR_NAMES.has(name)) {
    return { disposition: "skip-email" };
  }
  return { disposition: "rethrow" };
}
