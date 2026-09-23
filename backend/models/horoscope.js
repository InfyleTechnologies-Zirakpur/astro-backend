const mongoose = require("mongoose");
const {
  ZODIAC_SIGN_NAMES,
  getZodiacSign,
  calculateNatalChart,
  normalizeTimeOfBirth,
} = require("../services/astrologyService");
const { calculateVedicChart } = require("../services/vedicAstrologyService");

const horoscopeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    name: {
      type: String,
      trim: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    // Required for real Vedic (Ascendant/house-based) analysis — without
    // this, only planetary sign placements are available, no houses.
    timeOfBirth: {
      type: String,
      required: true,
      trim: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "timeOfBirth must be a valid time"],
    },

    timeZoneOffsetMinutes: {
      type: Number,
      min: -840,
      max: 840,
      default: 0,
    },

    placeOfBirth: {
      type: String,
      trim: true,
    },

    // Required (alongside timeOfBirth) for Ascendant calculation. Populate
    // these from a place-autocomplete field on the frontend (e.g. Google
    // Places) rather than asking users to enter coordinates directly.
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },

    // --- Western (tropical) fields — unchanged, kept for the existing sun-sign system ---
    sunSign: {
      type: String,
      enum: ZODIAC_SIGN_NAMES,
    },

    calculatedMoonSign: {
      type: String,
      enum: ZODIAC_SIGN_NAMES,
    },

    moonSignPrecision: {
      type: String,
      enum: ["birth-time", "date-only-estimate", "unavailable"],
    },

    moonSign: {
      type: String,
      enum: ZODIAC_SIGN_NAMES,
    },

    // User-supplied override — most users won't have this and it's
    // computed automatically below (vedicChart.moonNakshatra) once
    // birth time/location are available.
    nakshatra: {
      type: String,
      trim: true,
    },

    // --- Vedic (sidereal) chart — computed automatically, not user-editable ---
    // Full structured output of calculateVedicChart: Ascendant, planets
    // with house/sign/Navamsha/strength flags, house lords, Moon
    // Nakshatra, ayanamsha used, etc. Stored as Mixed since its shape is
    // intentionally rich (see vedicAstrologyService.js for the schema).
    vedicChart: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

horoscopeSchema.pre("validate", function computeCharts() {
  if (this.timeOfBirth) {
    const normalizedTime = normalizeTimeOfBirth(this.timeOfBirth);
    if (!normalizedTime) {
      this.invalidate("timeOfBirth", "timeOfBirth must be in h:mm AM/PM or HH:mm format");
    } else {
      this.timeOfBirth = normalizedTime;
    }
  }

  if (this.dateOfBirth) {
    this.sunSign = getZodiacSign(this.dateOfBirth);
    const chart = calculateNatalChart({
      dateOfBirth: this.dateOfBirth,
      timeOfBirth: this.timeOfBirth,
      timeZoneOffsetMinutes: this.timeZoneOffsetMinutes,
    });
    this.calculatedMoonSign = chart.moonSign;
    // Moon sign is calculated automatically from the exact birth time.
    this.moonSign = chart.moonSign;
    this.moonSignPrecision = chart.precision;

    this.vedicChart = calculateVedicChart({
      dateOfBirth: this.dateOfBirth,
      timeOfBirth: this.timeOfBirth,
      timeZoneOffsetMinutes: this.timeZoneOffsetMinutes,
      latitude: this.latitude,
      longitude: this.longitude,
    });
  }
});

module.exports = mongoose.model("Horoscope", horoscopeSchema);
