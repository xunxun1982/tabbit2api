import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { hasLabProfile, prepareLabProfile } from "../src/profile.js";
import { inspectInteractiveElements } from "../src/tabbit-session.js";

test("prepareLabProfile creates an empty runtime profile when source Default is missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tabbit2api-profile-"));
  const sourceUserDataDir = path.join(tempDir, "source");
  const labProfileDir = path.join(tempDir, "lab");

  await fs.mkdir(sourceUserDataDir, { recursive: true });

  const profile = await prepareLabProfile({
    sourceUserDataDir,
    labProfileDir,
  });

  assert.equal(profile.labProfileDir, labProfileDir);
  assert.equal(profile.defaultProfileDir, path.join(labProfileDir, "Default"));
  assert.equal(await hasLabProfile(labProfileDir), true);
});

test("prepareLabProfile copies existing Default profile while skipping cache directories", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tabbit2api-profile-"));
  const sourceUserDataDir = path.join(tempDir, "source");
  const labProfileDir = path.join(tempDir, "lab");
  const sourceDefault = path.join(sourceUserDataDir, "Default");

  await fs.mkdir(path.join(sourceDefault, "Cache"), { recursive: true });
  await fs.writeFile(path.join(sourceDefault, "Preferences"), "{}", "utf8");
  await fs.writeFile(path.join(sourceDefault, "Cache", "ignored"), "x", "utf8");

  await prepareLabProfile({
    sourceUserDataDir,
    labProfileDir,
  });

  assert.equal(
    await fs.readFile(path.join(labProfileDir, "Default", "Preferences"), "utf8"),
    "{}",
  );
  await assert.rejects(
    fs.access(path.join(labProfileDir, "Default", "Cache", "ignored")),
  );
});

test("inspectInteractiveElements defines visibility checks inside page context", async () => {
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const element = {
    tagName: "BUTTON",
    id: "ChatSendButton",
    textContent: "Send",
    getAttribute(name) {
      return name === "type" ? "button" : null;
    },
    getBoundingClientRect() {
      return { width: 32, height: 32 };
    },
  };
  const page = {
    evaluate: async (fn) => {
      delete globalThis.isVisibleElement;
      globalThis.document = {
        querySelectorAll(selector) {
          return selector === "button" ? [element] : [];
        },
      };
      globalThis.getComputedStyle = () => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
      });

      try {
        return new Function(`return (${fn.toString()})()`)();
      } finally {
        globalThis.document = previousDocument;
        globalThis.getComputedStyle = previousGetComputedStyle;
      }
    },
  };

  const elements = await inspectInteractiveElements(page);

  assert.deepEqual(elements, [
    {
      selector: "button",
      index: 0,
      tagName: "BUTTON",
      type: "button",
      role: null,
      id: "ChatSendButton",
      name: null,
      placeholder: null,
      ariaLabel: null,
      text: "Send",
    },
  ]);
});
