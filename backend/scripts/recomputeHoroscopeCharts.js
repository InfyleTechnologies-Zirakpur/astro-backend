// Recompute stored natal chart fields after a chart-calculation change.
// This updates derived chart data only; birth details are left unchanged.
//
// Usage: node scripts/recomputeHoroscopeCharts.js --confirm
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Horoscope = require("../models/horoscope");

const run = async () => {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing to update stored charts without the --confirm flag");
  }

  await connectDB();
  let updated = 0;
  let failed = 0;

  try {
    const cursor = Horoscope.find().cursor();
    for await (const horoscope of cursor) {
      try {
        await horoscope.save();
        updated += 1;
        console.log(`Updated chart ${horoscope._id}`);
      } catch (error) {
        failed += 1;
        console.error(`Failed chart ${horoscope._id}: ${error.message}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log(`Done. updated=${updated} failed=${failed}`);
  if (failed) process.exitCode = 1;
};

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});