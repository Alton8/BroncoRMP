const { lookupProfessorRatings, fetchProfessorReviewBundle } = require("../services/rmpService");
const { summarizeProfessorReviews } = require("../services/geminiService");
const { extractWordFrequency } = require("../services/geminiService");

// Short-lived bundle cache so summary + wordcloud don't both hit RMP
const bundleCache = new Map();
const BUNDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getBundle(school, professor) {
  const key = `${school}||${professor}`.toLowerCase();
  const cached = bundleCache.get(key);
  if (cached && Date.now() - cached.ts < BUNDLE_TTL_MS) return cached.bundle;

  const bundle = await fetchProfessorReviewBundle(school, professor);
  bundleCache.set(key, { bundle, ts: Date.now() });
  if (bundleCache.size > 100) {
    const oldest = [...bundleCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    bundleCache.delete(oldest[0]);
  }
  return bundle;
}

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
    return res.json({ schoolFound: school, ratingsByName });
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

    const bundle = await getBundle(school, professor);

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

async function getProfessorWordCloud(req, res) {
  try {
    const { school, professor } = req.body || {};
    if (!school || !professor) {
      return res.status(400).json({ error: "school and professor are required" });
    }

    const bundle = await getBundle(school, professor);

    if (!bundle.found) {
      return res.json({ wordFrequency: [] });
    }

    const wordFrequency = extractWordFrequency(bundle.reviews);
    return res.json({ wordFrequency });
  } catch (error) {
    console.error("Word cloud error:", error);
    return res.status(500).json({ wordFrequency: [] });
  }
}

module.exports = {
  getProfessorRatings,
  getProfessorSummary,
  getProfessorWordCloud,
};
