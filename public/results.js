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
    renderFormattedResponse(String(data.response || ""), {
      model: data.model || "",
      createdAt: data.createdAt || ""
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to load result.");
  }
}

function renderFormattedResponse(text, meta = {}) {
  if (!formattedResults) return;
  formattedResults.innerHTML = "";

  const parsed = parseItineraries(text);
  formattedResults.appendChild(renderSummaryBar(parsed, meta));
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
      intro.appendChild(renderLineNode(line));
    });

    formattedResults.appendChild(intro);
  }

  formattedResults.appendChild(renderCompareStrip(parsed.itineraries));

  const grid = document.createElement("div");
  grid.className = "card-grid";

  parsed.itineraries.forEach((itinerary, index) => {
    const card = document.createElement("article");
    card.className = "card itinerary-card";
    card.id = `itinerary-${index + 1}`;

    const titleParts = splitItineraryTitle(itinerary.title);
    const titleBlock = document.createElement("div");
    titleBlock.className = "itinerary-title-block";

    if (titleParts.label) {
      const label = document.createElement("p");
      label.className = "itinerary-title-label";
      label.textContent = titleParts.label;
      titleBlock.appendChild(label);
    }

    const badgeRow = document.createElement("div");
    badgeRow.className = "itinerary-badge-row";
    buildItineraryBadges(itinerary).forEach((text) => {
      const badge = document.createElement("span");
      badge.className = "itinerary-badge";
      badge.textContent = text;
      badgeRow.appendChild(badge);
    });
    titleBlock.appendChild(badgeRow);

    const title = document.createElement("h3");
    title.textContent = titleParts.heading || itinerary.title;
    titleBlock.appendChild(title);

    if (titleParts.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "itinerary-title-subtitle";
      subtitle.textContent = titleParts.subtitle;
      titleBlock.appendChild(subtitle);
    }

    card.appendChild(titleBlock);

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
        wrap.appendChild(renderLineNode(line));
      });

      if (section.bullets.length) {
        const ul = document.createElement("ul");
        ul.className = "tile-list";
        section.bullets.forEach((bullet) => {
          const li = document.createElement("li");
          const callout = getCalloutMeta(bullet);
          if (callout) li.className = `callout-item ${callout.kind}`;
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
        notes.appendChild(renderLineNode(line));
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
      tail.appendChild(renderLineNode(line));
    });
    formattedResults.appendChild(tail);
  }
}

function renderSummaryBar(parsed, meta) {
  const wrap = document.createElement("section");
  wrap.className = "results-summary-strip";

  const title = document.createElement("p");
  title.className = "results-summary-title";
  title.textContent = "Results summary";
  wrap.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "results-summary-subtitle";
  const bits = [];
  bits.push(`${parsed.itineraries.length} itinerary ${parsed.itineraries.length === 1 ? "tile" : "tiles"}`);
  if (parsed.intro.length) bits.push("overview detected");
  if (meta.createdAt) {
    const when = formatDateTime(meta.createdAt);
    if (when) bits.push(`generated ${when}`);
  }
  subtitle.textContent = bits.join(" • ");
  wrap.appendChild(subtitle);

  const chips = document.createElement("div");
  chips.className = "results-summary-chips";
  const values = [
    parsed.itineraries.length > 0 ? "Tile parser matched" : "Tile parser fallback",
    countTotalLinks(parsed.itineraries) ? `${countTotalLinks(parsed.itineraries)} links detected` : null
  ].filter(Boolean);
  values.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "summary-chip";
    chip.textContent = value;
    chips.appendChild(chip);
  });
  wrap.appendChild(chips);
  return wrap;
}

function renderCompareStrip(itineraries) {
  const wrap = document.createElement("section");
  wrap.className = "compare-strip";

  const title = document.createElement("h2");
  title.textContent = "Quick compare";
  wrap.appendChild(title);

  const list = document.createElement("div");
  list.className = "compare-strip-list";

  itineraries.forEach((itinerary, index) => {
    const item = document.createElement("a");
    item.href = `#itinerary-${index + 1}`;
    item.className = "compare-card";

    const titleParts = splitItineraryTitle(itinerary.title);
    const label = document.createElement("p");
    label.className = "compare-card-label";
    label.textContent = titleParts.label || `Option ${index + 1}`;
    item.appendChild(label);

    const heading = document.createElement("p");
    heading.className = "compare-card-title";
    heading.textContent = titleParts.heading || itinerary.title;
    item.appendChild(heading);

    const signals = extractCompareSignals(itinerary);
    if (signals) {
      const blurb = document.createElement("p");
      blurb.className = "compare-card-blurb";
      blurb.textContent = signals;
      item.appendChild(blurb);
    }

    list.appendChild(item);
  });

  wrap.appendChild(list);
  return wrap;
}

