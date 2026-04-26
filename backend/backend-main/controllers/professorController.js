const { lookupProfessorRatings, fetchProfessorReviewBundle } = require("../services/rmpService");
const { summarizeProfessorReviews } = require("../services/groqService");

async function getProfessorRatings(req, res) {
  try {
    const { school, professors } = req.body || {};
    if (!school || !Array.isArray(professors)) {
      return res.status(400).json({ error: "school and professors[] are required" });
    }
    const uniqueProfessors = [...new Set(
      professors.map((p) => String(p || "").trim()).filter(Boolean)
    )];
    const ratingsByName = await lookupProfessorRatings(school, uniqueProfessors);
    return res.json({
      schoolFound: school,
      ratingsByName,
    });
  } catch (error) {
    console.error("Ratings error:", error);
    return res.status(500).json({ error: "Failed to fetch professor ratings" });
  }
}

async function getProfessorSummary(req, res) {
  try {
    const { school, professor } = req.body || {};
    if (!school || !professor) {
      return res.status(400).json({ error: "school and professor are required" });
    }

    const bundle = await fetchProfessorReviewBundle(school, professor);

    if (!bundle.found) {
      return res.status(404).json({
        error: "Professor not found",
        summary: {
          overview: "Professor match not found for this school.",
          teachingStyle: "Not enough review data",
          workloadAndGrading: "Not enough review data",
          studentTips: "Not enough review data",
          bestFit: "Not enough review data",
          pros: ["Not enough review data"],
          cons: ["Not enough review data"],
          confidenceNote: "No matching professor record was found."
        }
      });
    }

    const summary = await summarizeProfessorReviews(bundle);

    return res.json({
      professor: bundle.profName || professor,
      overallRating: bundle.rating ?? null,
      difficulty: bundle.difficulty ?? null,
      numRatings: bundle.numRatings ?? 0,
      overview: summary.overview,
      summary,
      wordFrequency: summary.wordFrequency || [],  // <-- added
      reviewCountUsed: bundle.reviews.length,
      professorId: bundle.id || null,
    });
  } catch (error) {
    console.error("Summary error:", error);
    return res.status(500).json({
      error: "Failed to generate summary",
      summary: {
        overview: "Could not generate summary right now.",
        teachingStyle: "Not enough review data",
        workloadAndGrading: "Not enough review data",
        studentTips: "Not enough review data",
        bestFit: "Not enough review data",
        pros: ["Not enough review data"],
        cons: ["Not enough review data"],
        confidenceNote: "Try again after verifying your backend and API keys."
      }
    });
  }
}

module.exports = {
  getProfessorRatings,
  getProfessorSummary,
};
