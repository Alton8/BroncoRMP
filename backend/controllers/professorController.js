const { lookupProfessorRatings, fetchProfessorReviewBundle } = require("../services/rmpService");
const { summarizeProfessorReviews } = require("../services/groqService");
const crypto = require("crypto");

function timingSafeEqualString(value, expected) {
  const valueBuffer = Buffer.from(String(value || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (valueBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function resolveGeminiCredentials(body = {}) {
  const geminiApiKey = String(body.geminiApiKey || "").trim();
  if (geminiApiKey) {
    return { apiKey: geminiApiKey, mode: "user_key" };
  }

  const accessPassword = String(body.accessPassword || "").trim();
  if (!accessPassword) {
    return {
      status: 401,
      error: "Enter your Gemini API key or the shared access password."
    };
  }

  const sharedPassword = String(process.env.GEMINI_ACCESS_PASSWORD || "").trim();
  if (!sharedPassword) {
    return {
      status: 503,
      error: "Shared password access is not configured on the backend."
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      status: 503,
      error: "Backend Gemini key is not configured."
    };
  }

  if (!timingSafeEqualString(accessPassword, sharedPassword)) {
    return {
      status: 401,
      error: "Invalid shared access password."
    };
  }

  return { apiKey: process.env.GEMINI_API_KEY, mode: "backend_key" };
}

function getGeminiCacheScope(credentials) {
  if (credentials.mode === "backend_key") return "backend_key";

  const keyHash = crypto
    .createHash("sha256")
    .update(credentials.apiKey)
    .digest("hex")
    .slice(0, 16);

  return `user_key:${keyHash}`;
}

function getErrorStatus(error) {
  return Number(error?.status || error?.code || error?.response?.status || 0);
}

function isLikelyGeminiCredentialError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || error || "").toLowerCase();

  return (
    [400, 401, 403].includes(status) &&
    /(api key|auth|credential|forbidden|invalid|permission|unauthorized)/.test(message)
  ) || /api key.*invalid|invalid.*api key/.test(message);
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
    const body = req.body || {};
    const { school, professor } = body;
    if (!school || !professor) {
      return res.status(400).json({ error: "school and professor are required" });
    }

    const credentials = resolveGeminiCredentials(body);
    if (!credentials.apiKey) {
      return res.status(credentials.status || 401).json({ error: credentials.error });
    }

    const bundle = await fetchProfessorReviewBundle(school, professor);

    if (!bundle.found) {
      return res.status(404).json({
        error: "Professor not found",
        summary: {
          overview: "Professor match not found for this school.",
          teachingStyle: "Not enough review data",
          workloadAndGrading: "Not enough review data",
          pros: ["Not enough review data"],
          cons: ["Not enough review data"],
          confidenceNote: "No matching professor record was found."
        }
      });
    }

    let summary;
    try {
      summary = await summarizeProfessorReviews(bundle, {
        apiKey: credentials.apiKey,
        cacheScope: getGeminiCacheScope(credentials),
        failOnGeminiError: credentials.mode === "user_key"
      });
    } catch (error) {
      const isCredentialError = credentials.mode === "user_key" && isLikelyGeminiCredentialError(error);
      return res.status(isCredentialError ? 401 : 502).json({
        error: isCredentialError
          ? "Your Gemini API key was rejected. Enter a different key or the shared password."
          : "Gemini could not generate a summary right now.",
        summary: {
          overview: "Could not generate summary right now.",
          teachingStyle: "Not enough review data",
          workloadAndGrading: "Not enough review data",
          pros: ["Not enough review data"],
          cons: ["Not enough review data"],
          confidenceNote: "Check your Gemini access and try again.",
          wordFrequency: error.wordFrequency || []
        },
        wordFrequency: error.wordFrequency || []
      });
    }

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
