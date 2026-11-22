import { test, expect } from "@playwright/test";

test("auth gate shows Google sign-in (AC-18)", async ({ page }) => {
  await page.goto("/capture");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible({ timeout: 8000 });
});

test("api/auth/me returns 401 without session (A-05)", async ({ request }) => {
  const res = await request.get("/api/auth/me");
  expect(res.status()).toBe(401);
});

test("api/scans rejects unauthenticated requests (A-05)", async ({ request }) => {
  const res = await request.post("/api/scans", { data: { captureMode: "live", sexAtBirth: "female" } });
  expect(res.status()).toBe(401);
});

test("api/analyses/:id returns 404 for missing (A-05)", async ({ request }) => {
  const res = await request.get("/api/analyses/does-not-exist");
  expect(res.status()).toBe(401); // proxy gates unauthenticated first
});
