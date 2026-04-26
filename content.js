console.log("content.js loaded");

const USE_LOCAL = false;
const REMOTE_API_BASE = "https://backend-u12d.onrender.com";
const API_BASE = USE_LOCAL ? "http://localhost:3000" : REMOTE_API_BASE;


function cleanName(name) {
  name = (name || "").replace(/\s+/g, " ").trim();

  const parts = name.split(" ");
  if (parts.length % 2 === 0 && parts.length > 1) {
    const half = parts.length / 2;
    const first = parts.slice(0, half).join(" ");
    const second = parts.slice(half).join(" ");
    if (first === second) name = first;
  }

  return name;
}

function getSectionNodes() {
  const all = Array.from(document.querySelectorAll("*"));

  return all
    .filter((el) => {
      const text = (el.innerText || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

      return /\d{2}-(LEC|LAB)\*?/.test(text);
    })
    .filter((el) => {
      return !Array.from(el.children).some((child) => {
        const childText = (child.innerText || child.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        return /\d{2}-(LEC|LAB)\*?/.test(childText);
      });
    });
}

function findSectionContainer(sectionNode) {
  let el = sectionNode;

  while (el && el !== document.body) {
    const text = (el.innerText || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    const hasSection = /\d{2}-(LEC|LAB)\*?/.test(text);
    const hasUsefulContent =
      text.includes("Instructor:") ||
      text.includes("View Details") ||
      text.includes("Rm") ||
      text.includes("pm") ||
      text.includes("am");

    if (hasSection && hasUsefulContent) {
      return el;
    }

    el = el.parentElement;
  }

  return sectionNode.parentElement;
}

function extractInstructorName(container) {
  const fullText = (container.innerText || container.textContent || "").trim();

  let match = fullText.match(/Instructor:\s*(.*?)\s+(Dates:|Days:|Time:|Room:)/i);
  if (match) {
    return cleanName(match[1].trim());
  }

  const pieces = fullText
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const skipPatterns = [
    /^\d{2}-(LEC|LAB)\*?$/i,
    /^\d{2}-(LEC|LAB)\*?\s*\(\d+\)$/i,
    /^\(\d+\)$/,
    /^\d+\/\d+$/,
    /^-$/,
    /^(Mo|Tu|We|Th|Fr|Sa|Su)$/i,
    /^(MoWe|TuTh|MWF|Mon|Tue|Wed|Thu|Fri)$/i,
    /^\d{1,2}:\d{2}\s*(am|pm)$/i,
    /^\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)$/i,
    /^Bldg\b/i,
    /^TBA$/i,
    /^View Details$/i,
    /^CLASS NOTES$/i,
    /^RMP:/i,
    /^Wait List Open$/i,
    /^Reserved Seats Open$/i,
    /^Unreserved Seats Open$/i,
    /^Instructor:$/i,
    /^Days:$/i,
    /^Time:$/i,
    /^Room:$/i,
    /^Dates:$/i,
    /^Status:$/i,
    /^AI Summary$/i
  ];

  const candidates = pieces.filter((piece) => {
    if (skipPatterns.some((pattern) => pattern.test(piece))) {
      return false;
    }

    return /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(piece);
  });

  if (candidates.length > 0) {
    return cleanName(candidates[0]);
  }

  return null;
}

function buildRatingText(data) {
  if (data && data.rating !== null && data.rating !== undefined) {
    const count = data.reviewCount ?? data.numRatings ?? 0;
    return `RMP: ${data.rating} ⭐ (${count})`;
  }
  return "RMP: N/A";
}

function ensureSummaryModal() {
  let overlay = document.getElementById("broncosort-summary-overlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "broncosort-summary-overlay";

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.45)",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "100000"
  });

  overlay.innerHTML = `
    <div class="broncosort-summary-modal" role="dialog" aria-modal="true" aria-label="Professor summary"
      style="
        width:min(760px, 92vw);
        max-height:85vh;
        overflow:auto;
        background:#fff;
        border-radius:16px;
        box-shadow:0 20px 60px rgba(0,0,0,0.25);
        padding:20px;
        font-family:Arial, sans-serif;
      ">
      <div class="broncosort-summary-header"
        style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px;">
        <div>
          <div class="broncosort-summary-title" style="font-size:22px; font-weight:700; color:#1f3b64;">Overview</div>
          <div id="broncosort-summary-subtitle" class="broncosort-summary-subtitle"
            style="font-size:14px; color:#5b6b7f; margin-top:4px;"></div>
        </div>
        <button id="broncosort-summary-close" type="button"
          style="
            border:none;
            background:transparent;
            font-size:28px;
            line-height:1;
            cursor:pointer;
            color:#5b6b7f;
          ">×</button>
      </div>
      <div id="broncosort-summary-body" class="broncosort-summary-body"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.style.display = "none";
  });

  overlay.querySelector("#broncosort-summary-close").addEventListener("click", () => {
    overlay.style.display = "none";
  });

  return overlay;
}

function fallbackSummary(message) {
  return {
    overview: message || "Summary unavailable.",
    teachingStyle: "Not enough review data",
    workloadAndGrading: "Not enough review data",
    studentTips: "Not enough review data",
    bestFit: "Not enough review data",
    pros: ["Not enough review data"],
    cons: ["Not enough review data"],
    confidenceNote: "Try again after verifying your backend and API keys."
  };
}

function sectionHtml(title, value) {
  const content = Array.isArray(value)
    ? `<ul style="margin:8px 0 0 18px;">${value.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : `<p style="margin:8px 0 0 0; line-height:1.5;">${value || "Not enough review data"}</p>`;

  return `
    <section class="broncosort-summary-section"
      style="margin-bottom:16px; padding:14px; border:1px solid #e3e8ef; border-radius:12px; background:#fafcff;">
      <h4 style="margin:0; font-size:15px; color:#1f3b64;">${title}</h4>
      ${content}
    </section>
  `;
}

function renderSummaryBody(summary) {
  return [
    sectionHtml("Teaching style", summary.teachingStyle),
    sectionHtml("Workload and grading", summary.workloadAndGrading),
    sectionHtml("Student tips", summary.studentTips),
    sectionHtml("Best fit", summary.bestFit),
    sectionHtml("Common pros", summary.pros || summary.commonPros),
    sectionHtml("Common cons", summary.cons || summary.commonCons),
    sectionHtml("Confidence note", summary.confidenceNote)
  ].join("");
}

async function openSummaryModal(professorName, ratingInfo = null) {
  const overlay = ensureSummaryModal();
  const subtitle = overlay.querySelector("#broncosort-summary-subtitle");
  const body = overlay.querySelector("#broncosort-summary-body");

  subtitle.textContent = `${professorName}${ratingInfo?.rating ? ` • ⭐ ${ratingInfo.rating}` : ""}`;
  body.innerHTML = "<p style='margin:0;'>Loading summary...</p>";
  overlay.style.display = "flex";

  try {
    const res = await fetch(`${API_BASE}/api/professor/summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        school: "Cal Poly Pomona",
        professor: professorName
      })
    });

    if (!res.ok) {
      const summary = fallbackSummary(`Summary request failed: ${res.status}`);
      body.innerHTML =
        `<section style="margin-bottom:16px; padding:14px; border:1px solid #e3e8ef; border-radius:12px; background:#fafcff;">
          <h4 style="margin:0; font-size:15px; color:#1f3b64;">Overview</h4>
          <p style="margin:8px 0 0 0; line-height:1.5;">${summary.overview}</p>
        </section>` + renderSummaryBody(summary);
      return;
    }

    const data = await res.json();
    const summary = data.summary || fallbackSummary("Summary missing from response.");
    const overview =
      data.overview ||
      summary.overview ||
      "AI summary generated from recent available reviews.";

    body.innerHTML =
      `<section style="margin-bottom:16px; padding:14px; border:1px solid #e3e8ef; border-radius:12px; background:#fafcff;">
        <h4 style="margin:0; font-size:15px; color:#1f3b64;">Overview</h4>
        <p style="margin:8px 0 0 0; line-height:1.5;">${overview}</p>
      </section>` + renderSummaryBody(summary);
  } catch (err) {
    const summary = fallbackSummary(`Summary request failed: ${err.message}`);
    body.innerHTML =
      `<section style="margin-bottom:16px; padding:14px; border:1px solid #e3e8ef; border-radius:12px; background:#fafcff;">
        <h4 style="margin:0; font-size:15px; color:#1f3b64;">Overview</h4>
        <p style="margin:8px 0 0 0; line-height:1.5;">${summary.overview}</p>
      </section>` + renderSummaryBody(summary);
  }
}

function addOrUpdateLabel(container, text, data = null) {
  let wrapper = container.querySelector(".my-extension-wrapper");
  let label;
  let button;

  function ensureMuiTooltip() {
    let popper = document.getElementById("my-extension-mui-tooltip-popper");
    if (popper) return popper;

    popper = document.createElement("div");
    popper.id = "my-extension-mui-tooltip-popper";
    popper.setAttribute("role", "tooltip");
    popper.className = "cx-MuiTooltip-popper";

    Object.assign(popper.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      transform: "translate3d(0px, 0px, 0px)",
      willChange: "transform",
      zIndex: "100000",
      pointerEvents: "none",
      visibility: "hidden"
    });

    const tooltip = document.createElement("div");
    tooltip.className =
      "cx-MuiTooltip-tooltip cx-MuiTooltip-tooltipPlacementBottom";

    Object.assign(tooltip.style, {
        opacity: "0",
        transform: "scale(0.75)",
        transition:
            "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 133ms cubic-bezier(0.4, 0, 0.2, 1)",
        background: "#000",
        color: "#fff",
        borderRadius: "4px",
        padding: "6px 12px",
        fontSize: "0.875rem",
        fontWeight: "600",
        lineHeight: "1.4",
        boxSizing: "border-box",
        maxWidth: "300px",
        wordBreak: "break-word",
        boxShadow: "0px 3px 8px rgba(0,0,0,0.2)"
    });

    const textNode = document.createElement("p");
    textNode.className = "cx-MuiTypography-root text-white cx-MuiTypography-body1";

    Object.assign(textNode.style, {
        margin: "0",
        color: "#fff",
        fontSize: "0.875rem",
        whiteSpace: "nowrap",
        fontWeight: "500",
        lineHeight: "1.4"
    });

    tooltip.appendChild(textNode);
    popper.appendChild(tooltip);
    document.body.appendChild(popper);

    return popper;
  }

  function showMuiTooltip(target, message) {
  if (!message) return;

  const popper = ensureMuiTooltip();
  const tooltip = popper.firstElementChild;
  const textNode = tooltip.firstElementChild;

  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = null;
  }

  textNode.textContent = message;

  const anchor = target.querySelector(".my-extension-label-text") || target;
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const centerX = rect.left + rect.width / 2;

  popper.style.visibility = "visible";
  popper.style.display = "block";
  popper.style.left = `${centerX}px`;
  popper.style.top = `${top}px`;
  popper.style.transform = "translateX(-50%)";
  popper.setAttribute("x-placement", "bottom");

  // Reset to hidden state so animation can replay every time
  tooltip.style.transition = "none";
  tooltip.style.opacity = "0";
  tooltip.style.transform = "scale(0.75)";

  // Force reflow
  void tooltip.offsetHeight;

  // Re-enable transition and animate in
  tooltip.style.transition =
    "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 133ms cubic-bezier(0.4, 0, 0.2, 1)";

  requestAnimationFrame(() => {
    tooltip.style.opacity = "1";
    tooltip.style.transform = "scale(1)";
  });
}
    let tooltipHideTimeout = null;
    function hideMuiTooltip() {
    const popper = document.getElementById("my-extension-mui-tooltip-popper");
    if (!popper) return;

    const tooltip = popper.firstElementChild;

    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
    }

    tooltip.style.opacity = "0";
    tooltip.style.transform = "scale(0.75)";

    tooltipHideTimeout = setTimeout(() => {
        popper.style.visibility = "hidden";
        popper.style.display = "none";
        tooltipHideTimeout = null;
    }, 200);
    }

  if (!wrapper) {
    container.style.position = "relative";

    wrapper = document.createElement("div");
    wrapper.className = "my-extension-wrapper";

    Object.assign(wrapper.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      background: "white",
      padding: "2px 6px",
      borderRadius: "6px",
      whiteSpace: "nowrap",
      marginRight: "12px"
    });

    label = document.createElement("span");
    label.className = "my-extension-label";
    label.style.setProperty("cursor", "pointer", "important");
    Object.assign(label.style, {
      color: "#1a73e8",
      fontSize: "14px",
      fontWeight: "500",
      cursor: "pointer",
      textDecoration: "none",
      padding: "2px 4px",
      borderRadius: "4px",
      transition: "background 0.2s ease"
    });

    label.onmouseenter = () => {
        tooltipShowTimeout = setTimeout(() => {
            showMuiTooltip(label, "Open Rate My Professors");
        }, 150); // delay in ms (150–250 feels good)
    };

    label.onmouseleave = () => {
        if (tooltipShowTimeout) {
            clearTimeout(tooltipShowTimeout);
            tooltipShowTimeout = null;
        }
        hideMuiTooltip();
    };

    button = document.createElement("button");
    button.className = "my-extension-summary-btn";
    button.type = "button";
    button.textContent = "Summary";
    button.style.setProperty("cursor", "pointer", "important");

    Object.assign(button.style, {
      background: "#f5f7fb",
      color: "#000000",
      border: "1px solid #c7d3e3",
      borderRadius: "999px",
      padding: "4px 10px",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.2s ease"
    });

    button.onmouseenter = () => {
    // keep your hover styles
        button.style.backgroundColor = "#ffffff";
        button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
        button.style.transform = "translateY(-1px)";
        button.style.borderColor = "#007aff";
        button.style.setProperty("cursor", "pointer", "important");

        // delay showing tooltip
        tooltipShowTimeout = setTimeout(() => {
            showMuiTooltip(button, "View AI summary");
        }, 150); // tweak 100–200ms to taste
    };

    button.onmouseleave = () => {
    // reset styles
        button.style.backgroundColor = "#f5f7fb";
        button.style.boxShadow = "none";
        button.style.transform = "translateY(0)";
        button.style.borderColor = "#c7d3e3";

        // cancel pending show if you left quickly
        if (tooltipShowTimeout) {
            clearTimeout(tooltipShowTimeout);
            tooltipShowTimeout = null;
        }

        hideMuiTooltip();
    };

    wrapper.appendChild(label);
    wrapper.appendChild(button);

    const checkbox = container.querySelector('input[type="checkbox"]');

    if (checkbox) {
      const checkboxBlock =
        checkbox.closest('[role="cell"]') ||
        checkbox.closest('.cx-MuiGrid-item') ||
        checkbox.parentElement;

      if (checkboxBlock && checkboxBlock.parentElement) {
        checkboxBlock.parentElement.insertBefore(wrapper, checkboxBlock);
      } else {
        container.appendChild(wrapper);
      }
    } else {
      container.appendChild(wrapper);
    }
  } else {
    label = wrapper.querySelector(".my-extension-label");
    button = wrapper.querySelector(".my-extension-summary-btn");
  }

    label.innerHTML = `
    <span class="my-extension-label-text">${text}</span>
    <span class="my-extension-label-arrow" style="font-size: 11px; opacity: 0.6; margin-left: 2px;">↗</span>
    `;
  label.onclick = null;
  label.title = "";
  button.title = "";

  const ratingMatch = text.match(/[\d.]+/);
  const rating = ratingMatch ? parseFloat(ratingMatch[0]) : null;

  if (rating !== null && !isNaN(rating)) {
    if (rating > 4.0) {
      label.style.color = "#2e7d32";
    } else if (rating > 3.0) {
      label.style.color = "#f9a825";
    } else {
      label.style.color = "#c62828";
    }
  } else {
    label.style.color = "#1a73e8";
  }

  if (data?.url) {
    label.onclick = () => {
      window.open(data.url, "_blank");
    };
  }

  button.onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const instructorName = extractInstructorName(container);
    if (!instructorName) {
      await openSummaryModal("Unknown instructor");
      return;
    }

    await openSummaryModal(instructorName, data);
  };
}

function clearOldLabels() {
  document.querySelectorAll(".my-extension-wrapper").forEach((el) => el.remove());
}

function processRows() {
  clearOldLabels();

  const sectionNodes = getSectionNodes();
  console.log("sectionNodes found:", sectionNodes.length);

  sectionNodes.forEach((sectionNode) => {
    const container = findSectionContainer(sectionNode);
    if (!container) return;

    const instructorName = extractInstructorName(container);
    console.log("EXTRACTED:", instructorName);

    if (!instructorName) {
      addOrUpdateLabel(container, "RMP: N/A");
      return;
    }

    addOrUpdateLabel(container, "RMP: ...");

    getOrFetchProfessorData(instructorName, (data) => {
      addOrUpdateLabel(container, buildRatingText(data), data);
    });
  });
}

function runWhenRowsExist() {
  let attempts = 0;
  const maxAttempts = 30;

  const interval = setInterval(() => {
    attempts++;

    const nodes = getSectionNodes();
    console.log("retry", attempts, "nodes:", nodes.length);

    if (nodes.length > 0) {
      clearInterval(interval);
      processRows();
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.log("Failed to find rows");
    }
  }, 500);
}

function start() {
  runWhenRowsExist();

  let lastUrl = location.href;

  const rerunForNavigation = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    console.log("URL changed:", lastUrl);
    setTimeout(() => {
      runWhenRowsExist();
    }, 400);
  };

  window.addEventListener("popstate", rerunForNavigation);

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    rerunForNavigation();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    rerunForNavigation();
  };

  const observer = new MutationObserver(() => {
    rerunForNavigation();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

fetch(`${API_BASE}/api/health`).catch(() => {});
start();