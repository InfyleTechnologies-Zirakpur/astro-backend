// One Match document per pair (unique index on userA+userB in models/match.js).
//
// `requestConsultation` used to look ONLY for an active same-channel session and
// otherwise call Match.create. Every other state of the pair's document —
// session already ended, a session started on another channel, or a plain
// matchmaking match created earlier by calculateMatch — therefore hit Mongo's
// E11000 duplicate key, which server.js maps to
// 409 "A record with that value already exists". On the phone that is the
// "Could not start / a record with that value already exists" error that kept
// the astrologer profile's Chat button from ever opening a chat.
//
// Like the rest of this suite this test is dependency-free: backend/node_modules
// is not installed locally, so `mongoose` is answered by a stub (isValidObjectId
// only) and every model the controller touches is replaced in require.cache
// before the controller is loaded. No MongoDB, no network.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");

const objectId = () => crypto.randomBytes(12).toString("hex");

const CLIENT_ID = objectId();
const ASTROLOGER_ID = objectId();

const state = {
  existing: null, // returned by Match.findOne for the pair
  created: [], // docs handed to Match.create
  saves: 0,
};

const stub = (relPath, exports) => {
  const filename = require.resolve(path.join(__dirname, "..", relPath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};

// `mongoose` is not installed locally; the controller only calls
// mongoose.isValidObjectId, so answer that one require with a stub.
const VIRTUAL_MONGOOSE = "\u0000virtual:mongoose";
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "mongoose") return VIRTUAL_MONGOOSE;
  return originalResolve.call(this, request, parent, isMain, options);
};
require.cache[VIRTUAL_MONGOOSE] = {
  id: VIRTUAL_MONGOOSE,
  filename: VIRTUAL_MONGOOSE,
  loaded: true,
  exports: {
    isValidObjectId: (value) => typeof value === "string" && /^[0-9a-f]{24}$/i.test(value),
  },
};

const makeMatchDoc = (overrides = {}) => {
  const doc = {
    _id: objectId(),
    userA: CLIENT_ID,
    userB: ASTROLOGER_ID,
    matchType: "consultation",
    status: "accepted",
    requestedBy: CLIENT_ID,
    requestedTo: ASTROLOGER_ID,
    hiddenFor: [CLIENT_ID],
    respondedAt: new Date("2026-01-01T10:00:00Z"),
    consultation: {
      astrologer: ASTROLOGER_ID,
      client: CLIENT_ID,
      channel: "chat",
      ratePerMin: 10,
      startedAt: new Date("2026-01-01T10:00:00Z"),
      endedAt: new Date("2026-01-01T10:10:00Z"),
      durationSec: 600,
      billableSec: 600,
      amount: 100,
      paymentStatus: "deducted",
      reviewGiven: false,
    },
    ...overrides,
  };
  doc.save = async () => {
    state.saves += 1;
    return doc;
  };
  return doc;
};

// Loaded before the controller, so its own require() picks these up.
stub("models/user.js", {
  findOne: async (query) =>
    query && String(query._id) === ASTROLOGER_ID
      ? { _id: ASTROLOGER_ID, role: "astrologer", isActive: true, name: "Guide" }
      : null,
});
stub("models/match.js", {
  findOne: async () => state.existing,
  create: async (doc) => {
    const created = { ...doc, _id: objectId() };
    created.save = async () => created;
    state.created.push(created);
    return created;
  },
});
stub("models/astrologerProfile.js", {
  findOne: async () => ({
    user: ASTROLOGER_ID,
    isVerified: true,
    isOnline: true,
    rateChatPerMin: 10,
    rateCallPerMin: 20,
  }),
});
stub("models/freeUsage.js", { findOne: async () => null, findOneAndUpdate: async () => null });
stub("models/consultationQueue.js", { countDocuments: async () => 0, create: async (doc) => doc });
stub("models/wallet.js", { findOne: async () => ({ balance: 1000, save: async () => {} }) });
stub("models/walletTransaction.js", { create: async (doc) => doc });
stub("models/review.js", { findOne: async () => null, create: async (doc) => doc });
stub("services/socketHub.js", { getIo: () => null, isUserInCall: () => false, clearUserInCall: () => {} });
// Plenty of free minutes keeps the wallet gate out of these tests. The billing
// service is stubbed the same way `astrologerController` used to be — this file
// only exercises the request/reuse logic, while the billing math has its own
// suite (consultationBilling.test.js).
stub("services/consultationBilling.js", {
  FREE_MINUTES_DEFAULT: 10,
  MIN_PAID_BLOCK_MIN: 1,
  getOrCreateWallet: async () => ({ balance: 1000, save: async () => {} }),
  freeLimitSecFor: () => 600,
  freeRemainingSecFor: async () => 600,
  paidMinutesLeft: () => 50,
  settleConsultation: async () => ({ skipped: true }),
  ensureBillable: async () => ({ ok: true, reason: "", summary: null }),
  billingPreview: () => null,
  finalizeConsultation: async () => null,
});

