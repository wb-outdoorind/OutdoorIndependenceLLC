import { expect, test } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("protected route redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/vehicles", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/login");
  expect(page.url()).toContain("next=%2Fvehicles");
});

test("notifications API rejects unauthenticated access", async ({ request }) => {
  const res = await request.get("/api/notifications");
  expect(res.status()).toBe(401);
});
