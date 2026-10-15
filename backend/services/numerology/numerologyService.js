// Deterministic Chaldean numerology calculations — no LLM, no I/O.
// Single source of truth for Mulank (psychic), Bhagyank (destiny) and
// Chaldean name number. Master numbers 11 and 22 are PRESERVED (not
// reduced) at every reduction step, with the reduced single digit kept
// alongside for grounding the AI answer.
//
// Conventions:
//  - Mulank  = reduced day of month (DD). e.g. 23 -> 2+3 = 5; 29 -> 11 (master, reduced 2).
//  - Bhagyank = reduced full date DD+MM+YYYY digit sum. e.g. 23/08/1995.
//  - Name number = Chaldean letter values summed, then reduced master-aware.

const CHALDEAN_MAP = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
};

const MASTER_NUMBERS = new Set([11, 22]);

const sumDigits = (n) => {
  let s = 0;
  for (const ch of String(Math.abs(n))) {
    if (ch >= "0" && ch <= "9") s += Number(ch);
  }
  return s;
};

// Reduce with master preservation: 11/22 stop the reduction.
// Returns { value, reduced, isMaster, steps: [..] }.
const reduceMasterAware = (n) => {
  const steps = [n];
  let current = n;
  while (current > 9 && !MASTER_NUMBERS.has(current)) {
    current = sumDigits(current);
    steps.push(current);
  }
  return {
    value: current,
    reduced: MASTER_NUMBERS.has(current) ? sumDigits(current) : current,
    isMaster: MASTER_NUMBERS.has(current),
    steps,
  };
};

const parseDateInput = (input) => {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    // Accept YYYY-MM-DD (also from <input type="date">) or DD/MM/YYYY / DD-MM-YYYY.
    let y;
    let m;
    let d;
    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (iso) {
      y = Number(iso[1]);
      m = Number(iso[2]);
      d = Number(iso[3]);
    } else if (dmy) {
      d = Number(dmy[1]);
      m = Number(dmy[2]);
      y = Number(dmy[3]);
    } else {
      return null;
    }
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Guard against overflow (e.g. 31 Feb -> 3 Mar).
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    if (dt.getTime() > Date.now()) return null; // DOB must not be in the future
    return dt;
  }
  return null;
};

// Mulank (Psychic number): from the birth DAY only.
const calculateMulank = (dateInput) => {
  const dt = parseDateInput(dateInput);
  if (!dt) return null;
  const day = dt.getUTCDate();
  const r = reduceMasterAware(day);
  return { day, ...r };
};

// Bhagyank (Destiny number): from the full date DD+MM+YYYY.
const calculateBhagyank = (dateInput) => {
  const dt = parseDateInput(dateInput);
  if (!dt) return null;
  const d = dt.getUTCDate();
  const m = dt.getUTCMonth() + 1;
  const y = dt.getUTCFullYear();
  const digitSum =
    sumDigits(d) + sumDigits(m) + sumDigits(y);
  // Standard approach: sum all digits of DDMMYYYY then reduce master-aware.
  const total = String(d).padStart(2, "0") + String(m).padStart(2, "0") + String(y);
  const flatSum = [...total].reduce((a, ch) => a + Number(ch), 0);
  const r = reduceMasterAware(flatSum);
  return { total: flatSum, digitSum, ...r };
};

// Chaldean name number: sum letter values, ignore spaces/non-letters.
const calculateNameNumber = (fullName) => {
  if (typeof fullName !== "string" || !fullName.trim()) return null;
  const breakdown = [];
  let total = 0;
  for (const raw of fullName.toUpperCase()) {
    if (raw === " " || raw === "-" || raw === "'") continue;
    if (raw < "A" || raw > "Z") continue;
    const value = CHALDEAN_MAP[raw];
    if (value == null) continue;
    total += value;
    breakdown.push({ letter: raw, value });
  }
  if (!breakdown.length) return null;
  const r = reduceMasterAware(total);
  return { total, breakdown, ...r };
};

const normalizeFullName = (name) =>
  typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";

// Context object passed to the LLM — the numerology equivalent of
// buildChartContextForQA. Fully deterministic so answers are grounded.
const buildNumeroContext = ({ fullName, dateOfBirth }) => {
  const cleanName = normalizeFullName(fullName);
  const dt = parseDateInput(dateOfBirth);
  if (!cleanName || !dt) return null;
  const mulank = calculateMulank(dt);
  const bhagyank = calculateBhagyank(dt);
  const nameNumber = calculateNameNumber(cleanName);
  if (!mulank || !bhagyank || !nameNumber) return null;
  return {
    system: "chaldean",
    fullName: cleanName,
    dateOfBirth: dt.toISOString().slice(0, 10),
    mulank: { value: mulank.value, reduced: mulank.reduced, isMaster: mulank.isMaster, day: mulank.day, steps: mulank.steps },
    bhagyank: { value: bhagyank.value, reduced: bhagyank.reduced, isMaster: bhagyank.isMaster, total: bhagyank.total, steps: bhagyank.steps },
    nameNumber: { value: nameNumber.value, reduced: nameNumber.reduced, isMaster: nameNumber.isMaster, total: nameNumber.total, breakdown: nameNumber.breakdown },
    masterNumbersPreserved: [11, 22],
  };
};

module.exports = {
  CHALDEAN_MAP,
  MASTER_NUMBERS,
  reduceMasterAware,
  parseDateInput,
  calculateMulank,
  calculateBhagyank,
  calculateNameNumber,
  normalizeFullName,
  buildNumeroContext,
};
