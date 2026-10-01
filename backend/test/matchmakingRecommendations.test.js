// Guards a 500 that emptied the whole Discover tab. `getCompatibilityInputs`
// is async, so it returns a Promise, and a Promise is not iterable. Spreading
// it into a Promise.all argument list — `...getCompatibilityInputs(userId)` —
// throws "getCompatibilityInputs is not a function or its return value is not
// iterable". Because the spread happens while BUILDING that argument list, the
// throw fired before the controller's own setup check, so EVERY
// recommendations request 500'd: users with a complete profile and complete
// questionnaire saw "no matches" just like everyone else, and the city /
// gender / relationshipGoal filters 500'd even when they matched nothing.
//
// calculateMatch was never affected because it awaits the helper correctly.
//
// These assertions read the source instead of hitting MongoDB so they stay
// dependency-free. Comments are stripped first, otherwise the explanatory
// notes beside the fixed line would match the forbidden pattern themselves.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerPath = path.join(__dirname, "..", "controllers", "matchmakingController.js");
const raw = fs.readFileSync(controllerPath, "utf8");

// Blank out comments while preserving line numbers and offsets, so failures
// point at the real line.
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
  .replace(/\/\/.*$/gm, "");

test("getCompatibilityInputs is async, which is why it must never be spread", () => {
  assert.match(
    code,
    /const getCompatibilityInputs\s*=\s*async\s*\(/,
    "If this helper stops being async, the spread rule below can be revisited.",
  );
});

test("getCompatibilityInputs is never spread into an array", () => {
  assert.doesNotMatch(
    code,
    /\.\.\.\s*getCompatibilityInputs\s*\(/,
    "Spreading the async getCompatibilityInputs() throws 'not iterable' and 500s every recommendations request. Pass it as a nested Promise.all element instead.",
  );
});

test("getRecommendations destructures the nested [profile, questionnaire, horoscope]", () => {
  // The helper resolves to a 3-element array, so the correct shape nests one
  // level: `const [[p, q, h], user] = await Promise.all([...])`.
  assert.match(
    code,
    /const\s*\[\s*\[\s*myProfile\s*,\s*myQuestionnaire\s*,\s*myHoroscope\s*\]\s*,\s*myUser\s*\]\s*=\s*await\s+Promise\.all/,
    "getRecommendations must destructure getCompatibilityInputs() as a nested array element.",
  );
});

test("no call site spreads the helper", () => {
  // Catch the spread regardless of which function performs the call.
  const callLines = code
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /getCompatibilityInputs\s*\(/.test(line))
    .filter(({ line }) => !/const getCompatibilityInputs\s*=\s*async/.test(line));

  assert.ok(callLines.length >= 2, `expected >= 2 call sites, found ${callLines.length}`);

  for (const { line, number } of callLines) {
    assert.doesNotMatch(
      line,
      /\.\.\./,
      `line ${number} spreads the helper: ${line.trim()}`,
    );
  }
});