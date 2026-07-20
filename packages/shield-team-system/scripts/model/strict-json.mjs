const DEFAULT_MAX_BYTES = 4_096;
const DEFAULT_MAX_DEPTH = 4;

function invalid(code) {
  return { state: "invalid", code };
}

export function strictParseJson(input, options = {}) {
  if (typeof input !== "string") return invalid("json_input_invalid");
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const rejectControlCharacters = options.rejectControlCharacters ?? true;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    return invalid("json_limits_invalid");
  }
  if (Buffer.byteLength(input, "utf8") > maxBytes) return invalid("json_too_large");

  let offset = 0;
  const whitespace = () => {
    while (offset < input.length && /[\u0020\u000a\u000d\u0009]/u.test(input[offset])) offset += 1;
  };

  const parseString = () => {
    if (input[offset] !== '"') throw new Error("json_string_expected");
    const start = offset;
    offset += 1;
    while (offset < input.length) {
      const code = input.charCodeAt(offset);
      if (code === 0x22) {
        offset += 1;
        const value = JSON.parse(input.slice(start, offset));
        if (rejectControlCharacters && /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("json_control_character");
        return value;
      }
      if (code < 0x20) throw new Error("json_control_character");
      if (code === 0x5c) {
        offset += 1;
        if (offset >= input.length) throw new Error("json_escape_invalid");
        if (input[offset] === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(input.slice(offset + 1, offset + 5))) throw new Error("json_escape_invalid");
          offset += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(input[offset])) throw new Error("json_escape_invalid");
      }
      offset += 1;
    }
    throw new Error("json_string_unterminated");
  };

  const parseNumber = () => {
    const rest = input.slice(offset);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(rest);
    if (!match) throw new Error("json_number_invalid");
    offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new Error("json_number_invalid");
    return value;
  };

  const parseValue = (depth) => {
    if (depth > maxDepth) throw new Error("json_depth_exceeded");
    whitespace();
    const token = input[offset];
    if (token === '"') return parseString();
    if (token === "{") {
      offset += 1;
      const value = {};
      const keys = new Set();
      whitespace();
      if (input[offset] === "}") { offset += 1; return value; }
      while (offset < input.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error("json_duplicate_key");
        keys.add(key);
        whitespace();
        if (input[offset] !== ":") throw new Error("json_colon_expected");
        offset += 1;
        value[key] = parseValue(depth + 1);
        whitespace();
        if (input[offset] === "}") { offset += 1; return value; }
        if (input[offset] !== ",") throw new Error("json_comma_expected");
        offset += 1;
      }
      throw new Error("json_object_unterminated");
    }
    if (token === "[") {
      offset += 1;
      const value = [];
      whitespace();
      if (input[offset] === "]") { offset += 1; return value; }
      while (offset < input.length) {
        value.push(parseValue(depth + 1));
        whitespace();
        if (input[offset] === "]") { offset += 1; return value; }
        if (input[offset] !== ",") throw new Error("json_comma_expected");
        offset += 1;
      }
      throw new Error("json_array_unterminated");
    }
    if (input.startsWith("true", offset)) { offset += 4; return true; }
    if (input.startsWith("false", offset)) { offset += 5; return false; }
    if (input.startsWith("null", offset)) { offset += 4; return null; }
    return parseNumber();
  };

  try {
    whitespace();
    const value = parseValue(1);
    whitespace();
    if (offset !== input.length) return invalid("json_trailing_content");
    return { state: "valid", value };
  } catch (error) {
    const code = error instanceof Error && /^json_[a-z_]+$/u.test(error.message)
      ? error.message
      : "json_malformed";
    return invalid(code);
  }
}
