const promptText = document.getElementById("prompt-text");
const responseText = document.getElementById("response-text");
const modelLine = document.getElementById("model-line");
const errorBox = document.getElementById("results-error");
const formattedResults = document.getElementById("formatted-results");

init();

async function init() {
  const resultId = getResultIdFromPath();
  if (!resultId) {
    showError("Missing result id.");
    return;
  }

  try {
    const response = await fetch(`/api/results/${encodeURIComponent(resultId)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to load result.");
    }

    if (promptText) promptText.textContent = data.prompt || "";
    if (responseText) responseText.textContent = data.response || "";
    if (modelLine) modelLine.textContent = data.model ? `Model: ${data.model}` : "";
    renderFormattedResponse(String(data.response || ""));
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to load result.");
  }
}

function renderFormattedResponse(text) {
  if (!formattedResults) return;
  formattedResults.innerHTML = "";

  const parsed = parseItineraries(text);
  if (!parsed.itineraries.length) {
    const fallback = document.createElement("p");
    fallback.className = "small-muted";
    fallback.textContent = "Could not detect itinerary sections automatically. See raw response below.";
    formattedResults.appendChild(fallback);
    return;
  }

  if (parsed.intro.length) {
    const intro = document.createElement("div");
    intro.className = "budget-box";

    const title = document.createElement("h2");
    title.textContent = "Overview";
    intro.appendChild(title);

    parsed.intro.forEach((line) => {
      const p = document.createElement("p");
      appendInlineRichText(p, line);
      intro.appendChild(p);
    });

    formattedResults.appendChild(intro);
  }

  const grid = document.createElement("div");
  grid.className = "card-grid";

  parsed.itineraries.forEach((itinerary) => {
    const card = document.createElement("article");
    card.className = "card itinerary-card";

    const title = document.createElement("h3");
    title.textContent = itinerary.title;
    card.appendChild(title);

    if (itinerary.whyThisWorks) {
      const why = document.createElement("p");
      why.className = "itinerary-summary";
      const label = document.createElement("strong");
      label.textContent = "Why this works: ";
      why.appendChild(label);
      appendInlineRichText(why, itinerary.whyThisWorks);
      card.appendChild(why);
    }

    itinerary.sections.forEach((section) => {
      const wrap = document.createElement("section");
      wrap.className = "tile-section";

      if (section.title) {
        const h4 = document.createElement("h4");
        h4.textContent = section.title;
        wrap.appendChild(h4);
      }

      section.paragraphs.forEach((line) => {
        const p = document.createElement("p");
        appendInlineRichText(p, line);
        wrap.appendChild(p);
      });

      if (section.bullets.length) {
        const ul = document.createElement("ul");
        ul.className = "tile-list";
        section.bullets.forEach((bullet) => {
          const li = document.createElement("li");
          appendInlineRichText(li, bullet);
          ul.appendChild(li);
        });
        wrap.appendChild(ul);
      }

      card.appendChild(wrap);
    });

    if (itinerary.trailingNotes.length) {
      const notes = document.createElement("div");
      notes.className = "tile-section tile-notes";
      const h4 = document.createElement("h4");
      h4.textContent = "Notes";
      notes.appendChild(h4);
      itinerary.trailingNotes.forEach((line) => {
        const p = document.createElement("p");
        appendInlineRichText(p, line);
        notes.appendChild(p);
      });
      card.appendChild(notes);
    }

    grid.appendChild(card);
  });

  formattedResults.appendChild(grid);

  if (parsed.tail.length) {
    const tail = document.createElement("div");
    tail.className = "progress-box";
    const title = document.createElement("h2");
    title.textContent = "Additional notes";
    tail.appendChild(title);
    parsed.tail.forEach((line) => {
      const p = document.createElement("p");
      appendInlineRichText(p, line);
      tail.appendChild(p);
    });
    formattedResults.appendChild(tail);
  }
}

function parseItineraries(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const itineraries = [];
  const intro = [];
  const tail = [];
  let current = null;
  let seenItinerary = false;

  for (const rawLine of lines) {
    const line = stripOuterMarkdown(rawLine);
    if (isItineraryHeading(line)) {
      if (current) itineraries.push(finalizeItinerary(current));
      current = { title: cleanHeading(line), lines: [] };
      seenItinerary = true;
      continue;
    }

    if (!seenItinerary) {
      if (line.trim()) intro.push(line.trim());
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      tail.push(line.trim());
    }
  }

  if (current) itineraries.push(finalizeItinerary(current));

  const parsedTail = [];
  for (const itinerary of itineraries) {
    if (itinerary._tailCapture.length) {
      parsedTail.push(...itinerary._tailCapture);
    }
    delete itinerary._tailCapture;
  }

  return {
    intro: compactLines(intro),
    itineraries,
    tail: compactLines([...parsedTail, ...tail])
  };
}

function finalizeItinerary(block) {
  const sections = [];
  const trailingNotes = [];
  let whyThisWorks = "";
  let currentSection = createSection("Details");
  let seenRealSection = false;
  const tailCapture = [];

  for (const raw of block.lines) {
    const line = stripOuterMarkdown(raw).trim();
    if (!line) continue;

    if (isItineraryHeading(line)) {
      tailCapture.push(line);
      continue;
    }

    if (/^why this works\s*:/i.test(line)) {
      whyThisWorks = line.replace(/^why this works\s*:/i, "").trim();
      continue;
    }

    if (looksLikeSectionHeading(line)) {
      if (!isSectionEmpty(currentSection) || seenRealSection) {
        sections.push(currentSection);
      }
      currentSection = createSection(cleanSectionTitle(line));
      seenRealSection = true;
      continue;
    }

    if (isBulletLine(line)) {
      currentSection.bullets.push(cleanBullet(line));
      continue;
    }

    if (/^(budget note|important watch-out|watch-out|driving note)\s*:/i.test(line)) {
      trailingNotes.push(line);
      continue;
    }

    currentSection.paragraphs.push(line);
  }

  if (!isSectionEmpty(currentSection) || sections.length === 0) {
    sections.push(currentSection);
  }

  return {
    title: block.title,
    whyThisWorks,
    sections: sections.filter((section) => !isSectionEmpty(section)),
    trailingNotes,
    _tailCapture: tailCapture
  };
}

function createSection(title) {
  return { title, paragraphs: [], bullets: [] };
}

function isSectionEmpty(section) {
  return section.paragraphs.length === 0 && section.bullets.length === 0;
}

function isItineraryHeading(line) {
  const cleaned = stripOuterMarkdown(line).trim();
  return /^#{0,6}\s*itinerary\s+[a-z0-9]+\b/i.test(cleaned);
}

function cleanHeading(line) {
  return stripOuterMarkdown(line).replace(/^#{1,6}\s*/, "").trim();
}

function looksLikeSectionHeading(line) {
  if (!line) return false;
  if (isBulletLine(line)) return false;
  if (/^why this works\s*:/i.test(line)) return false;
  if (/^itinerary\s+[a-z0-9]+\b/i.test(line)) return false;

  const cleaned = cleanSectionTitle(line);
  if (!cleaned) return false;
  if (cleaned.length > 90) return false;
  if (/[.!?]$/.test(cleaned) && !/:$/.test(line)) return false;

  if (/:$/.test(line)) return true;
  if (/^[A-Z][^:]{1,80}$/.test(cleaned)) return true;
  return false;
}

function cleanSectionTitle(line) {
  return stripOuterMarkdown(line).replace(/:\s*$/, "").trim();
}

function isBulletLine(line) {
  return /^[-*•]\s+/.test(line);
}

function cleanBullet(line) {
  return line.replace(/^[-*•]\s+/, "").trim();
}

function stripOuterMarkdown(value) {
  let line = String(value || "");
  line = line.replace(/^\s*>+\s?/, "");
  line = line.replace(/^#{1,6}\s*/, "");
  line = line.replace(/^\*\*(.+)\*\*$/u, "$1");
  return line;
}

function compactLines(lines) {
  const out = [];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    if (out[out.length - 1] === trimmed) continue;
    out.push(trimmed);
  }
  return out;
}

function appendInlineRichText(node, text) {
  const tokens = tokenizeInlineMarkdown(text);
  if (!tokens.length) {
    node.textContent = text;
    return;
  }

  for (const token of tokens) {
    if (token.type === "text") {
      node.appendChild(document.createTextNode(token.value));
      continue;
    }
    if (token.type === "strong") {
      const strong = document.createElement("strong");
      strong.textContent = token.value;
      node.appendChild(strong);
      continue;
    }
    if (token.type === "link") {
      const a = document.createElement("a");
      a.href = token.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = token.label;
      a.className = "inline-link";
      node.appendChild(a);
    }
  }
}

function tokenizeInlineMarkdown(input) {
  const tokens = [];
  let text = String(input || "");
  while (text.length > 0) {
    const mdLinkMatch = text.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    const urlMatch = text.match(/https?:\/\/[^\s)]+/);
    const boldMatch = text.match(/\*\*([^*]+)\*\*/);

    const candidates = [mdLinkMatch, urlMatch, boldMatch]
      .filter(Boolean)
      .map((match) => ({ match, index: match.index ?? 0 }));

    if (candidates.length === 0) {
      tokens.push({ type: "text", value: text });
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const next = candidates[0].match;
    const index = next.index ?? 0;

    if (index > 0) {
      tokens.push({ type: "text", value: text.slice(0, index) });
    }

    const chunk = next[0];
    if (next === mdLinkMatch) {
      tokens.push({ type: "link", label: next[1], href: next[2] });
    } else if (next === urlMatch) {
      tokens.push({ type: "link", label: next[0], href: next[0] });
    } else if (next === boldMatch) {
      tokens.push({ type: "strong", value: next[1] });
    }

    text = text.slice(index + chunk.length);
  }

  return tokens;
}

function getResultIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length >= 2 && parts[0] === "results" ? parts[1] : null;
}

function showError(message) {
  if (!errorBox) return;
  errorBox.hidden = false;
  errorBox.textContent = message;
}

