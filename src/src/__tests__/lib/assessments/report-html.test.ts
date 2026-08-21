import {
  extractReportHtml,
  loadSafeReportHtml,
  mergeReportHtml,
  prepareReportHtmlForStorage,
} from "@/lib/assessments/report-html";

describe("report HTML configuration", () => {
  it("preserves unrelated report configuration", () => {
    const next = mergeReportHtml(
      {
        publicMarketing: { scoreBands: [{ min: 0, max: 100 }] },
        peer: { enabled: true },
      },
      {
        schemaVersion: 1,
        introductionHtml: "<p>Intro</p>",
        conclusionHtml: null,
      },
    );

    expect(next).toEqual({
      publicMarketing: { scoreBands: [{ min: 0, max: 100 }] },
      peer: { enabled: true },
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: "<p>Intro</p>",
        conclusionHtml: null,
      },
    });
  });

  it("normalizes blank values and stores canonical HTML", () => {
    const prepared = prepareReportHtmlForStorage({
      untouched: { value: 42 },
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: "  ",
        conclusionHtml: '<p onclick="evil()">Safe</p>',
      },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error("expected success");
    expect(prepared.reportConfig).toMatchObject({ untouched: { value: 42 } });
    expect(extractReportHtml(prepared.reportConfig)).toEqual({
      schemaVersion: 1,
      introductionHtml: null,
      conclusionHtml: "<p>Safe</p>",
    });
    expect(prepared.didStripContent).toBe(true);
  });

  it("applies the smaller closing-message limit without rejecting the same welcome content", () => {
    const text = "x".repeat(901);
    const prepared = prepareReportHtmlForStorage({
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: `<p>${text}</p>`,
        conclusionHtml: `<p>${text}</p>`,
      },
    });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected the closing-message limit to fail");
    expect(prepared.issues).toEqual([
      {
        path: "reportHtml.conclusionHtml",
        message: expect.stringMatching(/text/i),
      },
    ]);
  });

  it("leaves configuration without reportHtml unchanged", () => {
    const reportConfig = { publicMarketing: { scoreBands: [] } };
    const prepared = prepareReportHtmlForStorage(reportConfig);

    expect(prepared).toEqual({
      ok: true,
      reportConfig,
      didStripContent: false,
    });
  });

  it("rejects malformed fragments without deleting unrelated configuration", () => {
    const reportConfig = {
      publicMarketing: { scoreBands: [{ min: 0, max: 10 }] },
      reportHtml: {
        schemaVersion: 1,
        introductionHtml: 42,
        conclusionHtml: "<p>CTA</p>",
      },
    };
    const prepared = prepareReportHtmlForStorage(reportConfig);

    expect(prepared.ok).toBe(false);
    if (prepared.ok) throw new Error("expected failure");
    expect(prepared.reportConfig).toBe(reportConfig);
    expect(prepared.issues).toEqual([
      {
        path: "reportHtml.introductionHtml",
        message: "Expected a string or null.",
      },
    ]);
  });

  it("re-sanitizes stored fragments independently and reports canonical drift", () => {
    const onDrift = jest.fn();

    expect(
      loadSafeReportHtml(
        {
          reportHtml: {
            schemaVersion: 1,
            introductionHtml: "<script>bad()</script><p>safe</p>",
            conclusionHtml: "<p>CTA</p>",
          },
        },
        { onDrift },
      ),
    ).toEqual({
      introductionHtml: "<p>safe</p>",
      conclusionHtml: "<p>CTA</p>",
    });
    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledWith("introductionHtml");
  });

  it("drops only a malformed stored fragment", () => {
    const onDrift = jest.fn();

    expect(
      loadSafeReportHtml(
        {
          reportHtml: {
            schemaVersion: 1,
            introductionHtml: { unsafe: true },
            conclusionHtml: "<p>CTA</p>",
          },
        },
        { onDrift },
      ),
    ).toEqual({ introductionHtml: null, conclusionHtml: "<p>CTA</p>" });
    expect(onDrift).toHaveBeenCalledWith("introductionHtml");
  });
});
