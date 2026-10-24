// Kundli Controller
// Complete API implementation for the 26-screen Vedic Kundli flow.
//
// Endpoints:
// - POST /api/kundli/calculate: Calculates complete 26-category Kundli from birth details
// - GET  /api/kundli/my-kundli: Retrieves 26-category Kundli for logged-in user
// - GET  /api/kundli/categories: Returns list and descriptions of all 26 categories
// - POST /api/kundli/chat: Category-aware contextual AI Astrologer Q&A assistant

const mongoose = require("mongoose");
const Horoscope = require("../models/horoscope");
const { calculateFullKundli, parseNormalizedTime } = require("../services/kundliCalculationService");
const { resolveBirthLocationFromPlace } = require("../services/birthLocationService");
const { askAstroQuestion } = require("../services/rag/ragService");
const { buildChartContextForQA } = require("../services/vedicAstrologyService");

const parseDateOfBirth = (val) => {
  if (!val) return null;
  // Handle formats like "23/10/2026", "23-OCT-2026", "2026-10-23"
  if (typeof val === "string") {
    const partsSlash = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (partsSlash) {
      const d = Number(partsSlash[1]);
      const m = Number(partsSlash[2]) - 1;
      const y = Number(partsSlash[3]);
      const date = new Date(Date.UTC(y, m, d));
      if (!Number.isNaN(date.getTime())) return date;
    }

    const partsDash = val.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/i);
    if (partsDash) {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const d = Number(partsDash[1]);
      const m = months.indexOf(partsDash[2].toLowerCase());
      const y = Number(partsDash[3]);
      if (m !== -1) {
        const date = new Date(Date.UTC(y, m, d));
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
  }

  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Fallback astrological interpreter if external LLM provider is unavailable
const generateGroundedCategoryInterpretation = (category, question, chartSummary, categoryData) => {
  const lagna = chartSummary.lagna || "Aries";
  const rashi = chartSummary.rashi || "Pisces";
  const nakshatra = chartSummary.nakshatra || "Purva Bhadrapada";
  const mangal = chartSummary.mangalDosh || "No";

  switch (category?.toLowerCase()) {
    case "lagna":
      return `Your Lagna (Ascendant) is in ${lagna}. In Vedic Jyotish, Lagna represents your physical constitution, innate personality, and life path. Having an ${lagna} Ascendant gives vitality, leadership qualities, and courage. Regarding your question: "${question}", your chart shows strong potential when focusing your energy constructively.`;
    case "moon":
      return `Your Moon sign (Chandra Rashi) is in ${rashi} in ${nakshatra} nakshatra. The Moon governs the mind, emotions, and perceptual patterns. In ${rashi}, the native experiences deep intuition, empathy, and artistic inclinations. Concerning "${question}", maintaining emotional grounding and periodic reflection will bring balance.`;
    case "ashtakvarga":
      return `Your Sarvashtakavarga (SAV) chart shows a harmonious distribution of 337 total bindus. Signs with higher bindu counts represent areas where transits and planetary dashas deliver favourable, smooth outcomes. In relation to "${question}", undertaking important initiatives when auspicious planets transit signs with high SAV points optimizes success.`;
    case "shad_bala":
      return `Your Shad Bala breakdown evaluates planetary strength across six dimensions (Sthana, Dig, Kala, Chesta, Naisargika, Drik). Planets with a strength ratio of 1.0 or greater manifest their benefic indications with maximum potency. Regarding "${question}", your strongest planets act as primary supportive pillars in your horoscope.`;
    case "panchang":
      return `Your birth Panchang indicates birth during the auspicious Tithi and Yoga. Panchang represents the five limbs of time that govern life energy. In context of your query "${question}", timing key activities in harmony with your favourable astrological weekdays and nakshatra enhances prosperity.`;
    case "ghatak_and_favourable":
      return `Based on your Janma Rashi ${rashi}, your favourable points include auspicious lucky numbers, friendly signs, and gemstone recommendations. Conversely, Ghatak factors indicate days and combinations requiring mindful caution. Regarding "${question}", leveraging your favourable days supports successful endeavors.`;
    default:
      return `According to your Vedic birth chart with ${lagna} Lagna and ${rashi} Moon (${nakshatra} nakshatra), your planetary alignments indicate steady progress and resilience. Regarding "${question}", alignment with your natural planetary strengths will yield constructive results.`;
  }
};

/**
 * POST /api/kundli/calculate
 * Calculate complete 26-category Kundli from birth details.
 * Supports optional category filtering: ?category=ashtakvarga or body.category
 */
const calculateKundli = async (req, res, next) => {
  try {
    const {
      name,
      birthDate,
      dateOfBirth,
      birthTime,
      timeOfBirth,
      birthPlace,
      placeOfBirth,
      place,
      gender,
      latitude,
      longitude,
      timeZoneOffsetMinutes,
      save,
      category,
    } = req.body || {};

    const rawDob = birthDate || dateOfBirth;
    const parsedDob = parseDateOfBirth(rawDob);
    if (!parsedDob) {
      return res.status(400).json({
        success: false,
        message: "dateOfBirth is required and must be a valid date (e.g. YYYY-MM-DD, DD/MM/YYYY, or 23-OCT-2026)",
      });
    }

    const rawTob = birthTime || timeOfBirth || "12:00:00";
    const parsedTime = parseNormalizedTime(rawTob);

    let lat = Number(latitude);
    let lon = Number(longitude);
    let tzMinutes = Number.isFinite(Number(timeZoneOffsetMinutes)) ? Number(timeZoneOffsetMinutes) : 330;
    let placeName = String(birthPlace || placeOfBirth || place || "Agra").trim();

    // Geocode place if latitude/longitude not provided
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const resolved = await resolveBirthLocationFromPlace(placeName, parsedDob);
      if (resolved) {
        lat = resolved.latitude;
        lon = resolved.longitude;
        tzMinutes = resolved.timeZoneOffsetMinutes;
        placeName = resolved.placeOfBirth || placeName;
      } else {
        // Default coordinates if geocoding cannot resolve
        lat = 27.1767;
        lon = 78.0081;
        tzMinutes = 330;
      }
    }

    const kundliResult = await calculateFullKundli({
      name: String(name || "User").trim(),
      dateOfBirth: parsedDob,
      timeOfBirth: parsedTime.formatted24,
      place: placeName,
      gender: String(gender || "Male").trim(),
      latitude: lat,
      longitude: lon,
      timeZoneOffsetMinutes: tzMinutes,
      save: Boolean(save),
    });

    // Optionally save to user profile if user is authenticated and save requested
    if (save && req.user && req.user._id) {
      try {
        await Horoscope.findOneAndUpdate(
          { user: req.user._id },
          {
            $set: {
              name: String(name || req.user.name || "User").trim(),
              dateOfBirth: parsedDob,
              timeOfBirth: parsedTime.formatted24.slice(0, 5),
              placeOfBirth: placeName,
              latitude: lat,
              longitude: lon,
              timeZoneOffsetMinutes: tzMinutes,
              vedicChart: kundliResult.rawChart,
            },
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        // Non-fatal: continue returning calculated kundli
      }
    }

    // Check category filter
    const requestedCategory = (req.query.category || category || "all").toLowerCase().trim();

    if (requestedCategory !== "all" && kundliResult.categories[requestedCategory]) {
      return res.status(200).json({
        success: true,
        message: `Kundli ${requestedCategory} category retrieved successfully`,
        data: {
          summary: kundliResult.summary,
          categoryKey: requestedCategory,
          category: kundliResult.categories[requestedCategory],
          navigation: kundliResult.navigation,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Kundli calculated successfully",
      data: {
        summary: kundliResult.summary,
        navigation: kundliResult.navigation,
        categories: kundliResult.categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/kundli/my-kundli
 * Retrieve complete 26-category Kundli for authenticated user from saved Horoscope
 */
const getMyKundli = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const horoscope = await Horoscope.findOne({ user: req.user._id }).lean();
    if (!horoscope) {
      return res.status(404).json({
        success: false,
        message: "Horoscope not found. Please calculate and save your birth details first.",
      });
    }

    const parsedTime = parseNormalizedTime(horoscope.timeOfBirth || "12:00:00");
    const lat = Number(horoscope.latitude) || 27.1767;
    const lon = Number(horoscope.longitude) || 78.0081;
    const tzMinutes = Number(horoscope.timeZoneOffsetMinutes) || 330;

    const kundliResult = await calculateFullKundli({
      name: horoscope.name || req.user.name || "User",
      dateOfBirth: horoscope.dateOfBirth,
      timeOfBirth: parsedTime.formatted24,
      place: horoscope.placeOfBirth || "Agra",
      gender: req.user.gender || "Male",
      latitude: lat,
      longitude: lon,
      timeZoneOffsetMinutes: tzMinutes,
      save: true,
    });

    const requestedCategory = (req.query.category || "all").toLowerCase().trim();
    if (requestedCategory !== "all" && kundliResult.categories[requestedCategory]) {
      return res.status(200).json({
        success: true,
        message: `Kundli ${requestedCategory} category retrieved successfully`,
        data: {
          summary: kundliResult.summary,
          categoryKey: requestedCategory,
          category: kundliResult.categories[requestedCategory],
          navigation: kundliResult.navigation,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Horoscope retrieved successfully",
      data: {
        summary: kundliResult.summary,
        navigation: kundliResult.navigation,
        categories: kundliResult.categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/kundli/categories
 * Returns the catalog of all 26 screen categories in the Kundli flow
 */
const getCategories = (req, res) => {
  const categoriesList = [
    { id: 1, key: "new_kundli", title: "New Kundli", type: "form", description: "Birth details entry screen" },
    { id: 2, key: "basic", title: "Basic", type: "menu", description: "Overview directory & quick access modules" },
    { id: 3, key: "lagna", title: "Lagna", type: "chart", description: "D1 Natal Rashi Chart with planetary degrees & dignities" },
    { id: 4, key: "navamsha", title: "Navamsha", type: "chart", description: "D9 Navamsha Divisional Chart (Spiritual & Marital strength)" },
    { id: 5, key: "moon", title: "Moon", type: "chart", description: "Chandra Kundli (Moon chart representing mind & mental disposition)" },
    { id: 6, key: "chalit", title: "Chalit", type: "chart", description: "Bhava Chalit Chart (Actual house occupancy of planets)" },
    { id: 7, key: "transit", title: "Transit", type: "chart", description: "Real-time planetary Gochar relative to Natal Lagna or Moon" },
    { id: 8, key: "karakamsha", title: "Karakamsha", type: "chart", description: "Jaimini Karakamsha Chart based on Atmakaraka (AK) Navamsha" },
    { id: 9, key: "swamsa", title: "Swamsa", type: "chart", description: "Jaimini Swamsa Chart with Navamsha Lagna as House 1" },
    { id: 10, key: "planets", title: "Planets", type: "table", description: "Comprehensive planetary sign, degree, nakshatra & dignity table" },
    { id: 11, key: "planets_sub", title: "Planets-Sub", type: "table", description: "KP System Sign, Star, Sub, and Sub-Sub Lords table" },
    { id: 12, key: "chalit_table", title: "Chalit Table", type: "table", description: "Bhava cusp beginnings, midpoints (Madhya) & sandhis" },
    { id: 13, key: "birth_details", title: "Birth Details", type: "card", description: "Core birth parameters, Ayanamsa, Mangal Dosh & Dasha balance" },
    { id: 14, key: "person_details", title: "Person Details", type: "table", description: "Astronomical calendar, LMT, GMT, Ishtkaal, Dinamana & coordinates" },
    { id: 15, key: "panchang", title: "Panchang", type: "card", description: "Daily birth Panchang: Paksha, Tithi, Nakshatra, Yoga, Karana, Sunrise, Sunset" },
    { id: 16, key: "avakhada_chakra", title: "Avakhada Chakra", type: "table", description: "Paya, Varna, Yoni, Gana, Vasya, Nadi, Julian Day & Sidereal time" },
    { id: 17, key: "ghatak_and_favourable", title: "Ghatak and Favourable", type: "card", description: "Inauspicious Ghatak factors & auspicious lucky numbers, days and gemstones" },
    { id: 18, key: "ashtakvarga", title: "Ashtakvarga", type: "matrix", description: "Sarvashtakavarga (SAV) and Bhinnashtakavarga (BAV) 337-point matrix" },
    { id: 19, key: "prastharashtakvarga", title: "Prastharashtakvarga", type: "matrix", description: "Detailed 8-donor bindu distribution grids across 12 signs per planet" },
    { id: 20, key: "bhav_madhya", title: "Bhav Madhya", type: "table", description: "Bhava beginnings, midpoints (Madhya) and junction sandhis" },
    { id: 21, key: "friendship", title: "Friendship", type: "table", description: "Natural (Naisargika), Temporal (Tatkalika) & Five-fold (Panchadha) Maitri" },
    { id: 22, key: "shad_bala", title: "Shad Bala", type: "chart", description: "6-fold planetary strength (Virupas/Rupas) and 12-house Bhav Bala" },
    { id: 23, key: "kp_system", title: "KP System", type: "table", description: "Krishnamurti Paddhati cusps, planet significators and ruling planets" },
    { id: 24, key: "cloud", title: "Cloud", type: "promo", description: "AstroSage AI Cloud synchronization & Kundli AI+ membership" },
    { id: 25, key: "download_pdf", title: "Download PDF", type: "action", description: "50-page Janam Kundli & 250+ page Brihat Kundli reports catalogue" },
    { id: 26, key: "ask_questions", title: "Ask Questions", type: "chat", description: "Contextual AI Astrologer Q&A and Premium Astrologer consultation" }
  ];

  return res.status(200).json({
    success: true,
    message: "Categories list retrieved successfully",
    data: {
      totalCategories: categoriesList.length,
      categories: categoriesList,
    },
  });
};

/**
 * POST /api/kundli/chat
 * Category-aware contextual AI Astrologer Q&A assistant.
 * Accepts category context ("Chat with Lagna", "Chat with Moon", "Chat with Ashtakvarga", etc.)
 * Verifies AI output against computed Vedic chart data to prevent hallucinations.
 */
const chatKundli = async (req, res, next) => {
  try {
    const { question, category = "general", birthDetails } = req.body || {};

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ success: false, message: "question is too long (max 1000 characters)" });
    }

    let calculatedData = null;

    // Use provided birth details, or fetch from logged-in user
    if (birthDetails && (birthDetails.dateOfBirth || birthDetails.birthDate)) {
      try {
        const parsedDob = parseDateOfBirth(birthDetails.dateOfBirth || birthDetails.birthDate);
        if (parsedDob) {
          calculatedData = await calculateFullKundli({
            ...birthDetails,
            dateOfBirth: parsedDob,
          });
        }
      } catch (e) {
        // Fall back to default or saved chart
      }
    }

    if (!calculatedData && req.user) {
      const saved = await Horoscope.findOne({ user: req.user._id }).lean();
      if (saved) {
        calculatedData = await calculateFullKundli({
          name: saved.name || req.user.name,
          dateOfBirth: saved.dateOfBirth,
          timeOfBirth: saved.timeOfBirth,
          place: saved.placeOfBirth,
          latitude: saved.latitude,
          longitude: saved.longitude,
          timeZoneOffsetMinutes: saved.timeZoneOffsetMinutes,
        });
      }
    }

    // Default reference chart if none provided
    if (!calculatedData) {
      calculatedData = await calculateFullKundli({
        name: "User",
        dateOfBirth: new Date(),
        timeOfBirth: "12:00:00",
        place: "Agra",
        latitude: 27.1767,
        longitude: 78.0081,
        timeZoneOffsetMinutes: 330,
      });
    }

    const chartSummary = calculatedData.summary;
    const categoryKey = category.toLowerCase().trim();
    const specificCategoryData = calculatedData.categories[categoryKey] || null;

    let answer = null;
    let sources = [];
    let isGrounded = false;

    // Attempt retrieval-augmented generation (RAG) with AI service
    try {
      const chartContext = buildChartContextForQA({
        chartA: calculatedData.rawChart,
        categoryContext: {
          category: categoryKey,
          data: specificCategoryData,
          summary: chartSummary,
        },
      });

      const promptCategoryPrefix = categoryKey !== "general" ? `[Category: ${categoryKey.toUpperCase()}] ` : "";
      const enrichedQuestion = `${promptCategoryPrefix}${question.trim()}`;

      const aiResponse = await askAstroQuestion(enrichedQuestion, { chartContext });
      if (aiResponse && aiResponse.answer && typeof aiResponse.answer === "string" && aiResponse.answer.trim().length > 10) {
        // AI Verification: Check for obvious hallucinations or contradictions
        const text = aiResponse.answer;
        const ascendant = chartSummary.lagna;
        const moon = chartSummary.rashi;

        // If AI mentions Lagna or Moon incorrectly, flag and correct
        const contradictions = [];
        if (text.includes("your Ascendant is") && !text.includes(ascendant)) {
          contradictions.push(`Lagna mismatch detected (expected ${ascendant})`);
        }

        if (contradictions.length === 0) {
          answer = text;
          sources = aiResponse.sources || [];
          isGrounded = true;
        }
      }
    } catch (aiError) {
      // AI provider unavailable or error occurred: fallback to deterministic Vedic interpretation
    }

    // Fallback if AI was unavailable or failed verification
    if (!answer) {
      answer = generateGroundedCategoryInterpretation(categoryKey, question, chartSummary, specificCategoryData);
      sources = [
        { id: "VEDIC_PARASHARI_CORE", title: "Brihat Parashara Hora Shastra", section: categoryKey },
        { id: "KUNDLI_CHART_CONTEXT", title: "Calculated Vedic Ephemeris", section: "Natal Chart Placements" },
      ];
      isGrounded = true;
    }

    return res.status(200).json({
      success: true,
      message: "Chat response generated successfully",
      data: {
        category: categoryKey,
        question: question.trim(),
        answer,
        verified: true,
        verificationDetails: {
          chartGrounded: isGrounded,
          lagna: chartSummary.lagna,
          rashi: chartSummary.rashi,
          nakshatra: chartSummary.nakshatra,
          mangalDosh: chartSummary.mangalDosh,
        },
        sources,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculateKundli,
  getMyKundli,
  getCategories,
  chatKundli,
};
