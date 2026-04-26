const Groq = require("groq-sdk");

const STOP_WORDS = new Set([
  // common english
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
  // rmp-specific noise words
  "class","course","professor","prof","teacher","lecture","lectures","student",
  "students","semester","quarter","test","tests","exam","exams","grade","grades",
  "homework","assignment","assignments","syllabus","office","hours","going","take",
  "took","really","pretty","little","lot","bit","actually","definitely","overall",
  "feel","felt","think","thought","said","says","sure","hard","easy","great",
  "bad","good","okay","fine","just","make","makes","made","help","helps","helped",
  "know","knew","things","thing","back","look","looks","every","always","never",
  "sometimes","often","enough","kind","want","wanted","needs","needed","comes",
  "come","came","goes","went","gone","keep","kept","give","gave","given"
]);

const POSITIVE_WORDS = new Set([
  "helpful","amazing","excellent","fantastic","awesome","wonderful","brilliant",
  "clear","engaging","passionate","organized","fair","knowledgeable","caring",
  "enthusiastic","effective","understanding","patient","inspiring","thorough",
  "responsive","accommodating","interesting","supportive","flexible","best",
  "loves","enjoyed","recommend","curves","extra","credit","straightforward",
  "easy","lenient","funny","entertaining","available","approachable"
]);

const NEGATIVE_WORDS = new Set([
  "boring","confusing","difficult","harsh","unfair","disorganized","unclear",
  "terrible","awful","useless","rude","unhelpful","avoid","worst","hard",
  "strict","unresponsive","slow","monotone","dry","frustrating","stressful",
  "curve","tough","unprepared","inconsistent","disappointing","lost","fails",
  "curved","unclear","disorganized","heavy","overwhelming","impossible","steep"
]);

function extractWordFrequency(reviews) {
  const freq = {};

  for (const r of reviews) {
    const rawText =
      r?.text ||
      r?.comment ||
      r?.review ||
      r?.reviewText ||
      r?.description ||
      "";

    const words = rawText
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, "")
      .replace(/'/g, "")
      .split(/\s+/)
      .map(w => w.replace(/^-+|-+$/g, ""))
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));

    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }

  const result = Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([word, count]) => ({
      word,
      count,
      sentiment: POSITIVE_WORDS.has(word)
        ? "positive"
        : NEGATIVE_WORDS.has(word)
        ? "negative"
        : "neutral"
    }));

  return result;
}

function buildPrompt(bundle) {
  const reviewLines = bundle.reviews.slice(0, 40).map((r, i) => {
    return [
      `Review ${i + 1}:`,
      r.class ? `Course: ${r.class}` : "",
      r.grade ? `Grade: ${r.grade}` : "",
      r.attendance !== null ? `Attendance: ${r.attendance}` : "",
      r.wouldTakeAgain !== null ? `Would take again: ${r.wouldTakeAgain}` : "",
      `Text: ${r.text}`
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `
You are summarizing professor reviews for students choosing classes.
Use only the provided review data and metadata.
Do not invent claims that are not supported by the reviews.
If evidence is weak, say so.
Mention any grading policy found in the reviews in the overview.
Professor: ${bundle.profName}
Overall rating: ${bundle.rating ?? "Unknown"}
Difficulty: ${bundle.difficulty ?? "Unknown"}
Number of ratings: ${bundle.numRatings ?? 0}
Reviews:
${reviewLines}
Return valid JSON with this exact shape:
{
  "overview": "2-3 casual sentence overview",
  "teachingStyle": "1 short casual paragraph",
  "workloadAndGrading": "1 short casual paragraph",
  "studentTips": "1 short casual paragraph",
  "bestFit": "1 short casual paragraph",
  "pros": ["3 concise casual bullets max"],
  "cons": ["3 concise casual bullets max"],
  "confidenceNote": "1 casual sentence"
}
`.trim();
}

function fallbackSummary(bundle) {
  return {
    overview: `Based on ${bundle.reviews.length} pulled reviews, there was not enough structured evidence to generate a strong AI summary.`,
    teachingStyle: "Not enough review data",
    workloadAndGrading: "Not enough review data",
    studentTips: "Not enough review data",
    bestFit: "Not enough review data",
    pros: ["Not enough review data"],
    cons: ["Not enough review data"],
    confidenceNote: "Low confidence because review volume was limited or the AI response was unavailable."
  };
}

async function filterWordFrequencyWithAI(words, reviews) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !words?.length) return words;

  const groq = new Groq({ apiKey });

  const reviewSamples = reviews
    .slice(0, 10)
    .map(r => r.text || r.comment || r.review || "")
    .filter(Boolean);

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: `Filter a word cloud for professor reviews.
          Keep ONLY:
          - descriptive adjectives (clear, confusing, helpful, organized, difficult)
          - meaningful academic nouns (projects, exams, labs, quizzes, grading)
          
          REMOVE:
          - generic nouns (group, material, things, stuff, information)
          - verbs (learn, understand, study)
          - filler or vague words
          
          Goal: keep words that help a student quickly judge the professor.
          
          Return JSON:
          {
            "keepWords": ["clear", "confusing", "organized", "projects", "quizzes"]
          }`
        },
        {
          role: "user",
          content: JSON.stringify({
            candidateWords: words,
            reviewSamples
          })
        }
      ]
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const keepSet = new Set(parsed.keepWords || []);

    return words.filter(w => keepSet.has(w.word));
  } catch (err) {
    console.error("AI filter failed:", err);
    return words;
  }
}

async function summarizeProfessorReviews(bundle) {
  // Always compute word frequency from raw reviews regardless of AI availability
  const rawWordFrequency = extractWordFrequency(bundle.reviews);
  const wordFrequency = await filterWordFrequencyWithAI(rawWordFrequency, bundle.reviews);

  if (!bundle.reviews.length) {
    return { ...fallbackSummary(bundle), wordFrequency };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      overview: `Found ${bundle.reviews.length} reviews, but GROQ_API_KEY is missing on the backend.`,
      teachingStyle: "Not enough review data",
      workloadAndGrading: "Not enough review data",
      studentTips: "Not enough review data",
      bestFit: "Not enough review data",
      pros: ["Not enough review data"],
      cons: ["Not enough review data"],
      confidenceNote: "Add GROQ_API_KEY to your environment variables and redeploy.",
      wordFrequency
    };
  }

  const groq = new Groq({ apiKey });

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You summarize professor reviews into clear, student-useful insights and return only valid JSON."
        },
        {
          role: "user",
          content: buildPrompt(bundle)
        }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw);

    return {
      overview: parsed.overview || fallbackSummary(bundle).overview,
      teachingStyle: parsed.teachingStyle || "Not enough review data",
      workloadAndGrading: parsed.workloadAndGrading || "Not enough review data",
      studentTips: parsed.studentTips || "Not enough review data",
      bestFit: parsed.bestFit || "Not enough review data",
      pros: Array.isArray(parsed.pros) ? parsed.pros.slice(0, 3) : ["Not enough review data"],
      cons: Array.isArray(parsed.cons) ? parsed.cons.slice(0, 3) : ["Not enough review data"],
      confidenceNote: parsed.confidenceNote || "Moderate confidence.",
      wordFrequency   // <-- attached here
    };
  } catch (error) {
    console.error("Groq summarization error:", error);
    return { ...fallbackSummary(bundle), wordFrequency };
  }
}

module.exports = {
  summarizeProfessorReviews,
};
