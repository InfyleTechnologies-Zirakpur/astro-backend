const test = require("node:test");
const assert = require("node:assert/strict");
const kundliRoutes = require("../routes/kundliRoutes");
const { calculateKundli } = require("../controllers/kundliController");

const requestBody = {
  name: "Aisha",
  dateOfBirth: "1995-04-12",
  timeOfBirth: "15:56:00",
  place: "Agra, Uttar Pradesh, India",
  gender: "Female",
  latitude: 27.1767,
  longitude: 78.0081,
  timeZoneOffsetMinutes: 330,
  save: false,
  category: "all",
};

test("Kundli router exposes the app's calculate, saved-chart, and chat paths", () => {
  const routes = kundliRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.ok(
    routes.some(
      (route) => route.path === "/calculate" && route.methods.includes("post"),
    ),
  );
  assert.ok(
    routes.some(
      (route) => route.path === "/my-kundli" && route.methods.includes("get"),
    ),
  );
  assert.ok(
    routes.some(
      (route) => route.path === "/chat" && route.methods.includes("post"),
    ),
  );
});

test("calculate accepts the Flutter birth-details payload and returns chart data", async () => {
  let status = 200;
  let payload;
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

  await calculateKundli({ body: requestBody, query: {} }, res, (error) => {
    throw error;
  });

  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.data.summary.name, "Aisha");
  assert.equal(payload.data.summary.totalCategories, 26);
  assert.equal(payload.data.navigation.length, 26);
  assert.equal(
    payload.data.navigation.some((item) => item.key === "lagna"),
    true,
  );
  assert.equal(payload.data.categories.lagna.houses.length, 12);
  assert.ok(payload.data.categories.ashtakvarga);
  assert.ok(payload.data.categories.shad_bala);
  assert.ok(payload.data.categories.ask_questions);
});
