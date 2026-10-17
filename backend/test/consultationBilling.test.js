// Prepaid consultation billing ("jitna payment, utna minute").
//
// The old settlement charged everything at the end (one lump debit), so a
// client with an empty wallet could chat/call for hours and the session simply
// ended `paymentStatus: "failed"` — the astrologer was never paid. The billing
// service now meters minutes: free minutes first, then one wallet debit per
// started minute, and the moment the wallet cannot cover the next minute the
// session is closed (`reason = "insufficient_balance"`).
//
// Dependency-free like the rest of this suite: `mongoose` and every model the
// service touches is replaced in require.cache, no MongoDB and no network.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");

const objectId = () => crypto.randomBytes(12).toString("hex");

const CLIENT_ID = objectId();
const ASTROLOGER_ID = objectId();

const state = {
  profile: null,
  profiles: {},
  usage: null,
  wallet: null,
  astroWallet: null,
  transactions: [],
  emitted: [],
  profileIncs: [],
  queue: null,
  sweepDocs: [],
};

const stub = (relPath, exports) => {
  const filename = require.resolve(path.join(__dirname, "..", relPath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};

// `mongoose` is not installed locally.
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

// Mongoose queries are both awaitable and chainable (`.lean()`, `.sort()`).
// The service relies on both shapes, so the stubs have to expose both.
const queryOf = (value) => {
  const promise = () => Promise.resolve(value);
  const query = {
    lean: () => promise(),
    then: (onFulfilled, onRejected) => promise().then(onFulfilled, onRejected),
    catch: (onRejected) => promise().catch(onRejected),
    finally: (onFinally) => promise().finally(onFinally),
  };
  query.sort = () => query;
  query.limit = () => query;
  return query;
};

const walletDoc = (balance) => ({
  balance,
  save: async () => {},
});

const makeMatch = ({
  startedAt,
  rate = 20,
  status = "accepted",
  billedMin = 0,
  freeSecGranted = 0,
  astrologerId = ASTROLOGER_ID,
} = {}) => {
  const doc = {
    _id: objectId(),
    userA: CLIENT_ID,
    userB: astrologerId,
    matchType: "consultation",
    status,
    requestedBy: CLIENT_ID,
    requestedTo: astrologerId,
    createdAt: startedAt,
    consultation: {
      astrologer: astrologerId,
      client: CLIENT_ID,
      channel: "chat",
      ratePerMin: rate,
      startedAt,
      endedAt: null,
      durationSec: 0,
      freeSecGranted,
      billableSec: 0,
      billedMin,
      amount: 0,
      paymentStatus: "pending",
      billedAt: null,
      endedReason: null,
    },
    saves: 0,
    save: async function () {
      doc.saves += 1;
      return doc;
    },
  };
  return doc;
};

stub("models/astrologerProfile.js", {
  findOne: (filter) =>
    queryOf((filter?.user && state.profiles[String(filter.user)]) || state.profile),
  updateOne: async (filter, update) => {
    state.profileIncs.push(update?.$inc || {});
  },
});
stub("models/freeUsage.js", {
  findOne: () => queryOf(state.usage),
  findOneAndUpdate: async () => state.usage,
});
stub("models/wallet.js", {
  findOne: (query) =>
    queryOf(
      String(query.user) === String(ASTROLOGER_ID) ? state.astroWallet : state.wallet,
    ),
  create: async (doc) => {
    const created = walletDoc(doc.balance || 0);
    if (String(doc.user) === String(ASTROLOGER_ID)) state.astroWallet = created;
    else state.wallet = created;
    return created;
  },
});
stub("models/walletTransaction.js", {
  create: async (doc) => {
    state.transactions.push(doc);
    return doc;
  },
});
stub("models/consultationQueue.js", {
  findOne: () => queryOf(state.queue),
  countDocuments: async () => 0,
  create: async (doc) => doc,
});
stub("models/match.js", {
  findById: async (id) => state.sweepDocs.find((m) => String(m._id) === String(id)) || null,
  find: () => queryOf(state.sweepDocs),
});
stub("services/socketHub.js", {
  getIo: () => ({
    to: (room) => ({
      emit: (event, payload) => state.emitted.push({ room, event, payload }),
    }),
  }),
  isUserInCall: () => false,
  clearUserInCall: () => {},
  setUserInCall: () => {},
  getPendingCallsFor: () => new Map(),
  addPendingCall: () => {},
  removePendingCall: () => {},
  clearPendingCalls: () => {},
  setActiveChat: () => {},
  clearActiveChat: () => {},
});

const {
  settleConsultation,
  ensureBillable,
  billingPreview,
  finalizeConsultation,
  sweepActiveConsultations,
} = require("../services/consultationBilling");

const profileWith = (freeMinutesLimitMin, enabled = true) => ({
  user: ASTROLOGER_ID,
  isVerified: true,
  freeMinutesEnabled: enabled,
  freeMinutesLimitMin,
  rateChatPerMin: 20,
  rateCallPerMin: 20,
});

const reset = ({ freeUsed = 0, balance = 0, limitMin = 0, astroBalance = 0 } = {}) => {
  state.profile = profileWith(limitMin);
  state.profiles = {};
  state.usage = { freeSecondsUsed: freeUsed, freeExhausted: false, save: async () => {} };
  state.wallet = walletDoc(balance);
  state.astroWallet = walletDoc(astroBalance);
  state.transactions.length = 0;
  state.emitted.length = 0;
  state.profileIncs.length = 0;
  state.queue = null;
  state.sweepDocs.length = 0;
};

const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);

test("free minutes are consumed first and cost nothing", async () => {
  reset({ limitMin: 10, freeUsed: 0, balance: 0 });
  const match = makeMatch({ startedAt: minutesAgo(3) });

  const summary = await settleConsultation(match);

  assert.equal(summary.billableMin, 0, "the session is still inside the free window");
  assert.equal(summary.amount, 0);
  assert.equal(summary.paidMinutesLeft, 0, "an empty wallet can pay for nothing");
  assert.equal(state.wallet.balance, 0, "no wallet debit while free minutes last");
  assert.equal(state.transactions.length, 0);
  assert.equal(summary.freeRemainingSec, 7 * 60);
  assert.equal(match.consultation.freeSecGranted, 180);
  assert.equal(await (async () => (await ensureBillable(match)).ok)(), true);
});

test("once the free window is over each started minute is debited", async () => {
  reset({ limitMin: 2, freeUsed: 0, balance: 100 });
  // 5 minutes in: 2 free minutes + 3 paid minutes at ₹20.
  const match = makeMatch({ startedAt: minutesAgo(5), rate: 20 });

  const summary = await settleConsultation(match);

  assert.equal(summary.billableMin, 3);
  assert.equal(summary.amount, 60);
  assert.equal(state.wallet.balance, 40);
  assert.equal(state.astroWallet.balance, 60, "astrologer is credited per paid minute");
  assert.equal(summary.paymentStatus, "deducted");
  assert.equal(match.consultation.billedMin, 3);
  assert.equal(state.profileIncs[0].totalEarnings, 60);
});

test("billing is incremental and idempotent — a minute is charged once", async () => {
  reset({ limitMin: 0, balance: 100 });
  const match = makeMatch({ startedAt: minutesAgo(2), rate: 20 });

  await settleConsultation(match);
  assert.equal(match.consultation.billedMin, 2);
  assert.equal(state.wallet.balance, 60);

  // The sweep and a status poll land together with the same clock: nothing
  // may be charged twice.
  await settleConsultation(match);
  await settleConsultation(match);
  assert.equal(match.consultation.billedMin, 2);
  assert.equal(state.wallet.balance, 60);
  assert.equal(state.transactions.length, 2, "one debit + one credit");
});

test("a wallet that cannot cover the next minute is reported, not silently overspent", async () => {
  // ₹20 in the wallet at ₹20/min → exactly one paid minute.
  reset({ limitMin: 0, balance: 20 });
  const match = makeMatch({ startedAt: minutesAgo(3), rate: 20 });

  const summary = await settleConsultation(match);

  assert.equal(summary.insufficient, true, "three minutes due, only one affordable");
  assert.equal(summary.amount, 20, "only the paid minute is charged");
  assert.equal(match.consultation.billedMin, 1);
  assert.equal(state.wallet.balance, 0);
  assert.equal(summary.paymentStatus, "failed", "the unpaid part is visible");
  assert.equal(summary.paidMinutesLeft, 0);

  const gate = await ensureBillable(match);
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "insufficient_balance");
});

