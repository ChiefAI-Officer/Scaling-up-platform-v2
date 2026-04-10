jest.mock("@/lib/db", () => ({
  db: {
    surveyTemplate: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { deleteSurveyTemplate } from "@/lib/surveys/survey-service";

describe("survey-service deleteSurveyTemplate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("archives a template when survey history exists", async () => {
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      name: "Post Event",
      _count: { surveys: 3 },
      questions: [],
    });
    (db.surveyTemplate.update as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      isActive: false,
      _count: { surveys: 3 },
      questions: [],
    });

    const result = await deleteSurveyTemplate("tpl-1");

    expect(db.surveyTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tpl-1" },
        data: { isActive: false },
      })
    );
    expect(db.surveyTemplate.delete).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        action: "archived",
        template: expect.objectContaining({
          id: "tpl-1",
          isActive: false,
        }),
      })
    );
  });

  it("hard deletes a template with no survey history", async () => {
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-2",
      name: "Unused",
      _count: { surveys: 0 },
      questions: [],
    });
    (db.surveyTemplate.delete as jest.Mock).mockResolvedValue({
      id: "tpl-2",
    });

    const result = await deleteSurveyTemplate("tpl-2");

    expect(db.surveyTemplate.delete).toHaveBeenCalledWith({
      where: { id: "tpl-2" },
    });
    expect(db.surveyTemplate.update).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "deleted", template: { id: "tpl-2" } });
  });

  it("throws when the template does not exist", async () => {
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(deleteSurveyTemplate("missing")).rejects.toThrow("Template not found");
    expect(db.surveyTemplate.update).not.toHaveBeenCalled();
    expect(db.surveyTemplate.delete).not.toHaveBeenCalled();
  });
});
