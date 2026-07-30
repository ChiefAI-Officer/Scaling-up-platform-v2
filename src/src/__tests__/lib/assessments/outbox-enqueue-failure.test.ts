/**
 * Outbox enqueue failure classification (GH #257).
 *
 * The behaviour this protects is proven at the database level in
 * `integration-tests/tx-swallowed-error.pg.test.ts`: a failure that reached
 * PostgreSQL aborts the surrounding transaction, so swallowing it cannot save the
 * submission and only destroys the real cause. This suite pins the *decision*,
 * which is pure and therefore worth unit-testing separately from the semantics.
 *
 * The load-bearing case is the DEFAULT. An unrecognised error must be treated as a
 * database failure, because "we could not prove the transaction is intact" and
 * "the transaction is intact" are not the same claim — and only one of them is safe
 * to act on.
 */

import { classifyOutboxEnqueueFailure } from "@/lib/assessments/outbox-enqueue-failure";

/** Shaped like a Prisma error: the real classes all set `.name`. */
function prismaError(name: string, message = "boom") {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe("classifyOutboxEnqueueFailure", () => {
  it("skips the email for a pre-database validation error", () => {
    // The only case where the transaction is provably intact, so the submission
    // can still commit and dropping this one email is the correct trade.
    expect(
      classifyOutboxEnqueueFailure(prismaError("PrismaClientValidationError")),
    ).toEqual({ disposition: "skip-email" });
  });

  it.each([
    // Reached the database and was rejected — unique violation, FK, etc.
    "PrismaClientKnownRequestError",
    // Reached the database, no error code available.
    "PrismaClientUnknownRequestError",
    // Connection/engine level: the transaction is certainly not usable.
    "PrismaClientInitializationError",
    "PrismaClientRustPanicError",
  ])("rethrows for %s, because the transaction is already aborted", (name) => {
    expect(classifyOutboxEnqueueFailure(prismaError(name))).toEqual({
      disposition: "rethrow",
    });
  });

  it.each([
    ["a plain Error of unknown provenance", new Error("nope")],
    ["a string", "nope"],
    ["null", null],
    ["undefined", undefined],
    ["an object with no name", { code: "P2002" }],
    ["an object whose name is not a string", { name: 42 }],
  ])("defaults to rethrow for %s", (_label, value) => {
    // Positive control for this block lives in the first test above: something DOES
    // return skip-email, so these are not passing merely because the function
    // always says rethrow.
    expect(classifyOutboxEnqueueFailure(value)).toEqual({
      disposition: "rethrow",
    });
  });

  it("does not treat a merely similar name as pre-database", () => {
    // Guards against a loose substring/prefix match creeping in later: only the
    // exact validation-error name is safe to swallow.
    expect(
      classifyOutboxEnqueueFailure(
        prismaError("PrismaClientValidationErrorish"),
      ),
    ).toEqual({ disposition: "rethrow" });
    expect(
      classifyOutboxEnqueueFailure(prismaError("ValidationError")),
    ).toEqual({ disposition: "rethrow" });
  });
});
