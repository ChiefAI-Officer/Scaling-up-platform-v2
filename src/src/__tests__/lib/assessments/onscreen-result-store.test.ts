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
 *  - the key is derived from the CAMPAIGN ALIAS, not respondentKey, because on
 *    a refresh /me fails and respondentKey is unavailable;
 *  - so a fresh token exchange MUST purge the slot, otherwise a second invitee
 *    arriving in the same tab could be shown the first one's report.
 */

import {
  onScreenResultKey,
  readOnScreenResult,
  writeOnScreenResult,
  clearOnScreenResult,
} from "@/lib/assessments/onscreen-result-store";

const ALIAS = "demo-campaign";

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
    expect(readOnScreenResult(ALIAS)).toBeNull();
  });

  it("reads back what was written", () => {
    writeOnScreenResult(ALIAS, sampleReport as never);
    const read = readOnScreenResult(ALIAS);
    expect(read).not.toBeNull();
    expect(read?.respondentName).toBe("Resp Ondent");
    expect(read?.templateAlias).toBe("rockefeller");
  });

  it("revives submittedAt as a real Date, not the JSON string", () => {
    writeOnScreenResult(ALIAS, sampleReport as never);
    const read = readOnScreenResult(ALIAS);
    expect(read?.submittedAt).toBeInstanceOf(Date);
    expect((read?.submittedAt as Date).toISOString()).toBe(
      "2026-07-29T10:30:00.000Z",
    );
  });

  it("does not leak across aliases", () => {
    writeOnScreenResult(ALIAS, sampleReport as never);
    expect(readOnScreenResult("other-campaign")).toBeNull();
  });
});

describe("purge", () => {
  it("clear removes the stored report", () => {
    writeOnScreenResult(ALIAS, sampleReport as never);
    clearOnScreenResult(ALIAS);
    expect(readOnScreenResult(ALIAS)).toBeNull();
  });

  it("clear on an empty slot is a no-op and never throws", () => {
    expect(() => clearOnScreenResult(ALIAS)).not.toThrow();
    expect(readOnScreenResult(ALIAS)).toBeNull();
  });
});

describe("resilience — a corrupt slot must never break the page", () => {
  it("returns null for malformed JSON instead of throwing", () => {
    window.sessionStorage.setItem(onScreenResultKey(ALIAS), "{not json");
    expect(() => readOnScreenResult(ALIAS)).not.toThrow();
    expect(readOnScreenResult(ALIAS)).toBeNull();
  });

  it("returns null when the payload is JSON but not a report object", () => {
    window.sessionStorage.setItem(onScreenResultKey(ALIAS), '"a string"');
    expect(readOnScreenResult(ALIAS)).toBeNull();
  });

  it("returns null when the payload is missing the report envelope", () => {
    window.sessionStorage.setItem(onScreenResultKey(ALIAS), '{"foo":1}');
    expect(readOnScreenResult(ALIAS)).toBeNull();
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
        writeOnScreenResult(ALIAS, sampleReport as never),
      ).not.toThrow();
    });
  });

  it("read never throws when sessionStorage is unavailable", () => {
    withHostileStorage(() => {
      expect(() => readOnScreenResult(ALIAS)).not.toThrow();
      expect(readOnScreenResult(ALIAS)).toBeNull();
    });
  });

  it("clear never throws when sessionStorage is unavailable", () => {
    withHostileStorage(() => {
      expect(() => clearOnScreenResult(ALIAS)).not.toThrow();
    });
  });
});
