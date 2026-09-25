// One-time maintenance script: re-resolve the timezone for every stored
// horoscope using the HISTORICAL UTC offset in effect at its birth moment,
// correct the stored timeZoneOffsetMinutes/timeZoneId/timeZonePrecision, and
// re-save each document so the pre-validate hook recomputes the chart.
//
// Safe to run more than once (re-resolution is idempotent), but it does make
// a live network call (Nominatim + Open-Meteo) per horoscope, so it is slow
// for large collections.
//
// Usage: node scripts/recomputeHoroscopeTimeZones.js
require("dotenv").config();
const connectDB = require("../config/db");
const Horoscope = require("../models/horoscope");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  await connectDB();

  const horoscopes = await Horoscope.find();
  console.log(`Found ${horoscopes.length} horoscope(s).`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const horoscope of horoscopes) {
    const place = horoscope.placeOfBirth;
    if (!place) {
      console.log(`- [${horoscope._id}] skipped: no placeOfBirth`);
      skipped += 1;
      continue;
    }

    try {
      const resolved = await resolveBirthLocationFromPlace(place, horoscope.dateOfBirth);
      await sleep(200); // be polite to the free geocoding/weather APIs
      if (!resolved) {
        console.log(`- [${horoscope._id}] failed: place not resolvable -> "${place}"`);
        failed += 1;
        continue;
      }

      horoscope.placeOfBirth = resolved.placeOfBirth;
      horoscope.latitude = resolved.latitude;
      horoscope.longitude = resolved.longitude;
      horoscope.timeZoneOffsetMinutes = resolved.timeZoneOffsetMinutes;
      horoscope.timeZoneId = resolved.timeZoneId;
      horoscope.timeZonePrecision = resolved.timeZonePrecision;
      await horoscope.save(); // pre-validate recomputes sunSign/moonSign/vedicChart
      console.log(
        `- [${horoscope._id}] updated: offset=${resolved.timeZoneOffsetMinutes} (${resolved.timeZonePrecision}) tz=${resolved.timeZoneId}`
      );
      updated += 1;
    } catch (error) {
      failed += 1;
      console.log(`- [${horoscope._id}] ERROR: ${error.message}`);
    }
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});