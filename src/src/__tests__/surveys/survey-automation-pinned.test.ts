/**
 * Wave 11-G: Survey template pinning bypasses isActive filter
 *
 * getOrCreateSurveyLink must use a pinned template regardless of isActive status.
 * Only the auto-attach path (no templateId) should be gated by isActive: true.
 */

// ── Mocks (declared before imports) ────────────────────────────────────────

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
    surveyTemplate: {
      findFirst: jest.fn(),
    },
    survey: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// survey-automation also imports smtp-transport — stub it out
jest.mock("@/lib/smtp-transport", () => ({
  sendEmailViaSMTP: jest.fn(),
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { getOrCreateSurveyLink } from "@/lib/surveys/survey-automation";

const mockDb = db as jest.Mocked<typeof db>;

const BASE_INPUT = {
  workshopId: "ws-1",
  registrationId: "reg-1",
  surveyType: "POST_WORKSHOP",
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: survey.create returns a new survey row
  (mockDb.survey.create as jest.Mock).mockResolvedValue({
    id: "survey-new",
    surveyUrl: "/survey/survey-new",
  });
  // Default: no existing survey
  (mockDb.survey.findFirst as jest.Mock).mockResolvedValue(null);
});

// ── Test 1: pinned INACTIVE template resolves ───────────────────────────────

it("uses pinned template even when isActive is false — does NOT fall back to auto-attach", async () => {
  // The template exists but is inactive
  (mockDb.surveyTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tmpl-inactive" });
  (mockDb.survey.findFirst as jest.Mock).mockResolvedValue(null);
  (mockDb.survey.create as jest.Mock).mockResolvedValue({ id: "survey-123" });

  const result = await getOrCreateSurveyLink({
    ...BASE_INPUT,
    templateId: "tmpl-inactive",
  });

  // Should resolve — not null
  expect(result).not.toBeNull();
  expect(result?.surveyId).toBe("survey-123");

  // surveyTemplate.findFirst must NOT have isActive in where clause
  expect(mockDb.surveyTemplate.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.not.objectContaining({ isActive: true }),
    })
  );

  // Specifically it should have been called with just the id
  expect(mockDb.surveyTemplate.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "tmpl-inactive" },
    })
  );
});

// ── Test 2: auto-attach path still filters by isActive ─────────────────────

it("auto-attach path returns null when no active template exists (isActive filter preserved)", async () => {
  // No templateId provided — triggers findTemplateForWorkshop (auto-attach path)
  // findTemplateForWorkshop first calls db.workshop.findUnique to get categoryId
  (mockDb.workshop.findUnique as jest.Mock).mockResolvedValue({ categoryId: "cat-1" });
  // Both category-specific and generic template lookups return null (no active template)
  (mockDb.surveyTemplate.findFirst as jest.Mock).mockResolvedValue(null);

  const result = await getOrCreateSurveyLink({
    ...BASE_INPUT,
    // no templateId — auto-attach path
  });

  expect(result).toBeNull();

  // The auto-attach path calls surveyTemplate.findFirst with isActive: true
  expect(mockDb.surveyTemplate.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ isActive: true }),
    })
  );
});

// ── Test 3: pinned template not found → returns null ───────────────────────

it("returns null when pinned templateId does not exist in DB", async () => {
  // Template lookup returns null (not found)
  (mockDb.surveyTemplate.findFirst as jest.Mock).mockResolvedValue(null);

  const result = await getOrCreateSurveyLink({
    ...BASE_INPUT,
    templateId: "tmpl-nonexistent",
  });

  expect(result).toBeNull();
  // surveyTemplate.findFirst called with id only (no isActive filter)
  expect(mockDb.surveyTemplate.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "tmpl-nonexistent" },
    })
  );
  // survey.create must NOT have been called
  expect(mockDb.survey.create).not.toHaveBeenCalled();
});
