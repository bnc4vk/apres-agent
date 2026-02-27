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
  const displayItineraries = parsed.itineraries.map((itinerary, index) => buildDisplayItinerary(itinerary, index));

  formattedResults.appendChild(renderSummaryBar(displayItineraries, meta));

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

    parsed.intro.slice(0, 2).forEach((line) => {
      intro.appendChild(renderLineNode(trimToWords(line, 18)));
    });

    formattedResults.appendChild(intro);
  }

  formattedResults.appendChild(renderCompareStrip(displayItineraries));

  const grid = document.createElement("div");
  grid.className = "card-grid";

  displayItineraries.forEach((itinerary, index) => {
    const card = document.createElement("article");
    card.className = "card itinerary-card";
    card.id = `itinerary-${index + 1}`;

    const titleBlock = document.createElement("div");
    titleBlock.className = "itinerary-title-block";

    const title = document.createElement("h3");
    title.textContent = itinerary.heading;
    titleBlock.appendChild(title);

    if (itinerary.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "itinerary-title-subtitle";
      subtitle.textContent = itinerary.subtitle;
      titleBlock.appendChild(subtitle);
    }

    card.appendChild(titleBlock);

    const atGlance = renderAtGlanceStrip(itinerary);
    if (atGlance) card.appendChild(atGlance);

    if (itinerary.whyThisWorks) {
      const why = document.createElement("p");
      why.className = "itinerary-summary";
      const label = document.createElement("strong");
      label.textContent = "Why this works: ";
      why.appendChild(label);
      appendInlineRichText(why, itinerary.whyThisWorks);
      card.appendChild(why);
    }

    if (itinerary.budgetSnapshot) {
      const snapshot = document.createElement("p");
      snapshot.className = "itinerary-budget-snapshot";
      const label = document.createElement("strong");
      label.textContent = "Budget snapshot: ";
      snapshot.appendChild(label);
      appendInlineRichText(snapshot, itinerary.budgetSnapshot);
      card.appendChild(snapshot);
    }

    const calloutState = { used: false };

    itinerary.sections.forEach((section) => {
      const wrap = document.createElement("section");
      wrap.className = `tile-section ${section.key}`;

      const heading = document.createElement("h4");
      heading.textContent = section.title;
      wrap.appendChild(heading);

      const linkLimiter = { remaining: 2, hidden: 0 };

      section.paragraphs.forEach((line) => {
        wrap.appendChild(renderLineNode(line, { calloutState, linkLimiter }));
      });

      if (section.bullets.length > 0) {
        const ul = document.createElement("ul");
        ul.className = "tile-list";
        section.bullets.forEach((line) => {
          ul.appendChild(renderBulletNode(line, { calloutState, linkLimiter }));
        });
        wrap.appendChild(ul);
      }

      if (linkLimiter.hidden > 0) {
        const more = document.createElement("p");
        more.className = "small-muted";
        more.textContent = `${linkLimiter.hidden} additional link${linkLimiter.hidden === 1 ? "" : "s"} hidden for readability.`;
        wrap.appendChild(more);
      }

      card.appendChild(wrap);
    });

    grid.appendChild(card);
  });

  formattedResults.appendChild(grid);

  if (parsed.tail.length) {
    const tail = document.createElement("div");
    tail.className = "progress-box";

    const title = document.createElement("h2");
    title.textContent = "Additional notes";
    tail.appendChild(title);

    parsed.tail.slice(0, 2).forEach((line) => {
      tail.appendChild(renderLineNode(trimToWords(line, 16)));
    });

    formattedResults.appendChild(tail);
  }
}

function renderSummaryBar(itineraries, meta) {
  const wrap = document.createElement("section");
  wrap.className = "results-summary-strip";

  const title = document.createElement("p");
  title.className = "results-summary-title";
  title.textContent = "Results summary";
  wrap.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "results-summary-subtitle";
  const bits = [`${itineraries.length} trip option${itineraries.length === 1 ? "" : "s"}`];
  if (meta.createdAt) {
    const when = formatDateTime(meta.createdAt);
    if (when) bits.push(`generated ${when}`);
  }
  subtitle.textContent = bits.join(" • ");
  wrap.appendChild(subtitle);

  return wrap;
}

