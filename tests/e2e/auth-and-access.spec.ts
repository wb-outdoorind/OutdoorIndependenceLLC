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

test("core protected routes redirect to login when unauthenticated", async ({ page }) => {
  const routes = ["/maintenance", "/approvals", "/form-reports", "/notifications", "/employees", "/equipment"];
  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/login");
  }
});

test("notifications API rejects unauthenticated access", async ({ request }) => {
  const res = await request.get("/api/notifications");
  expect(res.status()).toBe(401);
});

test("notifications write API rejects unauthenticated access", async ({ request }) => {
  const res = await request.post("/api/notifications", {
    data: { action: "mark_all_read" },
  });
  expect(res.status()).toBe(401);
});

test("SLA alerts API rejects unauthenticated access", async ({ request }) => {
  const res = await request.get("/api/sla-alerts");
  expect(res.status()).toBe(401);
});

test("SLA runs API rejects unauthenticated access", async ({ request }) => {
  const res = await request.get("/api/sla-alerts/runs");
  expect(res.status()).toBe(401);
});

test("digest runs API rejects unauthenticated access", async ({ request }) => {
  const res = await request.get("/api/trend-actions/digest/runs");
  expect(res.status()).toBe(401);
});

test("employee invite API rejects unauthenticated writes", async ({ request }) => {
  const res = await request.post("/api/employees/invite", {
    data: {
      email: "test@example.com",
      full_name: "Test User",
      role: "team_member_1",
      department: "Mowing",
      phone_number: "555-000-0000",
    },
  });
  expect([401, 403]).toContain(res.status());
});
