import { getRegistrationDisplayStatus } from "@/lib/utils";

describe("getRegistrationDisplayStatus", () => {
  it("returns 'Awaiting Payment' when paymentStatus is PENDING and status is REGISTERED", () => {
    expect(getRegistrationDisplayStatus("REGISTERED", "PENDING")).toBe("Awaiting Payment");
  });

  it("returns 'Awaiting Payment' when paymentStatus is PENDING and status is PENDING_PAYMENT", () => {
    expect(getRegistrationDisplayStatus("PENDING_PAYMENT", "PENDING")).toBe("Awaiting Payment");
  });

  it("returns status as-is when paymentStatus is COMPLETED", () => {
    expect(getRegistrationDisplayStatus("CONFIRMED", "COMPLETED")).toBe("CONFIRMED");
  });

  it("returns status as-is when paymentStatus is FREE", () => {
    expect(getRegistrationDisplayStatus("REGISTERED", "FREE")).toBe("REGISTERED");
  });

  it("returns CANCELLED even when paymentStatus is PENDING", () => {
    expect(getRegistrationDisplayStatus("CANCELLED", "PENDING")).toBe("CANCELLED");
  });
});
