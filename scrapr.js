function buildSearchUrl(name, schoolId = "13914") {
  const base = "https://www.ratemyprofessors.com/search/professors";
  const cleaned = (name || "").trim().replace(/\s+/g, " ");
  const encodedName = encodeURIComponent(cleaned);
  return `${base}/${schoolId}?q=${encodedName}`;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "fetch", url }, (response) => {
      if (!response || !response.success) {
        reject(new Error("Fetch failed"));
      } else {
        resolve(response.data);
      }
    });
  });
}

function extractProfessorPageUrlFromSearchHtml(html) {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");

    for (const link of doc.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href");

      if (href && href.includes("/professor/")) {
        return new URL(href, "https://www.ratemyprofessors.com").href;
      }
    }
  }

  const match =
    html.match(/href=["']([^"']*\/professor\/\d+[^"']*)["']/i) ||
    html.match(/(\/professor\/\d+)/);

  return match ? new URL(match[1], "https://www.ratemyprofessors.com").href : null;
}

async function getProfessorPageUrl(name, schoolId = "13914") {
  const searchUrl = buildSearchUrl(name, schoolId);
  const searchHtml = await fetchText(searchUrl);
  return extractProfessorPageUrlFromSearchHtml(searchHtml);
}

function parseNumberField(text, fieldName) {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*(null|-?\\d+(?:\\.\\d+)?)`);
  const match = text.match(regex);

  if (!match) {
    return null;
  }

  return match[1] === "null" ? null : Number(match[1]);
}

function parseStringField(text, fieldName) {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`);
  const match = text.match(regex);

  return match ? match[1] : null;
}

function extractProfessorStats(text) {
  return {
    avgRating: parseNumberField(text, "avgRating"),
    wouldTakeAgainPercent: parseNumberField(text, "wouldTakeAgainPercent"),
    numRatings: parseNumberField(text, "numRatings"),
    firstName: parseStringField(text, "firstName"),
    lastName: parseStringField(text, "lastName")
  };
}

function extractRelevantScriptText(html) {
  if (typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const script of doc.querySelectorAll("script")) {
    const content = script.textContent || "";

    if (
      content.includes('"avgRating"') &&
      content.includes('"numRatings"') &&
      content.includes('"wouldTakeAgainPercent"') &&
      content.includes('"firstName"') &&
      content.includes('"lastName"')
    ) {
      return content;
    }
  }

  return html;
}

async function getProfessorStatsFromUrl(professorUrl) {
  if (!professorUrl) {
    return null;
  }

  const professorHtml = await fetchText(professorUrl);
  const content = extractRelevantScriptText(professorHtml);
  const stats = extractProfessorStats(content);

  if (
    stats.avgRating === null &&
    stats.wouldTakeAgainPercent === null &&
    stats.numRatings === null
  ) {
    return null;
  }

  return stats;
}

function normalizeName(name) {
  return (name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildSearchCandidates(name) {
  const cleaned = (name || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return [];

  const parts = cleaned.split(" ").filter(Boolean);
  const candidates = [cleaned];

  if (parts.length === 3) {
    candidates.push(`${parts[0]} ${parts[1]}`);
    candidates.push(`${parts[0]} ${parts[2]}`);
  }

  return [...new Set(candidates)];
}

function namesMatch(scrapedFirst, scrapedLast, attemptedName, originalName) {
  const scrapedFull = normalizeName(
    `${scrapedFirst || ""} ${scrapedLast || ""}`.trim()
  );
  const attempted = normalizeName(attemptedName);
  const original = normalizeName(originalName);

  if (!scrapedFull) return false;

  if (scrapedFull === attempted) return true;
  if (scrapedFull === original) return true;

  const originalParts = original.split(" ").filter(Boolean);

  if (originalParts.length === 3) {
    const firstMiddle = normalizeName(`${originalParts[0]} ${originalParts[1]}`);
    const firstLast = normalizeName(`${originalParts[0]} ${originalParts[2]}`);

    if (scrapedFull === firstMiddle) return true;
    if (scrapedFull === firstLast) return true;
  }

  return false;
}

async function scrapeProfessorData(name, schoolId = "13914") {
  try {
    console.log("starting scrape for:", name);

    const candidates = buildSearchCandidates(name);
    console.log("search candidates:", candidates);

    for (const candidate of candidates) {
      console.log("trying candidate:", candidate);

      const professorUrl = await getProfessorPageUrl(candidate, schoolId);
      console.log("professorUrl:", professorUrl);

      if (!professorUrl) {
        continue;
      }

      const stats = await getProfessorStatsFromUrl(professorUrl);
      console.log("stats:", stats);

      if (!stats) {
        continue;
      }

      const scrapedName = `${stats.firstName || ""} ${stats.lastName || ""}`.trim();
      console.log("scraped name:", scrapedName);

      if (!namesMatch(stats.firstName, stats.lastName, candidate, name)) {
        console.log("name mismatch for candidate, rejecting");
        continue;
      }

      return {
        professorUrl,
        avgRating: stats.avgRating ?? null,
        wouldTakeAgainPercent: stats.wouldTakeAgainPercent ?? null,
        numRatings: stats.numRatings ?? null
      };
    }

    return null;
  } catch (err) {
    console.error("scrapeProfessorData failed:", err);
    return null;
  }
}