const { RMPClient } = require("ratemyprofessors-client");

const client = new RMPClient();

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstArrayValue(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function extractList(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;

  const candidates = [
    result.items,
    result.results,
    result.professors,
    result.schools,
    result.nodes,
    result.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function professorDisplayName(prof) {
  return (
    prof.name ||
    [prof.firstName, prof.lastName].filter(Boolean).join(" ") ||
    ""
  ).trim();
}

async function resolveSchool(schoolName) {
  const result = await client.searchSchools(schoolName);
  const schools = extractList(result);
  if (!schools.length) return null;

  const normalizedTarget = normalizeName(schoolName);
  const exact = schools.find((s) => normalizeName(s.name) === normalizedTarget);
  return exact || schools[0];
}

async function searchProfessorsForSchool(schoolId, professorName) {
  const result = await client.searchProfessors(professorName);
  const all = extractList(result);

  return all.filter((prof) => {
    const ids = [
      prof.schoolId,
      prof.school_id,
      prof.school?.id,
      prof.school?.legacyId,
    ].filter(Boolean).map((v) => String(v));

    return ids.includes(String(schoolId));
  });
}

async function lookupProfessorRatings(schoolName, professorNames) {
  const school = await resolveSchool(schoolName);
  if (!school) return {};

  const ratingsByName = {};

  for (const originalName of professorNames) {
    try {
      const profs = await searchProfessorsForSchool(school.id, originalName);
      const normalizedTarget = normalizeName(originalName);

      const exact = profs.find((p) => normalizeName(professorDisplayName(p)) === normalizedTarget);
      const chosen = exact || profs[0];

      ratingsByName[originalName] = chosen
        ? {
            found: true,
            profName: professorDisplayName(chosen) || originalName,
            rating: chosen.avgRating ?? chosen.rating ?? null,
            difficulty: chosen.avgDifficulty ?? chosen.difficulty ?? null,
            numRatings: chosen.numRatings ?? chosen.numberOfRatings ?? 0,
            id: chosen.id ?? chosen.legacyId ?? null,
          }
        : {
            found: false,
            profName: originalName,
            rating: null,
            difficulty: null,
            numRatings: 0,
            id: null,
          };
    } catch (err) {
      ratingsByName[originalName] = {
        found: false,
        profName: originalName,
        rating: null,
        difficulty: null,
        numRatings: 0,
        id: null,
      };
    }
  }

  return ratingsByName;
}

function extractReviewText(review) {
  if (!review) return "";
  return (
    review.comment ||
    review.comments ||
    review.review ||
    review.reviewText ||
    review.text ||
    ""
  ).toString().trim();
}

async function fetchProfessorReviewBundle(schoolName, professorName) {
  const ratingsByName = await lookupProfessorRatings(schoolName, [professorName]);
  const selected = ratingsByName[professorName];

  if (!selected?.found || !selected?.id) {
    return {
      found: false,
      profName: professorName,
      reviews: [],
      numRatings: 0,
      rating: null,
      difficulty: null,
      id: null,
    };
  }

  let professor = null;
  let reviews = [];

  try {
    professor = await client.getProfessor(selected.id);
  } catch (err) {
    professor = null;
  }

  try {
    for await (const review of client.iterProfessorRatings(selected.id)) {
      const text = extractReviewText(review);
      if (!text) continue;

      reviews.push({
        class: review.class || review.className || review.course || "",
        date: review.date || review.createdAt || "",
        attendance: review.attendanceMandatory ?? review.attendance ?? null,
        wouldTakeAgain: review.wouldTakeAgain ?? null,
        grade: review.grade || "",
        difficulty: review.difficulty ?? null,
        clarity: review.clarity ?? null,
        helpful: review.helpfulRating ?? null,
        thumbsUp: review.thumbsUpTotal ?? review.thumbsUp ?? null,
        thumbsDown: review.thumbsDownTotal ?? review.thumbsDown ?? null,
        text,
        tags: Array.isArray(review.tags) ? review.tags : [],
      });

      if (reviews.length >= 40) break;
    }
  } catch (err) {
    reviews = [];
  }

  return {
    found: true,
    profName:
      professorDisplayName(professor) ||
      selected.profName ||
      professorName,
    reviews,
    numRatings:
      professor?.numRatings ??
      professor?.numberOfRatings ??
      selected.numRatings ??
      reviews.length,
    rating:
      professor?.avgRating ??
      professor?.rating ??
      selected.rating ??
      null,
    difficulty:
      professor?.avgDifficulty ??
      professor?.difficulty ??
      selected.difficulty ??
      null,
    id: selected.id ?? null,
  };
}

module.exports = {
  lookupProfessorRatings,
  fetchProfessorReviewBundle,
};