function extractCompareSignals(itinerary) {
  const lines = collectItineraryLines(itinerary);
  const candidates = [
    findLineByKeyword(lines, /\bbudget\b|\$\d/i),
    findLineByKeyword(lines, /\blodging\b|\bhome\b|\bcondo\b|\bhotel\b|\bvrbo\b|\bairbnb\b/i),
    findLineByKeyword(lines, /\bcar\b|\bdrive\b|\bparking\b|\bairport\b|\bshuttle\b/i),
    itinerary.whyThisWorks
  ];

  const snippets = [];
  for (const line of candidates) {
    const compact = compactSnippet(line);
    if (compact && !snippets.includes(compact)) snippets.push(compact);
  }
  return snippets.slice(0, 2).join(" • ");
}

function collectItineraryLines(itinerary) {
  const lines = [];
  if (itinerary.whyThisWorks) lines.push(itinerary.whyThisWorks);
  itinerary.sections.forEach((section) => {
    if (section.title) lines.push(section.title);
    lines.push(...section.paragraphs);
    lines.push(...section.bullets);
  });
  lines.push(...itinerary.trailingNotes);
  return lines;
}

function findLineByKeyword(lines, pattern) {
  return lines.find((line) => pattern.test(line)) || "";
}

function compactSnippet(line) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 108 ? `${text.slice(0, 105)}...` : text;
}

function buildItineraryBadges(itinerary) {
  const lines = collectItineraryLines(itinerary);
  const text = lines.join("\n").toLowerCase();
  const badges = [];
  if (itinerary.sections.length) badges.push(`${itinerary.sections.length} sections`);
  const links = countLinksInText(lines.join("\n"));
  if (links) badges.push(`${links} links`);
  if (/\bbudget\b|\$\d/.test(text)) badges.push("budget noted");
  if (/\bikon\b|\bepic\b|\bpass\b/.test(text)) badges.push("pass fit");
  if (/\bcar\b|\bdrive\b|\bparking\b|\bairport\b|\bshuttle\b/.test(text)) badges.push("transport");
  return badges.slice(0, 4);
}

function countTotalLinks(itineraries) {
  return itineraries.reduce((sum, itinerary) => sum + countLinksInText(collectItineraryLines(itinerary).join("\n")), 0);
}

function countLinksInText(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s)]+/g);
  return matches ? matches.length : 0;
}

function renderLineNode(line) {
  const callout = getCalloutMeta(line);
  if (callout) {
    const box = document.createElement("div");
    box.className = `callout ${callout.kind}`;

    const label = document.createElement("p");
    label.className = "callout-label";
    label.textContent = callout.label;
    box.appendChild(label);

    const body = document.createElement("p");
    body.className = "callout-body";
    appendInlineRichText(body, callout.body);
    box.appendChild(body);

    return box;
  }

  const p = document.createElement("p");
  appendInlineRichText(p, line);
  return p;
}

function getCalloutMeta(line) {
  const trimmed = String(line || "").trim();
  const match = /^(budget note|important watch-?out|watch-?out|driving note|note|caveat|recommendation)\s*:\s*(.+)$/i.exec(trimmed);
  if (!match) return null;

  const label = match[1].replace(/\s+/g, " ").trim();
  const body = match[2].trim();
  const lower = label.toLowerCase();
  let kind = "info";
  if (lower.includes("watch") || lower.includes("caveat")) kind = "warning";
  if (lower.includes("budget")) kind = "accent";

  return { label, body, kind };
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
      a.textContent = token.displayLabel || token.label;
      a.title = token.href;
      a.className = "inline-link link-chip";
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
      tokens.push({
        type: "link",
        label: next[1],
        displayLabel: truncateLabel(next[1], 42),
        href: next[2]
      });
    } else if (next === urlMatch) {
      tokens.push({
        type: "link",
        label: next[0],
        displayLabel: formatUrlChipLabel(next[0]),
        href: next[0]
      });
    } else if (next === boldMatch) {
      tokens.push({ type: "strong", value: next[1] });
    }

    text = text.slice(index + chunk.length);
  }

  return tokens;
}

function truncateLabel(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatUrlChipLabel(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathPart = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    const compactPath = pathPart ? ` ${truncateLabel(pathPart, 20)}` : "";
    return `${host}${compactPath}`;
  } catch {
    return truncateLabel(url, 42);
  }
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  } catch {
    return "";
  }
}

function splitItineraryTitle(title) {
  const raw = String(title || "").trim();
  if (!raw) return { label: "", heading: "", subtitle: "" };

  const main = /^(Itinerary\s+[A-Za-z0-9]+|Option\s+[A-Za-z0-9]+)\s*[—:-]\s*(.+)$/i.exec(raw);
  if (main) {
    const split = splitSecondary(main[2].trim());
    return { label: main[1], heading: split.heading, subtitle: split.subtitle };
  }

  const split = splitSecondary(raw);
  return { label: "", heading: split.heading, subtitle: split.subtitle };
}

function splitSecondary(value) {
  const separators = [" — ", ": "];
  for (const sep of separators) {
    const idx = value.indexOf(sep);
    if (idx > 0 && idx < value.length - sep.length) {
      return {
        heading: value.slice(0, idx).trim(),
        subtitle: value.slice(idx + sep.length).trim()
      };
    }
  }
  return { heading: value.trim(), subtitle: "" };
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
