import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptsPath =
  process.env.INTAKE_SCRIPT_FILE ||
  path.join(__dirname, "fixtures", "intake-scripts.json");

const intakeScripts = JSON.parse(fs.readFileSync(scriptsPath, "utf8"));

const ENTRY_PLACEHOLDER = /12345|ABCD-123/i;
const BEGIN_CHAT_BUTTON = /Begin Chat|Comenzar Chat/i;
const START_ANOTHER_BUTTON = /Start another intake|Iniciar otra consulta/i;
const THANK_YOU_TEXT =
  /Thank you! Your information has been received by our medical team|Gracias! Su informaci.n ha sido recibida por nuestro equipo m.dico/i;
const TRIAGE_TRANSITION_TEXT =
  /send this to the medical team|send this to our medical team|triage info are sent to the medical team|env.e esto al equipo m.dico|la informaci.n de triaje se env.a al equipo m.dico/i;

test.describe.configure({ mode: "parallel" });

function buildPatientId(script, testInfo) {
  const base = String(script.patientId || script.name || "demo-patient")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const worker = `w${testInfo.workerIndex}`;
  const retry = `r${testInfo.retry}`;
  return `${base}-${timestamp}-${worker}-${retry}`;
}

async function waitForChatInput(page) {
  const input = page.locator(".chat-input input[type='text']");
  const sendButton = page.getByRole("button", { name: /^Send|Enviar$/i });
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(sendButton).toBeEnabled();
}

async function openPatientIntake(page, script, patientId) {
  await page.goto("/patient");
  await expect(page).toHaveURL(/\/patient$/);

  if (script.language === "es") {
    await page.getByRole("button", { name: /^Espa.ol$/i }).click();
  } else {
    await page.getByRole("button", { name: /^English$/i }).click();
  }

  await page.getByPlaceholder(ENTRY_PLACEHOLDER).fill(patientId);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: BEGIN_CHAT_BUTTON }).click();

  await expect(page.locator(".chat-input input[type='text']")).toBeVisible();
  await waitForChatInput(page);
}

async function sendReply(page, reply) {
  const input = page.locator(".chat-input input[type='text']");
  const sendButton = page.getByRole("button", { name: /^Send|Enviar$/i });
  await expect(input).toBeVisible();
  await input.click();
  await input.fill("");
  await input.fill(reply);
  await input.press("Enter").catch(() => {});
  await sendButton.click().catch(() => {});

  await page.waitForTimeout(3000);
}

async function finishIntakeIfNeeded(page, language) {
  if (await page.getByRole("button", { name: START_ANOTHER_BUTTON }).isVisible().catch(() => false)) {
    return;
  }

  const fallback = language === "es" ? "No, eso es todo." : "No, that's all.";
  const chatWindow = page.locator(".chat-window");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const chatText = (await chatWindow.textContent().catch(() => "")) || "";
    if (TRIAGE_TRANSITION_TEXT.test(chatText) || THANK_YOU_TEXT.test(chatText)) {
      return;
    }

    const suggestion = page.getByRole("button", {
      name: language === "es" ? /^No, eso es todo$/i : /^No, that's all$/i,
    });

    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click();
    } else {
      await sendReply(page, fallback);
    }

    const updatedChatText = (await chatWindow.textContent().catch(() => "")) || "";
    if (
      await page.getByRole("button", { name: START_ANOTHER_BUTTON }).isVisible().catch(() => false) ||
      TRIAGE_TRANSITION_TEXT.test(updatedChatText) ||
      THANK_YOU_TEXT.test(updatedChatText)
    ) {
      return;
    }
  }

  throw new Error("Intake did not reach triage submission state.");
}

for (const script of intakeScripts) {
  test(`seed intake: ${script.name}`, async ({ page }, testInfo) => {
    const patientId = buildPatientId(script, testInfo);
    testInfo.annotations.push({ type: "patientId", description: patientId });

    await openPatientIntake(page, script, patientId);

    for (const [index, reply] of (script.answers || []).entries()) {
      await test.step(`reply ${index + 1}: ${reply}`, async () => {
        await sendReply(page, reply);
      });
    }

    await finishIntakeIfNeeded(page, script.language);

    await expect(page.locator(".chat-window")).toContainText(TRIAGE_TRANSITION_TEXT);
    await expect(page.getByRole("button", { name: START_ANOTHER_BUTTON })).toBeVisible();
    await expect(page.locator(".chat-window")).toContainText(THANK_YOU_TEXT);
  });
}
