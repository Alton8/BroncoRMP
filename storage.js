const pendingRequests = {};

function normalizeName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getProfessorData(name, callback) {
  const key = normalizeName(name);

  chrome.storage.local.get("ratings", (result) => {
    const ratings = result.ratings || {};
    callback(ratings[key] || null);
  });
}

function saveProfessorData(profData, callback) {
  const key = normalizeName(profData.name);

  chrome.storage.local.get("ratings", (result) => {
    const ratings = result.ratings || {};

    ratings[key] = {
      ...profData,
      fetchedAt: Date.now()
    };

    chrome.storage.local.set({ ratings }, () => {
      console.log("saved:", key, ratings[key]);
      if (callback) callback(ratings[key]);
    });
  });
}

function isFresh(data) {
  if (!data || !data.fetchedAt) return false;

  const ONE_DAY = 1000 * 60 * 60 * 24;
  return Date.now() - data.fetchedAt < ONE_DAY;
}

function scrapeProfessorDataWrapper(name, callback) {
  scrapeProfessorData(name)
    .then((json) => {
      if (!json) {
        callback(null);
        return;
      }

      callback({
        name: name,
        rating: json.avgRating,
        reviewCount: json.numRatings ?? 0,
        wouldTakeAgain: json.wouldTakeAgainPercent ?? null,
        url: json.professorUrl ?? null
      });
    })
    .catch((err) => {
      console.error("scraper failed:", name, err);
      callback(null);
    });
}

function getOrFetchProfessorData(name, callback) {
  const key = normalizeName(name);

  getProfessorData(name, (cachedData) => {
    if (cachedData && isFresh(cachedData)) {
      console.log("cache hit:", name, cachedData);
      callback(cachedData);
      return;
    }

    if (pendingRequests[key]) {
      pendingRequests[key].push(callback);
      return;
    }

    pendingRequests[key] = [callback];

    console.log("cache miss, scraping:", name);

    scrapeProfessorDataWrapper(name, (freshData) => {
      const callbacks = pendingRequests[key] || [];
      delete pendingRequests[key];

      if (!freshData) {
        callbacks.forEach((cb) => cb(cachedData || null));
        return;
      }

      saveProfessorData(freshData, (savedData) => {
        callbacks.forEach((cb) => cb(savedData));
      });
    });
  });
}