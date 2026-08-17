import { test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { expectResponsiveKillSwitchOverflow } from "./helpers/overflow";
import { assertDesktopParityEnvironment } from "./helpers/responsive-route-contract";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const MOBILE_RESPONSIVE_KILL_DIAGNOSTIC = process.env.MOBILE_RESPONSIVE_KILL_DIAGNOSTIC === "1";

test("kill switch restores the named compact overflow from the legacy admin shell", async ({ page }, testInfo) => {
  test.skip(!MOBILE_RESPONSIVE_KILL_DIAGNOSTIC, "Run explicitly with MOBILE_RESPONSIVE_KILL_DIAGNOSTIC=1");
  test.skip(testInfo.project.name !== "responsive-compact", "Kill overflow proof has one isolated compact project");
  assertDesktopParityEnvironment("kill", process.env);

  await page.setViewportSize({ width: 320, height: 844 });
  await loginAs(page, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    expectedUrl: /\/admin|\/dashboard/,
  });
  const diagnostic = await expectResponsiveKillSwitchOverflow(page, {
    role: "admin",
    route: "/admin/dashboard",
    project: testInfo.project.name,
    width: 320,
  });
  await testInfo.attach("kill-switch-overflow-offenders", {
    body: JSON.stringify(diagnostic, null, 2),
    contentType: "application/json",
  });
});
