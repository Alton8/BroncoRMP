chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "fetch") {
    fetch(request.url)
      .then(res => res.text())
      .then(text => sendResponse({ success: true, data: text }))
      .catch(err => {
        console.error("Background fetch failed:", err);
        sendResponse({ success: false });
      });

    return true; 
  }
});