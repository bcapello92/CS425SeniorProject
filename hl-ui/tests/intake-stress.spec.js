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
}

async function sendReply(page, reply) {
  const input = page.locator(".chat-input input[type='text']");
  const sendButton = page.locator(".chat-input button").last();
  const beforeCount = await page.locator(".chat-window .message-user, .chat-window .message-bot").count();

  await input.fill(reply);
  await sendButton.click();

  await expect.poll(async () => {
    return page.locator(".chat-window .message-user, .chat-window .message-bot").count();
  }).toBeGreaterThan(beforeCount);

  await page.waitForFunction(
    ({ beforeCount, thankYouPattern }) => {
      const messageCount = document.querySelectorAll(
        ".chat-window .message-user, .chat-window .message-bot"
      ).length;
      const text = document.body.innerText || "";
      return messageCount >= beforeCount + 2 || new RegExp(thankYouPattern, "i").test(text);
    },
    {
      beforeCount,
      thankYouPattern: THANK_YOU_TEXT.source,
    }
  );
}

async function finishIntakeIfNeeded(page, language) {
  if (await page.getByRole("button", { name: START_ANOTHER_BUTTON }).isVisible().catch(() => false)) {
    return;
  }

  const fallback = language === "es" ? "No, eso es todo." : "No, that's all.";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suggestion = page.getByRole("button", {
      name: language === "es" ? /^No, eso es todo$/i : /^No, that's all$/i,
    });

    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click();
    } else {
      await sendReply(page, fallback);
    }

    if (await page.getByRole("button", { name: START_ANOTHER_BUTTON }).isVisible().catch(() => false)) {
      return;
    }
  }
}

for (const script of intakeScripts) {
  test(`seed intake: ${script.name}`, async ({ page }, testInfo) => {
    const patientId = buildPatientId(script, testInfo);
    testInfo.annotations.push({ type: "patientId", description: patientId });

    await openPatientIntake(page, script, patientId);

    for (const reply of script.answers || []) {
      await sendReply(page, reply);
    }

    await finishIntakeIfNeeded(page, script.language);

    await expect(page.getByRole("button", { name: START_ANOTHER_BUTTON })).toBeVisible();
    await expect(page.locator(".chat-window")).toContainText(THANK_YOU_TEXT);
  });
}