test("a zero-rate astrologer never blocks or charges the client", async () => {
  reset({ limitMin: 0, balance: 0 });
  const match = makeMatch({ startedAt: minutesAgo(10), rate: 0 });

  const summary = await settleConsultation(match);

  assert.equal(summary.amount, 0);
  assert.equal(summary.paymentStatus, "free");
  const gate = await ensureBillable(match);
  assert.equal(gate.ok, true);
});

test("the gate refuses only after free minutes are used up", async () => {
  reset({ limitMin: 10, freeUsed: 0, balance: 0 });
  const freeMatch = makeMatch({ startedAt: minutesAgo(1) });
  assert.equal((await ensureBillable(freeMatch)).ok, true);

  reset({ limitMin: 1, freeUsed: 60, balance: 0 });
  const paidMatch = makeMatch({ startedAt: minutesAgo(1) });
  const gate = await ensureBillable(paidMatch);
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "insufficient_balance");
});

test("finalize closes the session, settles the minute and notifies both sides", async () => {
  reset({ limitMin: 0, balance: 100 });
  const match = makeMatch({ startedAt: minutesAgo(2), rate: 20 });

  const summary = await finalizeConsultation(match, { reason: "insufficient_balance" });

  assert.equal(match.status, "ended");
  assert.equal(match.consultation.endedReason, "insufficient_balance");
  assert.equal(summary.endedReason, "insufficient_balance");
  assert.equal(match.consultation.amount, 40);

  const ended = state.emitted.find((e) => e.event === "consultation:ended");
  assert.ok(ended, "the client and astrologer are told the session ended");
  assert.equal(ended.payload.reason, "insufficient_balance");
  assert.equal(ended.payload.amount, 40);
  assert.ok(
    state.emitted.some((e) => e.event === "call:ended"),
    "a running call is dropped too",
  );
  assert.deepEqual(state.profileIncs.at(-1), {
    totalConsultations: 1,
    totalFreeMinutesGiven: 0,
  });
});

