function buildSearchUrl(name, schoolId = "13914") {
  const base = "https://www.ratemyprofessors.com/search/professors";
  const cleaned = name.trim().replace(/\s+/g, " ");
  const encodedName = encodeURIComponent(cleaned);
  return `${base}/${schoolId}?q=${encodedName}`;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "fetch", url },
      (response) => {
        if (!response || !response.success) {
          reject(new Error("Fetch failed"));
        } else {
          resolve(response.data);
        }
      }
    );
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

async function scrapeProfessorData(name, schoolId = "13914") {
  try {
    console.log("starting scrape for:", name);

    const professorUrl = await getProfessorPageUrl(name, schoolId);
    console.log("professorUrl:", professorUrl);

    if (!professorUrl) {
      return null;
    }

    const stats = await getProfessorStatsFromUrl(professorUrl);
    console.log("stats:", stats);

    if (!stats) {
      return null;
    }

    const scrapedName = `${stats.firstName || ""} ${stats.lastName || ""}`.trim();
    console.log("expected name:", scrapedName);

    if (normalizeName(scrapedName) !== normalizeName(name)) {
      console.log("name mismatch, rejecting");
      return null;
    }

    return {
      professorUrl,
      avgRating: stats.avgRating ?? null,
      wouldTakeAgainPercent: stats.wouldTakeAgainPercent ?? null,
      numRatings: stats.numRatings ?? null
    };
  } catch (err) {
    console.error("scrapeProfessorData failed:", err);
    return null;
  }
}