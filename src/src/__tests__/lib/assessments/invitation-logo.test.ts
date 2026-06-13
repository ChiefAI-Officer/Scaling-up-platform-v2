import { SU_LOGO_PNG, SU_LOGO_CID } from "@/lib/assets/invitation-logo";

describe("invitation logo asset", () => {
  it("is a non-empty Buffer", () => {
    expect(Buffer.isBuffer(SU_LOGO_PNG)).toBe(true);
    expect(SU_LOGO_PNG.length).toBeGreaterThan(200);
  });
  it("decodes to a PNG (magic bytes)", () => {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(SU_LOGO_PNG.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });
  it("exposes a stable CID", () => {
    expect(SU_LOGO_CID).toBe("sulogo");
  });
});
