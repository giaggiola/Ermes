import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createPopupSessionState } from "../src/welcome-popup-state.mjs";

test("a later automatic trigger cannot reopen a dismissed popup", () => {
  const session = createPopupSessionState();

  assert.equal(session.canOpen(), true);
  session.dismiss();
  assert.equal(session.canOpen(), false);
});

test("persistent suppression is checked whenever the popup tries to open", () => {
  const session = createPopupSessionState();

  assert.equal(session.canOpen(true), false);
  assert.equal(session.canOpen(false), true);
});

test("the generated popup asset is a valid classic browser script", () => {
  const asset = readFileSync(
    new URL(
      "../extensions/welcome-popup/assets/welcome-popup.js",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotThrow(() => new Function(asset));
});
