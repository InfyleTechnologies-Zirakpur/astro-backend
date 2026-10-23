// One-time migration for the wallet / free-trial fixes.
//
// 1. wallettransactions: the `providerPaymentId` unique sparse index treated
//    an explicit `null` as a value, so only ONE non-recharge transaction could
//    ever exist (every consultation charge, numerology charge and refund
//    collided on `providerPaymentId: null` -> E11000). The field is now left
//    undefined for those rows, so the stale `null`s have to be cleared.
//
// 2. freeusages: the free trial became per-client instead of per-pair. The old
//    `{client, astrologer}` unique index is dropped and the rows are collapsed
//    to one document per client (keeping the largest `freeSecondsUsed`, so a
//    user cannot get a fresh trial by leaving stale rows behind).
//
// Run: node scripts/fixWalletIndexes.js
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const loadEnv = () => {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trim().startsWith("#")) continue;
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
};

(async () => {
  loadEnv();
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // --- 1. clear the stale providerPaymentId: null rows -------------------
    const wt = mongoose.connection.collection("wallettransactions");
    const cleared = await wt.updateMany(
      { providerPaymentId: null },
      { $unset: { providerPaymentId: "" } },
    );
    console.log("wallettransactions: cleared providerPaymentId on", cleared.modifiedCount, "rows");

    // --- 2. collapse freeusages to one row per client ----------------------
    const fu = mongoose.connection.collection("freeusages");
    const rows = await fu.find({}).toArray();
    const byClient = new Map();
    for (const row of rows) {
      const key = String(row.client);
      const current = byClient.get(key);
      if (!current) {
        byClient.set(key, row);
        continue;
      }
      // Keep the row that has burned the most free seconds.
      if ((row.freeSecondsUsed || 0) > (current.freeSecondsUsed || 0)) {
        byClient.set(key, row);
        await fu.deleteOne({ _id: current._id });
      } else {
        await fu.deleteOne({ _id: row._id });
      }
    }
    console.log("freeusages: collapsed", rows.length, "rows into", byClient.size, "per-client rows");

    // Drop the stale per-pair index, then make sure the per-client one exists.
    try {
      await fu.dropIndex("client_1_astrologer_1");
      console.log("freeusages: dropped stale index client_1_astrologer_1");
    } catch (err) {
      if (err.codeName !== "IndexNotFound" && err.code !== 27) {
        console.warn("freeusages: could not drop client_1_astrologer_1 —", err.message);
      }
    }
    const indexes = await fu.indexes();
    if (!indexes.some((i) => i.name === "client_1" && i.unique)) {
      await fu.createIndex({ client: 1 }, { unique: true, name: "client_1" });
      console.log("freeusages: created unique index client_1");
    } else {
      console.log("freeusages: unique index client_1 already present");
    }

    // --- 3. make sure the wallet transaction index is non-sparse-safe ------
    const wtIndexes = await wt.indexes();
    const ppi = wtIndexes.find((i) => i.name === "providerPaymentId_1");
    console.log("wallettransactions: providerPaymentId_1 ->", JSON.stringify(ppi));
    console.log("wallettransactions: remaining null providerPaymentId rows ->", await wt.countDocuments({ providerPaymentId: null }));
  } catch (error) {
    console.error("MIGRATION FAILED:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
