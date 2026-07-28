import assert from "node:assert/strict";
import test from "node:test";

import { greeting } from "../src/greeting.mjs";

test("normalizes surrounding whitespace before greeting", () => {
  assert.equal(greeting("  Daisy  "), "Hello, Daisy!");
});
