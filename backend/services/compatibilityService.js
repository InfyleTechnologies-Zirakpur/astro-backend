const {
  calculateNatalChart,
  calculateAstrologyCompatibility,
} = require("./astrologyService");

/*
 * Normalize questionnaire answers.
 */
const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/*
 * Words that indicate opposite preferences.
 */
const oppositePairs = [
  ["introvert", "extrovert"],
  ["private", "social"],
  ["traditional", "modern"],
  ["planner", "spontaneous"],
  ["spontaneous", "planned"],
  ["discuss now", "need time"],
  ["independent", "collaborative"],
  ["individual", "team"],
  ["saver", "spender"],
  ["ambitious", "relaxed"],
  ["career focused", "family focused"],
];

/*
 * Preferences that can complement one another.
 */
const complementaryPairs = [
  ["introvert", "extrovert"],
  ["planner", "spontaneous"],
  ["private", "social"],
  ["independent", "collaborative"],
  ["leader", "supportive"],
  ["ambitious", "balanced"],
  ["saver", "balanced"],
  ["traditional", "modern"],
];

/*
 * Words representing strong / positive alignment.
 */
const positiveWords = [
  "important",
  "high",
  "strong",
  "open",
  "honest",
  "flexible",
  "supportive",
  "balanced",
  "equal",
  "shared",
  "together",
  "committed",
  "serious",
];

/*
 * Words representing lower priority / negative alignment.
 */
const negativeWords = [
  "low",
  "rarely",
  "never",
  "unimportant",
  "avoid",
  "private",
  "casual",
];

/*
 * Token similarity.
 *
 * This does NOT decide that two unrelated words are compatible.
 * It only detects meaningful textual overlap.
 */
const tokenSimilarity = (first, second) => {
  const left = new Set(normalize(first).split(" ").filter(Boolean));
  const right = new Set(normalize(second).split(" ").filter(Boolean));

  if (!left.size || !right.size) return 0;

  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;

  return union ? intersection / union : 0;
};

const isPair = (first, second, pairs) =>
  pairs.some(
    ([a, b]) =>
      (first === a && second === b) ||
      (first === b && second === a)
  );

/*
 * Score two individual answers.
 */
const compare = (first, second, description) => {
  const left = normalize(first);
  const right = normalize(second);

  /*
   * Missing values.
   */
  if (!left || !right) {
    return {
      level: "Needs More Information",
      score: 0.5,
      description: `${description} More information is needed to compare these preferences.`,
    };
  }

  /*
   * Exact match.
   */
  if (left === right) {
    return {
      level: "Very Compatible",
      score: 1,
      description: `${description} Their preferences are closely aligned.`,
    };
  }

  /*
   * Explicitly complementary preferences.
   */
  if (isPair(left, right, complementaryPairs)) {
    return {
      level: "Good Alignment",
      score: 0.8,
      description: `${description} Their preferences are different but may complement each other well.`,
    };
  }

  /*
   * Explicitly opposite preferences.
   */
  if (isPair(left, right, oppositePairs)) {
    return {
      level: "Some Differences",
      score: 0.3,
      description: `${description} Their preferences differ significantly and may require understanding and compromise.`,
    };
  }

  /*
   * Strong textual overlap.
   */
  const similarity = tokenSimilarity(left, right);

  if (similarity >= 0.5) {
    return {
      level: "Good Alignment",
      score: 0.75,
      description: `${description} Their preferences share important similarities.`,
    };
  }

  /*
   * Detect shared positive/negative direction.
   */
  const leftWords = left.split(" ");
  const rightWords = right.split(" ");

  const leftPositive = leftWords.some((word) =>
    positiveWords.includes(word)
  );

  const rightPositive = rightWords.some((word) =>
    positiveWords.includes(word)
  );

  const leftNegative = leftWords.some((word) =>
    negativeWords.includes(word)
  );

  const rightNegative = rightWords.some((word) =>
    negativeWords.includes(word)
  );

  if (
    (leftPositive && rightPositive) ||
    (leftNegative && rightNegative)
  ) {
    return {
      level: "Good Alignment",
      score: 0.7,
      description: `${description} Their preferences have a broadly similar direction.`,
    };
  }

  /*
   * Unknown but different answers.
   *
   * Instead of automatically forcing everything to 0.35,
   * use a neutral middle value.
   */
  return {
    level: "Some Differences",
    score: 0.5,
    description: `${description} Their preferences differ, but the difference does not by itself indicate incompatibility.`,
  };
};

/*
 * Calculate one compatibility category.
 */
const category = (first, second, fields, description) => {
  const comparisons = fields.map((field) =>
    compare(first?.[field], second?.[field], description)
  );

  const score =
    comparisons.reduce((total, item) => total + item.score, 0) /
    comparisons.length;

  let level;

  if (score >= 0.85) {
    level = "Very Compatible";
  } else if (score >= 0.65) {
    level = "Good Alignment";
  } else {
    level = "Some Differences";
  }

  let categoryDescription;

  if (level === "Very Compatible") {
    categoryDescription =
      `${description} Their preferences are strongly aligned across this area.`;
  } else if (level === "Good Alignment") {
    categoryDescription =
      `${description} They have several areas of alignment and their differences may be manageable.`;
  } else {
    categoryDescription =
      `${description} They have some differences in this area that may benefit from open discussion.`;
  }

  return {
    level,
    score: Number(score.toFixed(2)),
    description: categoryDescription,
  };
};