function renderCompareStrip(itineraries) {
  const wrap = document.createElement("section");
  wrap.className = "compare-strip";

  const title = document.createElement("h2");
  title.textContent = "Quick compare";
  wrap.appendChild(title);

  const tableWrap = document.createElement("div");
  tableWrap.className = "compare-matrix-wrap";

  const table = document.createElement("table");
  table.className = "compare-matrix";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const metricHead = document.createElement("th");
  metricHead.scope = "col";
  metricHead.textContent = "Metric";
  headerRow.appendChild(metricHead);

  itineraries.forEach((itinerary, index) => {
    const th = document.createElement("th");
    th.scope = "col";

    const link = document.createElement("a");
    link.href = `#itinerary-${index + 1}`;
    link.className = "compare-head-link";
    link.textContent = itinerary.heading;
    th.appendChild(link);

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const rows = [
    { label: "Budget", key: "budget" },
    { label: "Access", key: "access" },
    { label: "Skill fit", key: "skillFit" },
    { label: "Pass fit", key: "passFit" }
  ];

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const metricCell = document.createElement("th");
    metricCell.scope = "row";
    metricCell.className = "compare-row-label";
    metricCell.textContent = row.label;
    tr.appendChild(metricCell);

    itineraries.forEach((itinerary) => {
      const td = document.createElement("td");
      td.className = "compare-cell";
      td.textContent = standardizeDisplayText(itinerary.compare[row.key]) || "-";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);

  return wrap;
}

function renderAtGlanceStrip(itinerary) {
  const items = [
    { label: "Budget", value: itinerary.compare.budget },
    { label: "Access", value: itinerary.compare.access }
  ].filter((item) => item.value);

  if (!items.length) return null;

  const row = document.createElement("div");
  row.className = "itinerary-at-glance";

  items.forEach((item) => {
    const chip = document.createElement("p");
    chip.className = "glance-item";

    const label = document.createElement("span");
    label.className = "glance-label";
    label.textContent = `${item.label}:`;
    chip.appendChild(label);

    const value = document.createElement("span");
    value.className = "glance-value";
    value.textContent = item.value;
    chip.appendChild(value);

    row.appendChild(chip);
  });

  return row;
}

function buildDisplayItinerary(itinerary, index) {
  const grouped = groupSectionsByIntent(itinerary);
  const compare = extractCompareMetrics(itinerary, grouped);
  const heading = resolveDisplayHeading(itinerary, index, compare);

  const budgetSnapshot = buildBudgetSnapshot(grouped, compare);

  const orderedSections = [
    makeDisplaySection("stay", "Stay + mountain access", grouped.stay),
    makeDisplaySection("ski", "Ski/Ride plan", grouped.ski),
    makeDisplaySection("transport", "Transport + reservations", grouped.transport),
    makeDisplaySection("gear", "Gear rental", grouped.gear),
    makeDisplaySection("watchouts", "Watchouts", grouped.watchouts)
  ].filter(Boolean);

  const whyThisWorks = standardizeDisplayText(itinerary.whyThisWorks);

  return {
    heading,
    subtitle: compactSnippet(splitItineraryTitle(itinerary.title).subtitle, 70),
    whyThisWorks,
    budgetSnapshot,
    compare,
    sections: orderedSections
  };
}

function groupSectionsByIntent(itinerary) {
  const grouped = {
    budget: createBucket(),
    stay: createBucket(),
    ski: createBucket(),
    transport: createBucket(),
    gear: createBucket(),
    watchouts: createBucket(),
    misc: createBucket()
  };

  itinerary.sections.forEach((section) => {
    const sectionLines = [...section.paragraphs, ...section.bullets].map(normalizeSourceLine).filter(Boolean);
    const fallbackKey = classifySectionIntent(section.title, sectionLines);

    section.paragraphs.forEach((line) => {
      routeLineToBucket(grouped, line, false, fallbackKey);
    });

    section.bullets.forEach((line) => {
      routeLineToBucket(grouped, line, true, fallbackKey);
    });
  });

  itinerary.trailingNotes.forEach((line) => {
    routeLineToBucket(grouped, line, false, "watchouts");
  });

  if (grouped.misc.paragraphs.length) {
    appendToBucket(grouped.ski, grouped.misc.paragraphs, []);
  }

  return grouped;
}

function makeDisplaySection(key, title, bucket) {
  if (!bucket) return null;

  const section = condenseBucket(key, bucket);
  if (!section.paragraphs.length && !section.bullets.length) return null;

  if (key === "watchouts") {
    const combined = [...section.paragraphs, ...section.bullets].join(" ").toLowerCase();
    if (!combined || /none worth flagging|none to flag|no major watchouts|none/i.test(combined)) {
      return null;
    }
  }

  return {
    key,
    title,
    paragraphs: section.paragraphs,
    bullets: section.bullets
  };
}

function condenseBucket(key, bucket) {
  const paragraphs = dedupeLines(bucket.paragraphs).map((line) => standardizeDisplayText(line));
  const bullets = dedupeLines(bucket.bullets).map((line) => standardizeDisplayText(line));

  if (key === "ski" || key === "transport") {
    const mergedBullets = bullets.length ? bullets : paragraphs;
    return {
      paragraphs: [],
      bullets: mergedBullets
    };
  }

  const hasNoGearNeeded = [...paragraphs, ...bullets].some((line) => /not needed/i.test(line));
  if (key === "gear" && hasNoGearNeeded) {
    return {
      paragraphs: ["Not needed for this group."],
      bullets: []
    };
  }

  return {
    paragraphs,
    bullets
  };
}

function extractCompareMetrics(itinerary, grouped) {
  const allLines = collectItineraryLines(itinerary);
  const budget = extractBudgetMetric([...grouped.budget.paragraphs, ...grouped.budget.bullets, ...allLines]);
  const access = extractAccessMetric([
    ...grouped.stay.paragraphs,
    ...grouped.stay.bullets,
    ...grouped.transport.paragraphs,
    ...grouped.transport.bullets,
    ...allLines
  ]);
  const skillFit = extractSkillFit(allLines);
  const passFit = extractPassFit(allLines);

  return { budget, access, skillFit, passFit };
}

function buildBudgetSnapshot(grouped, compare) {
  const lines = [...grouped.budget.paragraphs, ...grouped.budget.bullets].map(standardizeDisplayText).filter(Boolean);
  const tradeoff = lines.find((line) => /but|however|trade-?off|cost|premium|save|cheaper|expensive/i.test(line)) || "";
  const parts = [];
  if (compare.budget) parts.push(compare.budget);
  if (tradeoff) parts.push(trimToWords(tradeoff, 12));
  if (!parts.length && lines[0]) parts.push(trimToWords(lines[0], 14));
  return parts.join("; ");
}

function resolveDisplayHeading(itinerary, index, compare) {
  const titleParts = splitItineraryTitle(itinerary.title);
  const candidate = titleParts.heading || itinerary.title || "";
  if (candidate && !isGenericTitle(candidate)) {
    return compactSnippet(candidate, 46);
  }

  const place = extractPlaceSignal(collectItineraryLines(itinerary));
  const tier = inferBudgetTier(compare.budget);
  if (place) return `${place} ${tier}`;
  return `Option ${index + 1} ${tier}`;
}

function isGenericTitle(value) {
  return /^itinerary\s+[a-z0-9]+$/i.test(value.trim()) || /^option\s+[a-z0-9]+$/i.test(value.trim());
}

function inferBudgetTier(budgetMetric) {
  const values = extractDollarValues(budgetMetric);
  if (!values.length) return "plan";
  const max = Math.max(...values);
  if (max <= 1000) return "budget";
  if (max <= 1500) return "balanced";
  return "comfort";
}

function extractPlaceSignal(lines) {
  for (const line of lines) {
    const text = String(line || "");
    const byPrep = /\b(?:in|near|around|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/.exec(text);
    if (byPrep) return byPrep[1];

    const startMatch = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/.exec(text);
    if (startMatch && !/^(Budget|Ski|Ride|Why|Home|Car|Gear|Transport)$/i.test(startMatch[1])) {
      return startMatch[1];
    }
  }
  return "";
}

function classifySectionIntent(title, lines) {
  const text = `${title || ""} ${lines.join(" ")}`.toLowerCase();
  if (/(budget|cost|price|\$)/.test(text)) return "budget";
  if (/(home|stay|lodging|mountain access|walk to lift|condo|hotel|house|base village)/.test(text)) return "stay";
  if (/(parking|transport|car rental|car plan|drive|airport|shuttle|reservation)/.test(text)) return "transport";
  if (/(gear|rental shop|equipment)/.test(text)) return "gear";
  if (/(watchout|watch-out|risk|caveat|warning)/.test(text)) return "watchouts";
  if (/(ski|ride|terrain|day plan|on-mountain|schedule)/.test(text)) return "ski";
  return classifyLineIntent(text) || "ski";
}

function classifyLineIntent(line) {
  const text = String(line || "").toLowerCase();
  if (/(watchout|watch-out|risk|caveat|important)/.test(text)) return "watchouts";
  if (/(budget|cost|price|\$)/.test(text)) return "budget";
  if (/(parking|drive|shuttle|airport|car|reservation)/.test(text)) return "transport";
  if (/(home|stay|lodging|walk to lift|village|condo|hotel|house)/.test(text)) return "stay";
  if (/(gear|rental|demo)/.test(text)) return "gear";
  if (/(ski|ride|terrain|runs)/.test(text)) return "ski";
  return "";
}

function routeLineToBucket(grouped, line, isBullet, fallbackKey) {
  const parsed = splitLabeledLine(line);
  const content = standardizeDisplayText(parsed.content);
  if (!content) return;

  const key = parsed.key || classifyLineIntent(content) || fallbackKey || "ski";
  if (key === "why") return;
  const bucket = grouped[key] || grouped.misc;
  const target = isBullet ? bucket.bullets : bucket.paragraphs;
  pushUnique(target, content);
}

function splitLabeledLine(line) {
  const raw = stripOuterMarkdown(line).replace(/\*\*/g, "").trim();
  if (!raw) return { key: "", content: "" };

  const match =
    /^(why this works|budget snapshot|budget note|home|stay \+ mountain access|ski\/ride plan|parking\/reservations|car rental|transport \+ reservations|gear rental|watchouts?|important watch-?out|watch-?out|driving note|notes?)\s*:\s*(.+)$/i.exec(
      raw
    );
  if (!match) return { key: "", content: raw };

  return {
    key: mapLabelToIntent(match[1]),
    content: match[2].trim()
  };
}

function mapLabelToIntent(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("why this works")) return "why";
  if (text.includes("budget")) return "budget";
  if (text.includes("home") || text.includes("stay")) return "stay";
  if (text.includes("ski/ride")) return "ski";
  if (text.includes("parking") || text.includes("transport") || text.includes("car rental") || text.includes("driving")) {
    return "transport";
  }
  if (text.includes("gear")) return "gear";
  if (text.includes("watch")) return "watchouts";
  return "";
}

function createBucket() {
  return { paragraphs: [], bullets: [] };
}

function appendToBucket(bucket, paragraphs, bullets) {
  paragraphs.filter(Boolean).forEach((line) => pushUnique(bucket.paragraphs, line));
  bullets.filter(Boolean).forEach((line) => pushUnique(bucket.bullets, line));
}

function pushUnique(list, value) {
  const line = String(value || "").trim();
  if (!line) return;
  if (!list.includes(line)) list.push(line);
}

function dedupeLines(lines) {
  const out = [];
  lines.forEach((line) => pushUnique(out, line));
  return out;
}

function normalizeSourceLine(line) {
  return standardizeDisplayText(splitLabeledLine(line).content);
}

function extractBudgetMetric(lines) {
  for (const line of lines) {
    const values = extractDollarValues(line);
    if (values.length >= 2) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      return `$${min.toLocaleString()}-$${max.toLocaleString()} pp`;
    }
    if (values.length === 1) {
      return `$${values[0].toLocaleString()} pp`;
    }
  }
  const fallback = lines.find((line) => /budget|cost|value/i.test(line));
  return fallback ? trimToWords(standardizeDisplayText(fallback), 8) : "";
}

function extractDollarValues(line) {
  const matches = String(line || "").match(/\$\s?\d[\d,]*/g) || [];
  return matches
    .map((raw) => Number(raw.replace(/[^\d]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function extractAccessMetric(lines) {
  for (const line of lines) {
    if (/^budget snapshot/i.test(line)) continue;
    if (/budget|cost|\$/i.test(line) && !/min|minute|walk|drive|shuttle|lift|gondola|base|parking|access/i.test(line)) {
      continue;
    }
    if (!/min|minute|walk|drive|shuttle|lift|gondola|base|parking|access/i.test(line)) continue;
    const standardized = standardizeDisplayText(line);
    const duration = /(\d{1,2}(?:\s*-\s*\d{1,2})?)\s*min\b/i.exec(standardized);
    if (duration && /walk/i.test(standardized)) return `${duration[1]} min walk`;
    if (duration && /drive/i.test(standardized)) return `${duration[1]} min drive`;
    if (duration && /shuttle/i.test(standardized)) return `${duration[1]} min shuttle`;
    return trimToWords(standardized, 8);
  }
  return "";
}

function extractSkillFit(lines) {
  const levels = ["beginner", "intermediate", "advanced", "expert"].filter((level) =>
    lines.some((line) => new RegExp(`\\b${level}\\b`, "i").test(line))
  );
  if (levels.length) return levels.join(" + ");

  const fallback = lines.find((line) => /family|mixed group|all levels|progression/i.test(line));
  return fallback ? trimToWords(fallback, 6) : "Mixed levels";
}

function extractPassFit(lines) {
  const text = lines.join(" ").toLowerCase();
  if (/\bikon\b/.test(text) && /\bepic\b/.test(text)) return "Mixed Ikon/Epic";
  if (/\bikon\b/.test(text)) return "Ikon aligned";
  if (/\bepic\b/.test(text)) return "Epic aligned";
  if (/no pass|without pass|pass not required/.test(text)) return "No pass required";
  return "Pass-flexible";
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
  return lines.map((line) => normalizeSourceLine(line)).filter(Boolean);
}

function renderLineNode(line, options = {}) {
  const value = String(line || "").trim();
  if (!value) return document.createElement("p");

  const callout = getCalloutMeta(value);
  const calloutState = options.calloutState || null;
  const allowHighlight = callout && calloutState && !calloutState.used;

  if (allowHighlight && callout) {
    calloutState.used = true;
    const box = document.createElement("div");
    box.className = `callout ${callout.kind}`;

    const label = document.createElement("p");
    label.className = "callout-label";
    label.textContent = callout.label;
    box.appendChild(label);

    const body = document.createElement("p");
    body.className = "callout-body";
    appendInlineRichText(body, callout.body, { linkLimiter: options.linkLimiter });
    box.appendChild(body);

    return box;
  }

  const p = document.createElement("p");
  const text = callout ? `${callout.label}: ${callout.body}` : value;
  appendInlineRichText(p, text, { linkLimiter: options.linkLimiter });
  return p;
}

function renderBulletNode(line, options = {}) {
  const li = document.createElement("li");
  const value = String(line || "").trim();

  const callout = getCalloutMeta(value);
  const calloutState = options.calloutState || null;
  const allowHighlight = callout && calloutState && !calloutState.used;

  if (allowHighlight && callout) {
    calloutState.used = true;
    li.className = `callout-item ${callout.kind}`;
    appendInlineRichText(li, `${callout.label}: ${callout.body}`, { linkLimiter: options.linkLimiter });
    return li;
  }

  appendInlineRichText(li, callout ? `${callout.label}: ${callout.body}` : value, {
    linkLimiter: options.linkLimiter
  });

  return li;
}

function getCalloutMeta(line) {
  const trimmed = String(line || "").trim();
  const match = /^(budget note|important watch-?out|watch-?out|driving note|note|caveat|recommendation|watchouts?)\s*:\s*(.+)$/i.exec(
    trimmed
  );
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

    if (/^(budget note|important watch-out|watch-out|driving note|watchouts?)\s*:/i.test(line)) {
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

function appendInlineRichText(node, text, options = {}) {
  const tokens = tokenizeInlineMarkdown(text);
  if (!tokens.length) {
    node.textContent = text;
    return;
  }

  const linkLimiter = options.linkLimiter || null;

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
      if (linkLimiter && linkLimiter.remaining <= 0) {
        linkLimiter.hidden += 1;
        continue;
      }

      if (linkLimiter) linkLimiter.remaining -= 1;

      const a = document.createElement("a");
      a.href = token.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = token.displayLabel || token.label;
      a.title = token.href;
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
      tokens.push({
        type: "link",
        label: next[1],
        displayLabel: truncateLabel(next[1], 30),
        href: next[2]
      });
    } else if (next === urlMatch) {
      tokens.push({
        type: "link",
        label: next[0],
        displayLabel: formatUrlInlineLabel(next[0]),
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

function formatUrlInlineLabel(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathPart = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    const compactPath = pathPart ? `/${truncateLabel(pathPart.replace(/^\//, ""), 14)}` : "";
    return `${host}${compactPath}`;
  } catch {
    return truncateLabel(url, 30);
  }
}

function standardizeDisplayText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/\$\s*(\d[\d,]*)\s*(?:to|-)\s*\$\s*(\d[\d,]*)/gi, (_m, a, b) => `$${a}-$${b}`)
    .replace(/\bminutes?\b/gi, "min")
    .replace(/\bper person\b/gi, "pp")
    .trim();
}

function firstSentence(value) {
  const text = standardizeDisplayText(value);
  if (!text) return "";
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1].trim() : text;
}

function trimToWords(value, maxWords) {
  const text = standardizeDisplayText(value);
  if (!text) return "";
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  let clipped = words.slice(0, maxWords).join(" ");
  const danglingUrl = clipped.lastIndexOf("http");
  if (danglingUrl >= 0 && !/\s/.test(clipped.slice(danglingUrl))) {
    clipped = clipped.slice(0, danglingUrl).trim();
  }

  return `${clipped}…`;
}

function compactSnippet(line, max = 108) {
  const text = standardizeDisplayText(line);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
