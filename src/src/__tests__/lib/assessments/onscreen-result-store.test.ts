/**
 * Wave OSR (Jeff #71) — the sessionStorage store that lets an invited
 * respondent's in-place report survive a refresh or a Back navigation.
 *
 * Why this exists at all (spec 19an §4): /me returns 410 once the invitation is
 * SUBMITTED (me/route.ts:78) and the client renders 410 as "This survey has
 * closed." (org-survey-client.tsx). Without a rehydrate the respondent would be
 * told the survey was closed moments after completing it.
 *
 * Two constraints drive the design:
 *  - the SLOT is keyed by CAMPAIGN ALIAS, not respondentKey, because on the
 *    refresh being rehydrated the client has had no 200 from /me and so has no
 *    respondentKey of its own to key by;
 *  - so the OWNER is carried inside the envelope and checked on read against the
 *    key /me echoes on its 410.
 *
 * ⚠️ An earlier version of this header said the token-exchange purge was what
 * kept respondents apart. It is not — the exchange strips the fragment (so a
 * tokenless reload never reaches it) and sessionStorage is per-tab while cookies
 * are per-origin (so a purge in one tab does not touch another). See the
 * `ownership` block at the bottom of this file.
 */

import {
  onScreenResultKey,
  readOnScreenResult,
  writeOnScreenResult,
  clearOnScreenResult,
} from "@/lib/assessments/onscreen-result-store";

const ALIAS = "demo-campaign";

/**
 * The opaque invitation cuid the slot is stamped with. Reads must present the
 * SAME key — i.e. the one `/me`'s 410 echoed — or the slot is refused.
 */
const KEY = "inv_respondent_a";
const OTHER_KEY = "inv_respondent_b";

const sampleReport = {
  respondentName: "Resp Ondent",
  templateAlias: "rockefeller",
  assessmentName: "Rockefeller Habits Checklist",
  submittedAt: new Date("2026-07-29T10:30:00.000Z"),
  result: { countAchieved: 12 },
  degraded: false,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("key derivation", () => {
  it("is scoped per campaign alias so two campaigns never collide", () => {
    expect(onScreenResultKey("a")).not.toBe(onScreenResultKey("b"));
  });

  it("is stable for the same alias", () => {
    expect(onScreenResultKey(ALIAS)).toBe(onScreenResultKey(ALIAS));
  });

  it("namespaces the key so it cannot clash with the answer draft", () => {
    expect(onScreenResultKey(ALIAS)).toContain(ALIAS);
    expect(onScreenResultKey(ALIAS)).not.toBe(ALIAS);
  });
});

describe("round trip", () => {
  it("returns null before anything is written", () => {
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  it("reads back what was written", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    const read = readOnScreenResult(ALIAS, KEY);
    expect(read).not.toBeNull();
    expect(read?.respondentName).toBe("Resp Ondent");
    expect(read?.templateAlias).toBe("rockefeller");
  });

  it("revives submittedAt as a real Date, not the JSON string", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    const read = readOnScreenResult(ALIAS, KEY);
    expect(read?.submittedAt).toBeInstanceOf(Date);
    expect((read?.submittedAt as Date).toISOString()).toBe(
      "2026-07-29T10:30:00.000Z",
    );
  });

  it("does not leak across aliases", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    expect(readOnScreenResult("other-campaign", KEY)).toBeNull();
  });
});

describe("purge", () => {
  it("clear removes the stored report", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    clearOnScreenResult(ALIAS);
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  it("clear on an empty slot is a no-op and never throws", () => {
    expect(() => clearOnScreenResult(ALIAS)).not.toThrow();
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });
});

describe("resilience — a corrupt slot must never break the page", () => {
  it("returns null for malformed JSON instead of throwing", () => {
    window.sessionStorage.setItem(onScreenResultKey(ALIAS), "{not json");
    expect(() => readOnScreenResult(ALIAS, KEY)).not.toThrow();
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  it("returns null when the payload is JSON but not a report object", () => {
    window.sessionStorage.setItem(onScreenResultKey(ALIAS), '"a string"');
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  it("returns null when the payload is missing the report envelope", () => {
    window.sessionStorage.setItem(onScreenResultKey(ALIAS), '{"foo":1}');
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  // jsdom's Storage methods are not jest.spyOn-able (the prototype methods are
  // not plain own properties), so swap the whole `sessionStorage` accessor for a
  // throwing stub — which is also a truer simulation of Safari private mode.
  function withHostileStorage(run: () => void) {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    const hostile = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("QuotaExceededError");
      },
      removeItem() {
        throw new Error("SecurityError");
      },
    };
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => hostile as unknown as Storage,
    });
    try {
      run();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
    }
  }

  it("write never throws when sessionStorage rejects (private mode / quota)", () => {
    withHostileStorage(() => {
      expect(() =>
        writeOnScreenResult(ALIAS, sampleReport as never, KEY),
      ).not.toThrow();
    });
  });

  it("read never throws when sessionStorage is unavailable", () => {
    withHostileStorage(() => {
      expect(() => readOnScreenResult(ALIAS, KEY)).not.toThrow();
      expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
    });
  });

  it("clear never throws when sessionStorage is unavailable", () => {
    withHostileStorage(() => {
      expect(() => clearOnScreenResult(ALIAS)).not.toThrow();
    });
  });
});

// ─── OWNERSHIP (PR #236 round-2 finding #1) ─────────────────────────────────
//
// The caller's `/me` 410 proves a live invitation cookie in this BROWSER. It
// does not prove that invitation owns the slot in THIS TAB — sessionStorage is
// per-tab while cookies are per-origin. Two co-invitees on one browser: A
// submits in tab 1, B exchanges in tab 2 (replacing the shared cookie and
// purging only tab 2), then B reloads tab 1. Without this check B sees A's full
// report. Each negative below is paired with the matching positive read, so it
// cannot pass just because the slot was empty.
describe("ownership — a slot only renders to the invitation it was written for", () => {
  it("REFUSES a report written for a different respondent", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    // Positive control: the rightful owner can read it.
    expect(readOnScreenResult(ALIAS, KEY)).not.toBeNull();

    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    expect(readOnScreenResult(ALIAS, OTHER_KEY)).toBeNull();
  });

  it("PURGES on a mismatch, so a later correct key cannot recover it either", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    expect(readOnScreenResult(ALIAS, OTHER_KEY)).toBeNull();
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  it("refuses a blank expected key — there is no skip-the-check path", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, KEY);
    expect(readOnScreenResult(ALIAS, "")).toBeNull();
  });

  it("refuses to STORE an unattributable report rather than write an unreadable slot", () => {
    writeOnScreenResult(ALIAS, sampleReport as never, "");
    expect(window.sessionStorage.getItem(onScreenResultKey(ALIAS))).toBeNull();
  });

  it("discards a pre-ownership (v1) envelope instead of trusting it", () => {
    // Exactly what a89470fe wrote: versioned, but with no owner recorded, so it
    // can never be attributed to the reader.
    window.sessionStorage.setItem(
      onScreenResultKey(ALIAS),
      JSON.stringify({ v: 1, issuedAt: Date.now(), report: sampleReport }),
    );
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });
});
