jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
    survey: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/typeform", () => ({
  getSurveyTypeFromFormId: jest.fn(),
}));

import crypto from "crypto";
import { POST } from "@/app/api/webhooks/typeform/route";
import { db } from "@/lib/db";
import { getSurveyTypeFromFormId } from "@/lib/typeform";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-typeform-webhook-secret";

function signPayload(body: string, secret = TEST_SECRET): string {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");
  return `sha256=${hash}`;
}

function buildWebhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "evt-tf-1",
    event_type: "form_response",
    form_response: {
      form_id: "form-pre-1",
      token: "unique-token-abc",
      submitted_at: "2026-05-01T10:00:00Z",
      hidden: {
        workshop_id: "ws-1",
        registration_id: "reg-1",
      },
      answers: [
        {
          field: { id: "field-1", type: "opinion_scale" },
          type: "number",
          number: 9,
        },
        {
          field: { id: "field-2", type: "short_text" },
          type: "text",
          text: "Great workshop!",
        },
      ],
      ...overrides,
    },
  };
}

function buildRequest(options: {
  body?: string;
  signature?: string | null;
}): Parameters<typeof POST>[0] {
  const headers = new Headers();
  if (options.signature !== undefined && options.signature !== null) {
    headers.set("typeform-signature", options.signature);
  }

  return {
    headers,
    text: async () => options.body || "{}",
  } as unknown as Parameters<typeof POST>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Typeform webhook API", () => {
  const originalSecret = process.env.TYPEFORM_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TYPEFORM_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.TYPEFORM_WEBHOOK_SECRET = originalSecret;
  });

  describe("configuration guard", () => {
    beforeEach(() => {
      // Override the outer beforeEach which sets TYPEFORM_WEBHOOK_SECRET = TEST_SECRET
      delete process.env.TYPEFORM_WEBHOOK_SECRET;
    });

    it("returns 503 when TYPEFORM_WEBHOOK_SECRET is not set", async () => {
      const body = JSON.stringify({ event_id: "x" });
      const response = await POST(
        buildRequest({ body, signature: "sha256=fakesig" })
      );
      expect(response.status).toBe(503);
      const json = await response.json();
      expect(json.error).toBe("Webhook misconfigured");
    });
  });

  // -----------------------------------------------------------------------
  // Signature verification
  // -----------------------------------------------------------------------
  it("returns 400 when signature header is missing", async () => {
    const body = JSON.stringify(buildWebhookPayload());

    const response = await POST(
      buildRequest({ body, signature: null })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when signature is invalid", async () => {
    const body = JSON.stringify(buildWebhookPayload());

    const response = await POST(
      buildRequest({ body, signature: "sha256=invalid-signature" })
    );

    expect(response.status).toBe(400);
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------
  it("valid webhook creates new survey when no pending record exists", async () => {
    const payload = buildWebhookPayload();
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    // No duplicate
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)  // duplicate check
      .mockResolvedValueOnce(null); // pending survey check
    (db.survey.create as jest.Mock).mockResolvedValue({ id: "survey-new" });

    const response = await POST(buildRequest({ body, signature }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.received).toBe(true);
    expect(db.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: "ws-1",
        registrationId: "reg-1",
        surveyType: "PRE_WORKSHOP",
        npsScore: 9,
      }),
    });
  });

  it("valid webhook updates existing pending survey", async () => {
    const payload = buildWebhookPayload();
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    // No duplicate, but pending survey exists
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)                         // duplicate check
      .mockResolvedValueOnce({ id: "survey-pending" });    // pending survey
    (db.survey.update as jest.Mock).mockResolvedValue({ id: "survey-pending" });

    const response = await POST(buildRequest({ body, signature }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.received).toBe(true);
    expect(db.survey.update).toHaveBeenCalledWith({
      where: { id: "survey-pending" },
      data: expect.objectContaining({
        npsScore: 9,
        completedAt: expect.any(Date),
      }),
    });
    expect(db.survey.create).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------
  it("duplicate form_response.token skips processing", async () => {
    const payload = buildWebhookPayload();
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    // Duplicate exists
    (db.survey.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "survey-existing",
    });

    const response = await POST(buildRequest({ body, signature }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.duplicate).toBe(true);
    expect(db.survey.create).not.toHaveBeenCalled();
    expect(db.survey.update).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Workshop not found — still returns 200
  // -----------------------------------------------------------------------
  it("returns 200 when workshop not found (Typeform convention)", async () => {
    const payload = buildWebhookPayload();
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(buildRequest({ body, signature }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.received).toBe(true);
    expect(responseBody.error).toBe("workshop not found");
  });

  // -----------------------------------------------------------------------
  // NPS score extraction
  // -----------------------------------------------------------------------
  it("correctly extracts opinion_scale NPS number", async () => {
    const payload = buildWebhookPayload({
      answers: [
        {
          field: { id: "nps-field", type: "opinion_scale" },
          type: "number",
          number: 7,
        },
      ],
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("POST_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.survey.create as jest.Mock).mockResolvedValue({ id: "survey-nps" });

    await POST(buildRequest({ body, signature }));

    expect(db.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        npsScore: 7,
      }),
    });
  });

  // -----------------------------------------------------------------------
  // Survey type mapping
  // -----------------------------------------------------------------------
  it("pre-workshop survey: maps form_id to correct survey type", async () => {
    const payload = buildWebhookPayload({ form_id: "form-pre-1" });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.survey.create as jest.Mock).mockResolvedValue({ id: "survey-pre" });

    await POST(buildRequest({ body, signature }));

    expect(getSurveyTypeFromFormId).toHaveBeenCalledWith("form-pre-1");
    expect(db.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        surveyType: "PRE_WORKSHOP",
      }),
    });
  });

  it("post-workshop survey: maps form_id to correct survey type", async () => {
    const payload = buildWebhookPayload({ form_id: "form-post-1" });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("POST_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.survey.create as jest.Mock).mockResolvedValue({ id: "survey-post" });

    await POST(buildRequest({ body, signature }));

    expect(db.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        surveyType: "POST_WORKSHOP",
      }),
    });
  });

  // -----------------------------------------------------------------------
  // Hidden fields extraction
  // -----------------------------------------------------------------------
  it("extracts workshop_id and registration_id from hidden fields", async () => {
    const payload = buildWebhookPayload({
      hidden: {
        workshop_id: "ws-hidden-1",
        registration_id: "reg-hidden-1",
      },
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-hidden-1" });
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.survey.create as jest.Mock).mockResolvedValue({ id: "survey-hid" });

    await POST(buildRequest({ body, signature }));

    expect(db.workshop.findUnique).toHaveBeenCalledWith({
      where: { id: "ws-hidden-1" },
      select: { id: true },
    });
    expect(db.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: "ws-hidden-1",
        registrationId: "reg-hidden-1",
      }),
    });
  });

  // -----------------------------------------------------------------------
  // Returns 200 on unknown form ID (Typeform convention)
  // -----------------------------------------------------------------------
  it("returns 200 for unknown form_id so Typeform does not retry", async () => {
    const payload = buildWebhookPayload({ form_id: "unknown-form" });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue(null);

    const response = await POST(buildRequest({ body, signature }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.matched).toBe(false);
    expect(db.survey.create).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Returns 200 when missing workshop_id hidden field
  // -----------------------------------------------------------------------
  it("returns 200 when workshop_id hidden field is missing", async () => {
    const payload = buildWebhookPayload({
      hidden: { registration_id: "reg-1" },
    });
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");

    const response = await POST(buildRequest({ body, signature }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.error).toBe("missing workshop_id");
    expect(db.workshop.findUnique).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Internal error still returns 500 (caught by outer try/catch)
  // -----------------------------------------------------------------------
  it("returns 500 on unexpected internal error", async () => {
    const payload = buildWebhookPayload();
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockRejectedValue(
      new Error("Database connection lost")
    );

    const response = await POST(buildRequest({ body, signature }));

    expect(response.status).toBe(500);
  });

  // -----------------------------------------------------------------------
  // Signature verification with trailing newline (Typeform quirk)
  // -----------------------------------------------------------------------
  it("accepts signature computed with trailing newline (Typeform quirk)", async () => {
    const payload = buildWebhookPayload();
    const body = JSON.stringify(payload);
    // Compute signature against body + "\n"
    const hash = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(body + "\n")
      .digest("base64");
    const signature = `sha256=${hash}`;

    (getSurveyTypeFromFormId as jest.Mock).mockReturnValue("PRE_WORKSHOP");
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (db.survey.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.survey.create as jest.Mock).mockResolvedValue({ id: "survey-quirk" });

    const response = await POST(buildRequest({ body, signature }));

    expect(response.status).toBe(200);
    expect(db.survey.create).toHaveBeenCalled();
  });
});
