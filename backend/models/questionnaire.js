const mongoose = require("mongoose");

const fields = [
	"decisionMaking", "socialNature", "changeVsStability", "emotionalHandling", "emotionalSupport", "stressResponse",
	"disagreementStyle", "communicationImportance", "problemSolving", "trustBuilding", "honesty", "commitment",
	"responsibility", "decisionHandling", "conflictResolution", "familyImportance", "familyInvolvement", "socialLifestyle",
	"travelPreferences", "dailyRoutine", "careerPriority", "financialApproach", "careerAfterMarriage", "idealRelationship",
	"personalSpace", "longTermGoals",
];

const questionnaireSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
	...Object.fromEntries(fields.map((field) => [field, { type: String, required: true, trim: true }])),
}, { timestamps: true });

questionnaireSchema.methods.isComplete = function isComplete() {
	return fields.every((field) => typeof this[field] === "string" && this[field].trim());
};

const Questionnaire = mongoose.model("Questionnaire", questionnaireSchema);
Questionnaire.fields = fields;

module.exports = Questionnaire;
