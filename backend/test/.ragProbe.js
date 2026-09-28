require("dotenv").config();
const { calculateVedicChart, buildChartContextForQA } = require("../services/vedicAstrologyService");
const { buildVedicAnalysis, summarizeVedicAnalysis } = require("../services/vedicAnalysisService");
const { getDashaTimeline, getDashaHouseActivations } = require("../services/dashaService");
const { askAstroQuestion } = require("../services/rag/ragService");

const chart = calculateVedicChart({
  dateOfBirth: "1990-01-15",
  timeOfBirth: "06:30",
  timeZoneOffsetMinutes: 330,
  latitude: 28.6139,
  longitude: 77.209,
});

const analysis = buildVedicAnalysis({ chart, utcDate: new Date(chart.birthInstant) });
const summary = summarizeVedicAnalysis(analysis);
const timeline = getDashaTimeline({
  moonSiderealLongitude: chart.planets.Moon.longitude,
  birthDate: new Date(chart.birthInstant),
  atDate: new Date(),
});
const dasha = {
  mahadasha: timeline.current.mahadasha.planet,
  antardasha: timeline.current.antardasha.planet,
  pratyantardasha: timeline.current.pratyantardasha.planet,
  houseActivations: getDashaHouseActivations({ planets: chart.planets, timeline }),
};

const context = buildChartContextForQA({ chartA: chart, dashaA: dasha, analysisA: summary });

console.log("=== chart facts (what the model can see) ===");
console.log("Moon rashi        :", chart.planets.Moon.rashi, chart.planets.Moon.degreeInSign.toFixed(2) + "deg");
console.log("Moon shadvarga    :", summary.moonShadvarga.strongCount + "/" + summary.moonShadvarga.divisionCount, "-", summary.moonShadvarga.verdict);
console.log("strongest         :", summary.strongest.map((p) => `${p.planet}(${p.multiplier})`).join(", "));
console.log("weakest           :", summary.weakest.map((p) => `${p.planet}(${p.multiplier})`).join(", "));
console.log("notable           :", summary.notable.map((p) => `${p.planet}[${[p.retrograde && "R", p.combust && "C", p.vargottama && "V"].filter(Boolean).join("") || "-"}]`).join(" "));
console.log("context bytes     :", JSON.stringify(context).length);
console.log();

(async () => {
  const result = await askAstroQuestion(
    "How strong is my Moon according to rule 13.10, and what does it mean for my emotional life?",
    { chartContext: context, topK: 6 },
  );
  console.log("=== retrieved rules ===");
  console.log((result.chunks || []).map((c) => c.id).join(", "));
  console.log();
  console.log("=== answer ===");
  console.log(result.answer);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
