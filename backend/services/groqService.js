const { GoogleGenAI } = require("@google/genai");

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","of","to","is","it","he","she",
  "they","was","for","are","with","his","her","this","that","have","had",
  "not","be","been","from","at","by","we","my","i","you","your","very",
  "just","so","get","got","also","would","could","will","really","about",
  "when","what","who","how","all","one","if","do","did","has","its","me",
  "him","them","their","our","out","up","as","than","then","there","were",
  "more","some","can","no","which","into","time","like","make","over","only",
  "even","most","take","after","before","because","any","where","each",
  "those","these","should","much","other","than","both","too","him","way",
  "down","well","been","see","him","may","back","use","two","long","know",
  "here","first","never","good","think","people","give","being","made","man",
  "many","same","still","between","need","while","through","come","during",
  "class","course","professor","prof","teacher","lecture","lectures","student",
  "students","semester","quarter","test","tests","exam","exams","grade","grades",
  "homework","assignment","assignments","syllabus","office","hours","going","take",
  "took","really","pretty","little","lot","bit","actually","definitely","overall",
  "feel","felt","think","thought","said","says","sure","hard","easy","great",
  "bad","good","okay","fine","just","make","makes","made","help","helps","helped",
  "know","knew","things","thing","back","look","looks","every","always","never",
  "sometimes","often","enough","kind","want","wanted","needs","needed","comes",
  "come","came","goes","went","gone","keep","kept","give","gave","given",
  // additional vague words not worth showing in a word cloud
  "stuff","something","anything","everything","nothing","someone","anyone",
  "everyone","person","people","way","ways","part","parts","point","points",
  "matter","reason","sense","place","time","times","work","works","worked",
  "learn","learned","learning","understand","understood","study","studied",
  "material","content","information","info","review","reviews","rating"
]);

const POSITIVE_WORDS = new Set([
  "helpful","amazing","excellent","fantastic","awesome","wonderful","brilliant",
  "clear","engaging","passionate","organized","fair","knowledgeable","caring",
  "enthusiastic","effective","understanding","patient","inspiring","thorough",
  "responsive","accommodating","interesting","supportive","flexible","best",
  "loves","enjoyed","recommend","curved","extra","credit","straightforward",
  "lenient","funny","entertaining","available","approachable","generous","kind"
]);

const NEGATIVE_WORDS = new Set([
  "boring","confusing","difficult","harsh","unfair","disorganized","unclear",
  "terrible","awful","useless","rude","unhelpful","avoid","worst","strict",
  "unresponsive","slow","monotone","dry","frustrating","stressful","tough",
  "unprepared","inconsistent","disappointing","lost","fails","heavy",
  "overwhelming","impossible","steep","rushed","vague","repetitive","dull"
]);

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overview:          { type: "string" },
    teachingStyle:     { type: "string" },
    workloadAndGrading:{ type: "string" },
    pros:              { type: "array", items: { type: "string" } },
    cons:              { type: "array", items: { type: "string" } },
    confidenceNote:    { type: "string" }
  },
  required: [
    "overview","teachingStyle","workloadAndGrading",
    "pros","cons","confidenceNote"
  ]
};

// In-memory cache: profId -> { summary, wordFrequency, ts }
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(profId) {
  const entry = cache.get(profId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(profId);
    return null;
  }
  return entry;
}

function setCached(profId, data) {
  // Evict oldest if cache grows large
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    cache.delete(oldest[0]);
  }
  cache.set(profId, { ...data, ts: Date.now() });
}

let _ai = null;
function getGeminiClient() {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

function getModelName() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

async function generateJson({ prompt, schema, temperature = 0 }) {
  const ai = getGeminiClient();
  if (!ai) throw new Error("Missing GEMINI_API_KEY");

  const response = await ai.models.generateContent({
    model: getModelName(),
    contents: prompt,
    config: { temperature, responseMimeType: "application/json", responseSchema: schema }
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return JSON.parse(text);
}

function extractWordFrequency(reviews) {
  const freq = {};

  for (const r of reviews) {
    const rawText = r?.text || r?.comment || r?.review || r?.reviewText || r?.description || "";
    const words = rawText
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, "")
      .replace(/'/g, "")
      .split(/\s+/)
      .map((w) => w.replace(/^-+|-+$/g, ""))
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

    for (const w of words) freq[w] = (freq[w] || 0) + 1;
  }

  return Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => ({
      word,
      count,
      sentiment: POSITIVE_WORDS.has(word) ? "positive"
        : NEGATIVE_WORDS.has(word) ? "negative"
        : "neutral"
    }));
}

function buildPrompt(bundle) {
  const reviewLines = bundle.reviews
    .slice(0, 10)
    .map((r, i) =>
      [
        `Review ${i + 1}:`,
        r.class        ? `Course: ${r.class}` : "",
        r.grade        ? `Grade: ${r.grade}` : "",
        r.wouldTakeAgain != null ? `Would take again: ${r.wouldTakeAgain}` : "",
        `Text: ${r.text || ""}`
      ].filter(Boolean).join("\n")
    )
    .join("\n\n");

  return `
Summarize these professor reviews for students picking classes.
Use only what the reviews say. If evidence is weak, say so.
Mention grading policy if found. Keep it casual and student-friendly.
Max 3 concise sentences per field.

Professor: ${bundle.profName}
Rating: ${bundle.rating ?? "Unknown"} | Difficulty: ${bundle.difficulty ?? "Unknown"} | # Ratings: ${bundle.numRatings ?? 0}

${reviewLines}
`.trim();
}

function fallbackSummary(bundle) {
  return {
    overview: `Based on ${bundle.reviews.length} reviews, there was not enough evidence to generate a strong AI summary.`,
    teachingStyle:      "Not enough review data",
    workloadAndGrading: "Not enough review data",
    pros:               ["Not enough review data"],
    cons:               ["Not enough review data"],
    confidenceNote:     "Low confidence — review volume was limited or AI was unavailable."
  };
}

async function summarizeProfessorReviews(bundle) {
  // Check cache first
  const cacheKey = bundle.id ? String(bundle.id) : bundle.profName;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`Cache hit for ${bundle.profName}`);
    return cached;
  }

  // Word frequency is pure JS — always fast, run immediately
  const wordFrequency = extractWordFrequency(bundle.reviews);

  if (!bundle.reviews.length) {
    return { ...fallbackSummary(bundle), wordFrequency };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      ...fallbackSummary(bundle),
      overview: `Found ${bundle.reviews.length} reviews but GEMINI_API_KEY is missing.`,
      confidenceNote: "Add GEMINI_API_KEY to your environment variables and redeploy.",
      wordFrequency
    };
  }

  try {
    const parsed = await generateJson({
      prompt: buildPrompt(bundle),
      schema: SUMMARY_SCHEMA,
      temperature: 0.2
    });

    const result = {
      overview:           parsed.overview           || fallbackSummary(bundle).overview,
      teachingStyle:      parsed.teachingStyle      || "Not enough review data",
      workloadAndGrading: parsed.workloadAndGrading || "Not enough review data",
      pros:  Array.isArray(parsed.pros) ? parsed.pros.slice(0, 3) : ["Not enough review data"],
      cons:  Array.isArray(parsed.cons) ? parsed.cons.slice(0, 3) : ["Not enough review data"],
      confidenceNote:     parsed.confidenceNote     || "Moderate confidence.",
      wordFrequency
    };

    setCached(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Gemini summarization error:", error);
    return { ...fallbackSummary(bundle), wordFrequency };
  }
}

module.exports = {
  summarizeProfessorReviews,
  extractWordFrequency
};
