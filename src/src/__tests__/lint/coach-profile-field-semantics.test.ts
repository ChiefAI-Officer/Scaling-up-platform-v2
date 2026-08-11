import fs from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("coach profile field semantics", () => {
  it("does not expose the ambiguous Title / Credentials profile label", () => {
    const files = [
      "src/components/coach/coach-profile-form.tsx",
      "src/app/(dashboard)/bio/page.tsx",
      "src/app/(dashboard)/bio/[id]/page.tsx",
      "src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx",
    ];
    for (const file of files) {
      expect(source(file)).not.toContain("Title / Credentials");
      expect(source(file)).not.toContain("Title/Credentials");
    }
  });

  it("routes admin profile saves through the selected coach endpoint", () => {
    const form = source("src/components/coach/coach-profile-form.tsx");
    expect(form).toContain('saveTarget === "admin"');
    expect(form).toContain("`/api/coaches/${coachId}`");
  });

  it("shows both fields on coach creation and details", () => {
    const createPage = source("src/app/(dashboard)/coaches/new/page.tsx");
    const detailsPage = source("src/app/(dashboard)/coaches/[id]/page.tsx");
    for (const page of [createPage, detailsPage]) {
      expect(page).toContain("Professional Title");
      expect(page).toContain("Company Name");
    }
  });

  it("does not clear company as part of deleting a bio", () => {
    const editor = source("src/app/(dashboard)/bio/[id]/page.tsx");
    const deleteStart = editor.indexOf("const handleDeleteBio");
    const saveStart = editor.indexOf("const handleSave");
    expect(deleteStart).toBeGreaterThan(-1);
    expect(saveStart).toBeGreaterThan(deleteStart);
    const deleteHandler = editor.slice(deleteStart, saveStart);
    expect(deleteHandler).not.toMatch(/company\s*:/);
  });

  it("never maps Circle title into company", () => {
    const sync = source("src/services/circle-sync.ts");
    expect(sync).toContain("updateData.title = profile.title.trim()");
    expect(sync).not.toContain("updateData.company = profile.title");
    expect(sync).not.toContain('fieldsUpdated.push("company")');
  });

  it("uses the canonical resolver for landing-page title defaults", () => {
    const files = [
      "src/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page.tsx",
      "src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx",
      "src/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page.tsx",
    ];
    for (const file of files) {
      expect(source(file)).toContain("resolveCoachProfessionalTitle");
    }
    expect(source(files[2])).not.toMatch(/title:\s*w\.coach\.company/);
  });
});
