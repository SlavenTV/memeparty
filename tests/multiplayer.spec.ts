import { test, expect } from "@playwright/test";
test("two independent players complete two rounds, with F5 reconnect", async ({
  browser,
}) => {
  const ca = await browser.newContext();
  const cb = await browser.newContext();
  const a = await ca.newPage();
  const b = await cb.newPage();
  await a.goto("/");
  await a.screenshot({ path: "qa/start-desktop.png", fullPage: true });
  await a.getByLabel("Dein Nickname", { exact: true }).fill("Alpha");
  await a.getByRole("button", { name: "Los geht’s" }).click();
  await a
    .getByRole("button", { name: "Lobby erstellen", exact: true })
    .last()
    .click();
  await expect(
    a.getByRole("heading", { name: "Spieler", exact: true }),
  ).toBeVisible();
  const code = (await a.locator(".code-chip").innerText()).slice(0, 6);
  await a.getByLabel("Runden", { exact: true }).fill("2");
  await a.getByLabel("Zeit zum Schreiben").fill("10");
  await a.getByLabel("Zeit zum Voten").fill("10");
  await a.getByRole("button", { name: "Regeln speichern" }).click();
  await b.goto(`/join/${code}`);
  await b.getByLabel("Dein Nickname", { exact: true }).fill("Bravo");
  await b.getByRole("button", { name: "Los geht’s" }).click();
  await b
    .getByRole("button", { name: "Beitreten", exact: true })
    .last()
    .click();
  await expect(
    b.getByRole("heading", { name: "Spieler", exact: true }),
  ).toBeVisible();
  await a.getByRole("button", { name: "Bereit", exact: true }).click();
  await b.getByRole("button", { name: "Bereit", exact: true }).click();
  await expect(a.getByRole("button", { name: "Spiel starten" })).toBeEnabled();
  await a.getByRole("button", { name: "Spiel starten" }).click();
  for (let round = 1; round <= 2; round++) {
    const aCaption = a.getByRole("group", { name: "Textfeld 1", exact: true });
    const bCaption = b.getByRole("group", { name: "Textfeld 1", exact: true });
    await expect(aCaption).toBeVisible({
      timeout: 15000,
    });
    await aCaption.locator(".caption-text").dblclick();
    await a.getByLabel("Text direkt bearbeiten 1", { exact: true }).fill(`Alpha ${round}`);
    await a.getByLabel("Text direkt bearbeiten 1", { exact: true }).press("Escape");
    await expect(a.locator(".editor-grid .caption-text").first()).toHaveText(
      `Alpha ${round}`,
    );
    if (round === 1)
      await a.screenshot({ path: "qa/editor-desktop.png", fullPage: true });
    await bCaption.locator(".caption-text").dblclick();
    await b.getByLabel("Text direkt bearbeiten 1", { exact: true }).fill(`Bravo ${round}`);
    await b.getByLabel("Text direkt bearbeiten 1", { exact: true }).press("Escape");
    if (round === 1) {
      await a.waitForTimeout(1000);
      await a.reload();
      await expect(
        a.getByRole("group", { name: "Textfeld 1", exact: true }).locator(".caption-text"),
      ).toHaveText("Alpha 1");
    }
    await a.getByRole("button", { name: "Meme abgeben" }).click();
    await b.getByRole("button", { name: "Meme abgeben" }).click();
    await expect(
      a.getByRole("heading", { name: "Was bringt dich zum Lachen?" }),
    ).toBeVisible({ timeout: 20000 });
    await a.getByRole("button", { name: "♥ Like" }).click();
    await b.getByRole("button", { name: "♥ Like" }).click();
    await expect(
      a.getByRole("heading", { name: "Die Runde gehört euch." }),
    ).toBeVisible({ timeout: 20000 });
  }
  await expect(
    a.getByRole("heading", { name: "Das große Finale." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(a.locator(".leaderboard")).toContainText("Alpha");
  await expect(a.locator(".leaderboard")).toContainText("200");
  await ca.close();
  await cb.close();
});

test("mobile start and lobby remain usable in portrait and landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Dein Nickname", { exact: true })).toBeVisible();
  await page.screenshot({ path: "qa/start-mobile.png", fullPage: true });
  await page.getByLabel("Dein Nickname", { exact: true }).fill("Mobile");
  await page.getByRole("button", { name: "Los geht’s" }).click();
  await page
    .getByRole("button", { name: "Lobby erstellen", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Spieler", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "qa/lobby-mobile.png", fullPage: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Bereit", exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Sprache", { exact: true }).selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
});

test("direct text editing, dragging, resize, rotation and private reroll survive refresh", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  await a.goto("/");
  await a.getByLabel("Dein Nickname", { exact: true }).fill("EditorAlpha");
  await a.getByRole("button", { name: "Los geht’s" }).click();
  await a
    .getByLabel("Meme-Wechsel pro Spieler und Runde", { exact: true })
    .fill("1");
  await a.getByLabel("Eigene Illustrationen", { exact: true }).check();
  for (const name of [
    "Klassiker",
    "Reaktionen",
    "Tiere",
    "Comics & Cartoons",
    "Arbeit & Alltag",
  ])
    await a.getByLabel(name, { exact: true }).uncheck();
  await a
    .getByRole("button", { name: "Lobby erstellen", exact: true })
    .last()
    .click();
  const code = (await a.locator(".code-chip").innerText()).slice(0, 6);
  await a.getByLabel("Zeit zum Schreiben").fill("120");
  await a.getByRole("button", { name: "Regeln speichern" }).click();
  await b.goto(`/join/${code}`);
  await b.getByLabel("Dein Nickname", { exact: true }).fill("EditorBravo");
  await b.getByRole("button", { name: "Los geht’s" }).click();
  await b
    .getByRole("button", { name: "Beitreten", exact: true })
    .last()
    .click();
  await a.getByRole("button", { name: "Bereit", exact: true }).click();
  await b.getByRole("button", { name: "Bereit", exact: true }).click();
  await a.getByRole("button", { name: "Spiel starten" }).click();
  const caption = a.getByRole("group", { name: "Textfeld 1", exact: true });
  await expect(caption).toBeVisible();
  await caption.locator(".caption-text").dblclick();
  await a
    .getByLabel("Text direkt bearbeiten 1", { exact: true })
    .fill("Direkt im Bild");
  await a
    .getByLabel("Text direkt bearbeiten 1", { exact: true })
    .press("Escape");
  await expect(caption.locator(".caption-text")).toHaveText("Direkt im Bild");
  const drag = async (label: string, dx: number, dy: number) => {
    const box = await a
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    if (!box) throw Error("Handle missing");
    await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await a.mouse.down();
    await a.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      { steps: 8 },
    );
    await a.mouse.up();
  };
  const before = await caption.getAttribute("style");
  await drag("Text verschieben", 30, 65);
  expect(await caption.getAttribute("style")).not.toBe(before);
  const moved = await caption.getAttribute("style");
  await drag("Textgröße ändern", -35, 25);
  expect(await caption.getAttribute("style")).not.toBe(moved);
  await drag("Text drehen", 45, 35);
  expect(await caption.getAttribute("style")).not.toContain("rotate(0deg)");
  const finalStyle = await caption.getAttribute("style");
  const otherSrc = await b
    .locator(".editor-grid .meme img")
    .getAttribute("src");
  const src = await a.locator(".editor-grid .meme img").getAttribute("src");
  await a.getByRole("button", { name: /Meme wechseln/ }).click();
  await expect(a.getByRole("button", { name: /Meme wechseln/ })).toBeDisabled();
  expect(
    await a.locator(".editor-grid .meme img").getAttribute("src"),
  ).not.toBe(src);
  expect(await b.locator(".editor-grid .meme img").getAttribute("src")).toBe(
    otherSrc,
  );
  await a.waitForTimeout(1000);
  await a.reload();
  await expect(caption.locator(".caption-text")).toHaveText("Direkt im Bild");
  await expect(caption).toHaveAttribute("style", finalStyle!);
  await expect(a.getByRole("button", { name: /Meme wechseln/ })).toBeDisabled();
  await a.screenshot({ path: "qa/editor-direct-desktop.png", fullPage: true });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({ path: "qa/editor-direct-mobile.png", fullPage: true });
  expect(
    await a.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await ca.close();
  await cb.close();
});
