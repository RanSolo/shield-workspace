const POLICY_FIELDS = Object.freeze([
  "deniedSegments",
  "deniedBasenameStems",
  "deniedExtensions",
]);
const SEGMENT_OR_BASENAME_LITERAL = /^(?:\.)?[a-z0-9][a-z0-9_-]{0,63}$/u;
const EXTENSION_LITERAL = /^[a-z0-9]{1,8}$/u;

const POLICY_INPUT = {
  deniedSegments: [".git", ".ssh", ".aws", ".gnupg", "credentials"],
  deniedBasenameStems: [
    ".env",
    "credentials",
    "token",
    "tokens",
    "auth",
    "authentication",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
  ],
  deniedExtensions: ["pem", "key", "p12", "pfx"],
};

function validatedLiterals(value, grammar) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error("sensitive_repository_policy_invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > 64 ||
      Reflect.ownKeys(value).length !== length + 1) {
    throw new Error("sensitive_repository_policy_invalid");
  }
  const literals = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set ||
        typeof descriptor.value !== "string" || !grammar.test(descriptor.value)) {
      throw new Error("sensitive_repository_policy_invalid");
    }
    literals.push(descriptor.value);
  }
  if (new Set(literals).size !== literals.length) {
    throw new Error("sensitive_repository_policy_invalid");
  }
  return Object.freeze(literals);
}

function validatePolicy(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("sensitive_repository_policy_invalid");
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== POLICY_FIELDS.length || keys.some((key) => typeof key !== "string") ||
      POLICY_FIELDS.some((field) => !keys.includes(field)) ||
      keys.some((key) => !POLICY_FIELDS.includes(key))) {
    throw new Error("sensitive_repository_policy_invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values = {};
  for (const field of POLICY_FIELDS) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
      throw new Error("sensitive_repository_policy_invalid");
    }
    values[field] = descriptor.value;
  }
  return Object.freeze({
    deniedSegments: validatedLiterals(values.deniedSegments, SEGMENT_OR_BASENAME_LITERAL),
    deniedBasenameStems: validatedLiterals(
      values.deniedBasenameStems,
      SEGMENT_OR_BASENAME_LITERAL,
    ),
    deniedExtensions: validatedLiterals(values.deniedExtensions, EXTENSION_LITERAL),
  });
}

function asciiFold(value) {
  return value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}

function simpleUnicodeFold(value) {
  return value.replace(/[A-Z\u017f\u212a]/gu, (letter) => {
    if (letter === "ſ") return "s";
    if (letter === "K") return "k";
    return letter.toLowerCase();
  });
}

function globLiterals(value, { simpleUnicodeCaseEquivalence = false } = {}) {
  let literals = [""];
  for (const character of value) {
    let fragments;
    if (character === ".") fragments = ["[.]"];
    else if (character === "k" && simpleUnicodeCaseEquivalence) fragments = ["[kK]", "K"];
    else if (character === "s" && simpleUnicodeCaseEquivalence) fragments = ["[sS]", "ſ"];
    else if (/[a-z]/u.test(character)) fragments = [`[${character}${character.toUpperCase()}]`];
    else fragments = [character];
    literals = literals.flatMap((literal) => fragments.map((fragment) => `${literal}${fragment}`));
  }
  return literals;
}

function compilePolicy(input) {
  const policy = validatePolicy(input);
  const segments = new Set(policy.deniedSegments);
  const basenameStems = new Set(policy.deniedBasenameStems);
  const extensions = new Set(policy.deniedExtensions);

  const isSensitivePath = (value) => {
    if (typeof value !== "string") return true;
    for (const rawSegment of value.split("/")) {
      if (rawSegment.length === 0) continue;
      if (segments.has(asciiFold(rawSegment))) return true;
      const segment = simpleUnicodeFold(rawSegment);
      for (const stem of basenameStems) {
        if (segment === stem || segment.startsWith(`${stem}.`)) return true;
      }
      const finalDot = segment.lastIndexOf(".");
      if (finalDot >= 0 && extensions.has(segment.slice(finalDot + 1))) return true;
    }
    return false;
  };

  const globs = [];
  for (const segment of policy.deniedSegments) {
    const [literal] = globLiterals(segment);
    globs.push(`!**/${literal}`, `!**/${literal}/**`);
  }
  for (const stem of policy.deniedBasenameStems) {
    for (const literal of globLiterals(stem, { simpleUnicodeCaseEquivalence: true })) {
      globs.push(`!**/${literal}`, `!**/${literal}[.]*`);
    }
  }
  for (const extension of policy.deniedExtensions) {
    for (const literal of globLiterals(extension, { simpleUnicodeCaseEquivalence: true })) {
      globs.push(`!**/*.${literal}`);
    }
  }

  return Object.freeze({
    isSensitivePath: Object.freeze(isSensitivePath),
    rgArguments: Object.freeze(globs.flatMap((glob) => ["--glob", glob])),
  });
}

const COMPILED_POLICY = compilePolicy(POLICY_INPUT);

export const isSensitiveRepositoryPath = COMPILED_POLICY.isSensitivePath;
export const SENSITIVE_REPOSITORY_RG_ARGUMENTS = COMPILED_POLICY.rgArguments;
