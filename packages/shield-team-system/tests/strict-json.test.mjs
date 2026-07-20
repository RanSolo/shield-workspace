import assert from "node:assert/strict";
import test from "node:test";

import { strictParseJson } from "../scripts/model/strict-json.mjs";

test("strict JSON accepts closed bounded data", () => {
  const parsed = strictParseJson('{"path":"src/index.mts","flags":[true,null,3]}', { maxDepth: 4 });
  assert.equal(parsed.state, "valid");
  assert.deepEqual(parsed.value, { path: "src/index.mts", flags: [true, null, 3] });
});

test("strict JSON rejects duplicate keys before conversion", () => {
  assert.deepEqual(strictParseJson('{"path":"a","path":"b"}'), { state: "invalid", code: "json_duplicate_key" });
});

test("strict JSON rejects excessive depth, size, controls, and non-JSON numbers", () => {
  assert.equal(strictParseJson('{"a":{"b":{"c":{"d":1}}}}', { maxDepth: 4 }).code, "json_depth_exceeded");
  assert.equal(strictParseJson(`{"a":"${"x".repeat(100)}"}`, { maxBytes: 32 }).code, "json_too_large");
  assert.equal(strictParseJson('{"a":"\\u0001"}').code, "json_control_character");
  assert.equal(strictParseJson('{"a":NaN}').code, "json_number_invalid");
  assert.equal(strictParseJson('{"a":Infinity}').code, "json_number_invalid");
});

test("strict JSON rejects trailing content and malformed arrays", () => {
  assert.equal(strictParseJson('{"a":1} true').code, "json_trailing_content");
  assert.equal(strictParseJson('[1,,2]').code, "json_number_invalid");
});
