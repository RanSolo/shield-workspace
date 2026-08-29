import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicPath } from "../scripts/server.mjs";

test("local server rejects traversal paths", () => {
  const root = "/tmp/document-trail/dist";
  assert.equal(resolvePublicPath(root, "/../package.json"), null);
  assert.equal(resolvePublicPath(root, "/%2e%2e/package.json"), null);
  assert.equal(resolvePublicPath(root, "/index.html"), `${root}/index.html`);
  assert.equal(resolvePublicPath(root, "/package.json"), null);
});