const { requestConsultation } = require("../controllers/consultationController");

const runRequest = async (channel = "chat") => {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
  await requestConsultation(
    {
      user: { _id: CLIENT_ID, name: "Client" },
      body: { astrologerId: ASTROLOGER_ID, channel },
    },
    res,
    (error) => {
      throw error;
    },
  );
  return res;
};

const reset = () => {
  state.existing = null;
  state.created.length = 0;
  state.saves = 0;
};

test("a pair with no match yet still gets a fresh consultation", async () => {
  reset();

  const res = await runRequest("chat");

  assert.equal(res.statusCode, 201);
  assert.equal(state.created.length, 1);
  assert.equal(state.saves, 0);
  assert.equal(state.created[0].status, "accepted");
  assert.equal(state.created[0].matchType, "consultation");
  assert.equal(String(res.payload.data.matchId), state.created[0]._id);
});

test("an ended consultation is revived on the same document, never re-inserted", async () => {
  reset();
  const existing = makeMatchDoc({ status: "ended" });
  state.existing = existing;

  const res = await runRequest("chat");

  assert.equal(
    state.created.length,
    0,
    "Match.create must not run — the pair already owns the only slot",
  );
  assert.equal(state.saves, 1, "the existing document is saved instead");
  assert.equal(res.statusCode, 201);
  assert.equal(String(res.payload.data.matchId), existing._id);

  assert.equal(existing.status, "accepted");
  assert.equal(existing.matchType, "consultation");
  assert.equal(existing.consultation.client, CLIENT_ID);
  assert.equal(existing.consultation.channel, "chat");
  assert.equal(existing.consultation.paymentStatus, "pending");
  assert.equal(existing.consultation.durationSec ?? 0, 0, "old session clock is reset");
  assert.equal(existing.consultation.endedAt ?? null, null, "old end time is cleared");
  assert.equal(existing.consultation.amount ?? 0, 0, "old bill is cleared");
  assert.ok(
    new Date(existing.consultation.startedAt).getTime() >
      new Date("2026-01-01T10:00:00Z").getTime(),
    "billing starts from now",
  );
  assert.deepEqual(existing.hiddenFor, [], "a deleted thread returns with the new session");
});

test("a session running on another channel is joined as-is", async () => {
  reset();
  const startedAt = new Date("2026-01-01T10:00:00Z");
  const existing = makeMatchDoc({
    status: "active",
    consultation: {
      astrologer: ASTROLOGER_ID,
      client: CLIENT_ID,
      channel: "voice",
      ratePerMin: 20,
      startedAt,
      endedAt: null,
      durationSec: 0,
      amount: 0,
      paymentStatus: "pending",
    },
  });
  state.existing = existing;

  // Ask for chat while a voice session is live: join that session instead of
  // starting (and billing) a second one — or crashing into the duplicate key.
  const res = await runRequest("chat");

  assert.equal(state.created.length, 0, "no duplicate document for the pair");
  assert.equal(state.saves, 0, "the live session is untouched");
  assert.equal(res.statusCode, 201);
  assert.equal(String(res.payload.data.matchId), existing._id);
  assert.equal(existing.consultation.channel, "voice");
  assert.equal(existing.consultation.startedAt, startedAt, "the running clock is not reset");
});

test("a pre-existing matchmaking match is converted instead of duplicated", async () => {
  reset();
  const existing = makeMatchDoc({
    matchType: "matchmaking",
    status: "accepted",
    score: 82,
    consultation: undefined,
  });
  state.existing = existing;

  const res = await runRequest("chat");

  assert.equal(state.created.length, 0, "calculateMatch already owns the pair's document");
  assert.equal(state.saves, 1);
  assert.equal(res.statusCode, 201);
  assert.equal(String(res.payload.data.matchId), existing._id);
  assert.equal(existing.matchType, "consultation");
  assert.equal(existing.status, "accepted");
  assert.equal(existing.consultation.client, CLIENT_ID);
  assert.equal(existing.consultation.ratePerMin, 10);
  assert.equal(existing.score, 82, "the compatibility report is left alone");
});
