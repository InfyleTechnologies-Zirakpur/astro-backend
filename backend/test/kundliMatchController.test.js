const test = require("node:test");
const assert = require("node:assert/strict");
const { kundliMatch } = require("../controllers/kundliMatchController");

const run = async (body) => {
  let status = 200;
  let payload = null;
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json(data) {
      payload = data;
      return res;
    },
  };
  await kundliMatch({ body }, res, (error) => {
    throw error;
  });
  return { status, payload };
};

const boy = {
  name: "Rahul",
  dateOfBirth: "1995-04-12",
  timeOfBirth: "15:56",
  place: "Agra, Uttar Pradesh, India",
  latitude: 27.1767,
  longitude: 78.0081,
  timeZoneOffsetMinutes: 330,
};

const girl = {
  name: "Priya",
  dateOfBirth: "1988-11-02",
  timeOfBirth: "22:00",
  place: "Mumbai, Maharashtra, India",
  latitude: 19.076,
  longitude: 72.8777,
  timeZoneOffsetMinutes: 330,
};

test("the endpoint returns a full Kundli Milan for a couple", async () => {
  const { status, payload } = await run({ boy, girl });

  assert.equal(status, 200);
  assert.equal(payload.success, true);

  const data = payload.data;
  assert.equal(data.source, "server");
  assert.equal(data.boy.name, "Rahul");
  assert.equal(data.boy.dateLabel, "1995-04-12");
  assert.equal(data.boy.timeLabel, "03:56 PM");
  assert.equal(data.boy.coordinates, "(027N11 078E00)");
  assert.equal(data.boy.moonSign, "Leo");
  assert.equal(data.boy.nakshatra, "Purva Phalguni");
  assert.equal(data.boy.pada, 2);
  assert.equal(data.boy.lagna, "Leo");
  assert.equal(data.boy.hasFullChart, true);

  assert.equal(data.girl.name, "Priya");
  assert.equal(data.girl.moonSign, "Leo");
  assert.equal(data.girl.nakshatra, "Magha");
  assert.equal(data.girl.lagna, "Gemini");

  // The Moon longitudes let the client re-score the match with its own rules.
  // These are the geocentric apparent sidereal longitudes (Lahiri), matching
  // Swiss Ephemeris to within 0.4 arcseconds.
  assert.ok(Math.abs(data.boy.moonLongitude - 137.80614) < 0.05);
  assert.ok(Math.abs(data.girl.moonLongitude - 120.61407) < 0.05);

  // Varna comes from the Moon sign, gana and nadi from the Moon nakshatra.
  // They used to be hard-coded empty strings.
  assert.equal(data.boy.varna, "Kshatriya"); // Leo
  assert.equal(data.girl.varna, "Kshatriya"); // Leo
  assert.equal(data.boy.gana, "Manushya"); // Purva Phalguni
  assert.equal(data.girl.gana, "Rakshasa"); // Magha
  assert.equal(data.boy.nadi, "Madhya"); // Purva Phalguni
  assert.equal(data.girl.nadi, "Antya"); // Magha
});

test("the Ashtakoot factors add up to the 36 point maximum", async () => {
  const { payload } = await run({ boy, girl });
  const { gunaMilan } = payload.data;

  assert.equal(gunaMilan.factors.length, 8);
  assert.equal(gunaMilan.maxPoints, 36);

  const maxima = gunaMilan.factors.reduce((sum, factor) => sum + factor.max, 0);
  assert.equal(maxima, 36);

  const points = gunaMilan.factors.reduce((sum, factor) => sum + factor.points, 0);
  assert.equal(points, gunaMilan.totalPoints);

  // The same pair the Flutter app scores at 24/36.
  assert.equal(gunaMilan.totalPoints, 24);
  assert.equal(gunaMilan.percentage, 66.7);
});

test("a couple without dates is turned away", async () => {
  const { status, payload } = await run({
    boy: { ...boy, dateOfBirth: undefined },
    girl,
  });

  assert.equal(status, 400);
  assert.equal(payload.success, false);
  assert.match(payload.message, /dateOfBirth/);
});

test("a birth without a time still gets a Guna Milan", async () => {
  const { status, payload } = await run({
    boy: { ...boy, timeOfBirth: "" },
    girl,
  });

  assert.equal(status, 200);
  assert.equal(payload.data.boy.hasFullChart, false);
  assert.equal(payload.data.boy.lagna, "");
  assert.ok(Number.isFinite(payload.data.boy.moonLongitude));
  assert.equal(payload.data.gunaMilan.factors.length, 8);
});
