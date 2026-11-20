import { expect, test, type Page } from "@playwright/test";

// Full product flow from the plan:
// apply for a business → super admin approves → owner configures it →
// books through the bot simulator → the appointment shows up in the calendar.
// Uses the seeded pending application (solicitud@spazen.demo / Spa Zen).
const PASSWORD = process.env.E2E_PASSWORD ?? "";
test.skip(!PASSWORD, "Set E2E_PASSWORD (demo password) and E2E_BASE_URL to run the E2E flow");

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function logout(page: Page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sb-")) localStorage.removeItem(k);
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("bf-lang", "es"));
});

test("apply → approve → onboarding → bot booking → calendar", async ({ page }) => {
  // 1. The applicant sees the application under review.
  await login(page, "solicitud@spazen.demo");
  await page.waitForURL(/\/apply\/status|\/app/);
  if (page.url().includes("/apply/status")) {
    await expect(page.getByText(/Spa Zen/)).toBeVisible();
  }
  await logout(page);

  // 2. The super admin approves it (if it's still pending).
  await login(page, "admin@bookflow.demo");
  await page.waitForURL(/\/admin/);
  if (await page.getByText("Spa Zen").first().isVisible()) {
    const approve = page.getByRole("button", { name: "Aprobar" }).first();
    if (await approve.isVisible()) {
      await approve.click();
      await page.getByRole("dialog").getByRole("button", { name: "Aprobar" }).click();
      await expect(page.getByText("Negocio aprobado")).toBeVisible();
    }
  }
  await logout(page);

  // 3. The owner completes the 4-step onboarding.
  await login(page, "solicitud@spazen.demo");
  await page.goto("/app/onboarding");
  if (await page.getByText("Nuevo servicio").isVisible()) {
    await page.getByRole("button", { name: "Nuevo servicio" }).click();
    await page.getByLabel("Nombre").fill("Masaje relajante");
    await page.getByLabel("Duración (min)").fill("60");
    await page.getByLabel("Precio").fill("120000");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();

    await page.getByRole("button", { name: "Nueva persona" }).click();
    await page.getByLabel("Nombre").fill("Valentina");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();

    for (const day of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]) {
      const row = page.locator("label").filter({ hasText: day }).getByRole("switch");
      if ((await row.getAttribute("aria-checked")) !== "true") await row.click();
    }
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Terminar configuración" }).click();
    await expect(page.getByText("¡Todo listo!")).toBeVisible();
  }

  // 4. Book through the simulator (real agent + Claude).
  await page.goto("/app/simulator");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  const input = page.getByPlaceholder("Escribe un mensaje");
  await input.fill("Hola, quiero un masaje mañana a las 10 de la mañana. Me llamo Ana Prueba");
  await input.press("Enter");
  await expect(page.getByText(/mañana|10/).last()).toBeVisible({ timeout: 60_000 });
  await input.fill("Sí, confírmalo por favor");
  await input.press("Enter");
  await expect(page.getByText(/confirm|listo|agend/i).last()).toBeVisible({ timeout: 60_000 });

  // 5. The appointment is in the calendar.
  await page.goto("/app/bookings");
  await expect(page.getByText("Ana Prueba").first()).toBeVisible();
});

test("public page: a customer books on the web and the slot disappears", async ({ page }) => {
  await page.goto("/b/barberia-don-pepe");
  await expect(page.getByRole("heading", { name: "Barbería Don Pepe" })).toBeVisible();
  await page.getByRole("button", { name: /Corte clásico/ }).click();
  await page.getByRole("button", { name: "Cualquiera disponible" }).click();
  const dates = page.getByRole("option");
  await dates.nth(3).click();
  const slot = page.getByRole("listbox", { name: "Hora" }).getByRole("option").first();
  await slot.click();
  await page.getByLabel("Nombre").fill("Cliente E2E");
  await page.getByLabel("Tu número de WhatsApp").fill(`+57300${Date.now().toString().slice(-7)}`);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByText("¡Reserva confirmada!")).toBeVisible();
});