/*
 * Astrology chart calculation.
 */
const getAstrologyChart = (horoscope) => {
  const calculated = calculateNatalChart(horoscope);

  return {
    ...calculated,
    sunSign: calculated.sunSign || horoscope?.sunSign || null,
    moonSign: calculated.moonSign || horoscope?.moonSign || null,
  };
};

/*
 * Main compatibility calculation.
 */
const calculateCompatibility = ({
  profileA,
  questionnaireA,
  profileB,
  questionnaireB,
  horoscopeA,
  horoscopeB,
}) => {
  const report = {
    personality: category(
      questionnaireA,
      questionnaireB,
      [
        "decisionMaking",
        "socialNature",
        "changeVsStability",
      ],
      "Their personality preferences can work well together."
    ),

    emotional: category(
      questionnaireA,
      questionnaireB,
      [
        "emotionalHandling",
        "emotionalSupport",
        "stressResponse",
      ],
      "Their emotional needs and coping styles deserve attention."
    ),

    communication: category(
      questionnaireA,
      questionnaireB,
      [
        "disagreementStyle",
        "communicationImportance",
        "problemSolving",
      ],
      "Their communication styles shape how they handle everyday issues."
    ),

    trustAndCommitment: category(
      questionnaireA,
      questionnaireB,
      [
        "trustBuilding",
        "honesty",
        "commitment",
      ],
      "Trust and commitment are important foundations for this connection."
    ),

    maturity: category(
      questionnaireA,
      questionnaireB,
      [
        "responsibility",
        "decisionHandling",
        "conflictResolution",
      ],
      "Their approaches to responsibility and conflict can support growth."
    ),

    understanding: category(
      questionnaireA,
      questionnaireB,
      [
        "emotionalSupport",
        "communicationImportance",
        "personalSpace",
      ],
      "Understanding each other's needs will help the relationship feel secure."
    ),

    lifestyle: category(
      questionnaireA,
      questionnaireB,
      [
        "socialLifestyle",
        "travelPreferences",
        "dailyRoutine",
      ],
      "Their routines and lifestyle preferences will influence daily compatibility."
    ),

    familyValues: category(
      questionnaireA,
      questionnaireB,
      [
        "familyImportance",
        "familyInvolvement",
      ],
      "Family expectations should be discussed early and clearly."
    ),

    careerAndFinance: category(
      questionnaireA,
      questionnaireB,
      [
        "careerPriority",
        "financialApproach",
        "careerAfterMarriage",
      ],
      "Their career and financial expectations should be aligned with care."
    ),

    relationshipExpectations: category(
      questionnaireA,
      questionnaireB,
      [
        "idealRelationship",
        "personalSpace",
        "longTermGoals",
      ],
      "Their relationship expectations provide a useful basis for honest conversations."
    ),

    longTermPotential: compare(
      profileA?.relationshipGoal,
      profileB?.relationshipGoal,
      "Their relationship goals indicate how they may approach the future."
    ),
  };

  /*
   * Astrology compatibility.
   */
  if (horoscopeA && horoscopeB) {
    const chartA = getAstrologyChart(horoscopeA);
    const chartB = getAstrologyChart(horoscopeB);

    if (chartA.sunSign && chartB.sunSign) {
      report.astrology = calculateAstrologyCompatibility(
        chartA,
        chartB
      );
    }
  }

  /*
   * Calculate overall score.
   */
  const categories = Object.values(report);

  const totalScore =
    categories.reduce((total, item) => total + item.score, 0) /
    categories.length;

  const score = Math.round(totalScore * 100);

  /*
   * Count meaningful alignment.
   */
  const aligned = categories.filter(
    (item) =>
      item.level === "Very Compatible" ||
      item.level === "Good Alignment"
  ).length;

  const alignedRatio = aligned / categories.length;

  let overallLabel;

  if (alignedRatio >= 0.73) {
    overallLabel = "Strong Foundation";
  } else if (alignedRatio >= 0.45) {
    overallLabel = "Generally Compatible";
  } else {
    overallLabel = "Needs Understanding";
  }

  let overallConclusion;

  if (overallLabel === "Strong Foundation") {
    overallConclusion =
      "They share many compatible values and have a strong foundation for meaningful connection.";
  } else if (overallLabel === "Generally Compatible") {
    overallConclusion =
      "They have promising areas of alignment alongside differences that can be handled through communication.";
  } else {
    overallConclusion =
      "They have meaningful differences and should build understanding through honest, patient conversations.";
  }

  /*
   * Strengths and challenges.
   */
  const strengths = Object.entries(report)
    .filter(
      ([, value]) => value.level === "Very Compatible"
    )
    .map(
      ([key]) => `${key} shows strong alignment.`
    );

  const potentialChallenges = Object.entries(report)
    .filter(
      ([, value]) => value.level === "Some Differences"
    )
    .map(
      ([key]) => `${key} may need additional understanding.`
    );

  return {
    overallLabel,
    score,
    overallConclusion,
    ...report,
    strengths,
    potentialChallenges,
    recommendations: [
      "Discuss expectations directly before making long-term decisions.",
      "Make space for both shared values and individual preferences.",
    ],
  };
};

module.exports = {
  calculateCompatibility,
};