test("an ended session stops billing — polling it cannot charge again", async () => {
  reset({ limitMin: 0, balance: 100 });
  const match = makeMatch({ startedAt: minutesAgo(2), rate: 20 });

  await finalizeConsultation(match, { reason: "user" });
  const amount = match.consultation.amount;
  const balance = state.wallet.balance;
  assert.equal(amount, 40);

  // Status polls keep arriving long after the session closed.
  for (let i = 1; i <= 3; i++) {
    await settleConsultation(match, { now: new Date(Date.now() + i * 60000) });
  }

  assert.equal(match.consultation.amount, amount, "no extra minutes billed");
  assert.equal(state.wallet.balance, balance, "no extra wallet debit");
  assert.equal(match.consultation.durationSec, 120, "the clock stopped at the end");
});

test("the status preview asks the payer to recharge — even after the stop", async () => {
  reset({ limitMin: 0, balance: 0 });
  const running = makeMatch({ startedAt: minutesAgo(1), rate: 20 });
  assert.equal(
    billingPreview(await settleConsultation(running)).requiresRecharge,
    true,
    "a running session the wallet cannot cover asks for a recharge",
  );

  reset({ limitMin: 0, balance: 20 });
  const endsUnpaid = makeMatch({ startedAt: minutesAgo(5), rate: 20 });
  await finalizeConsultation(endsUnpaid, { reason: "insufficient_balance" });
  assert.equal(
    billingPreview(await settleConsultation(endsUnpaid)).requiresRecharge,
    true,
    "the client is still asked to recharge after the auto-stop",
  );

  reset({ limitMin: 10, balance: 0 });
  const freeSession = makeMatch({ startedAt: minutesAgo(1) });
  assert.equal(
    billingPreview(await settleConsultation(freeSession)).requiresRecharge,
    false,
    "free minutes mean nothing to pay yet",
  );
});

test("the sweep stops a running session once the paid minutes are gone", async () => {
  reset({ limitMin: 0, balance: 0 });
  // Astrologer A gives no free minutes (client cannot pay → must be stopped)…
  const running = makeMatch({ startedAt: minutesAgo(1), rate: 20 });
  // …astrologer B still has free minutes, so that session must survive.
  const freeAstrologer = objectId();
  state.profiles[String(freeAstrologer)] = profileWith(10);
  const stillFree = makeMatch({
    startedAt: minutesAgo(1),
    rate: 20,
    status: "active",
    astrologerId: freeAstrologer,
  });
  state.sweepDocs.push(running, stillFree);

  const result = await sweepActiveConsultations();

  assert.equal(result.checked, 2);
  assert.equal(result.stopped, 1, "only the unpaid session is stopped");
  assert.equal(running.status, "ended");
  assert.equal(running.consultation.endedReason, "insufficient_balance");
  assert.equal(stillFree.status, "active", "free minutes keep the session alive");
});
