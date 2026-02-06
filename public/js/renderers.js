const fieldLabels = {
  dates: "Dates",
  group_size: "Group size",
  skill_levels: "Skill levels",
  gear_rental: "Gear rentals",
  budget: "Budget",
  passes: "Pass ownership",
  travel_restrictions: "Travel restrictions",
  location_input: "Location",
  traveler_pods: "Departure pods"
};

export function createRenderer({ chat, actions, input, newChatBtn, sendBtn, pageSubhead, onExpand, onExport }) {
  function addMessage(role, content) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${role}`;
    if (role === "assistant") {
      bubble.append(parseMessageWithLinks(content));
    } else {
      bubble.textContent = content;
    }
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
    return bubble;
  }

  function renderMessages(messages) {
    chat.innerHTML = "";
    messages.forEach((message) => addMessage(message.role, message.content));
  }

  function addTypingIndicator() {
    const bubble = document.createElement("div");
    bubble.className = "bubble assistant typing";
    bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
    return bubble;
  }

  function setFormEnabled(enabled) {
    input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
    if (newChatBtn) newChatBtn.disabled = !enabled;
  }

  function updateInputHint(state) {
    const missing = state.tripSpec?.status?.missingFields ?? [];
    if (!Array.isArray(missing) || missing.length === 0) {
      input.placeholder = "Ask for itinerary tweaks or say: start a new trip";
      return;
    }

    const next = fieldLabels[missing[0]] ?? missing[0];
    input.placeholder = `Share ${next.toLowerCase()}...`;
  }

  function updateHeaderCta(state) {
    if (!newChatBtn || !sendBtn) return;
    const hasFinal = Boolean(state.decisionPackage);
    newChatBtn.classList.toggle("visible", hasFinal);
    newChatBtn.tabIndex = hasFinal ? 0 : -1;
    newChatBtn.setAttribute("aria-hidden", hasFinal ? "false" : "true");

    sendBtn.textContent = hasFinal ? "Refine" : "Send";
    if (pageSubhead) {
      pageSubhead.textContent = hasFinal
        ? "Itinerary ready. Ask for adjustments or start a new trip."
        : "Share what you know. I can make assumptions when details are sparse.";
    }
  }

  function renderActions(state) {
    actions.innerHTML = "";
    const checklist = renderChecklist(state.tripSpec);
    if (checklist) actions.appendChild(checklist);
    if (!state.decisionPackage) return;

    const summary = renderBudgetSummary(state.decisionPackage?.budgetSummary);
    if (summary) actions.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "card-grid";

    (state.decisionPackage.itineraries ?? []).forEach((itinerary) => {
      const card = document.createElement("div");
      card.className = "card";

      const title = document.createElement("h3");
      title.textContent = itinerary.title;

      const summaryCopy = document.createElement("p");
      summaryCopy.textContent = itinerary.summary;

      const budget = document.createElement("p");
      const est = itinerary.budgetEstimate?.perPersonTotal;
      const feasible = itinerary.budgetEstimate?.feasible;
      if (typeof est === "number") {
        budget.textContent = `Trip est.: ~$${est} pp ${feasible === false ? "(over target)" : ""}`;
      } else if (itinerary.lodgingBudgetPerPerson) {
        budget.textContent = `Lodging target: ~$${itinerary.lodgingBudgetPerPerson} pp`;
      } else {
        budget.textContent = "Budget target: flexible";
      }

      const links = renderLinkRow(itinerary.researchLinks);

      const button = document.createElement("button");
      button.textContent = "Expand";
      button.className = "ghost-btn";
      button.addEventListener("click", () => onExpand(itinerary.id));

      card.append(title, summaryCopy, budget, links, button);
      grid.appendChild(card);
    });

    actions.appendChild(grid);
    actions.appendChild(renderExportRow(state));
  }

  function appendGoogleBlockedMessage(reason) {
    const suffix =
      reason === "access_denied"
        ? "Google returned access_denied for this account."
        : "Google OAuth is not enabled for this account in the current app setup.";
    addMessage(
      "assistant",
      `Google account linking is currently blocked. ${suffix} Ask the developer to add your account as a test user or publish verification before exporting to Sheets.`
    );
  }

  return {
    addMessage,
    renderMessages,
    addTypingIndicator,
    setFormEnabled,
    updateInputHint,
    updateHeaderCta,
    renderActions,
    appendGoogleBlockedMessage
  };

  function renderChecklist(tripSpec) {
    const missing = tripSpec?.status?.missingFields ?? [];
    if (!Array.isArray(missing) || missing.length === 0) return null;

    const box = document.createElement("div");
    box.className = "progress-box";

    const title = document.createElement("h2");
    title.textContent = "Still needed";

    const list = document.createElement("p");
    list.textContent = missing.slice(0, 4).map((field) => fieldLabels[field] ?? field).join(" • ");

    box.append(title, list);
    return box;
  }

  function renderBudgetSummary(summary) {
    if (!summary) return null;
    const box = document.createElement("div");
    box.className = "budget-box";

    const title = document.createElement("h2");
    title.textContent = "Budget reality check";

    const body = document.createElement("p");
    body.textContent = summary.summaryLine;

    box.append(title, body);
    return box;
  }

  function renderLinkRow(researchLinks) {
    const wrap = document.createElement("div");
    wrap.className = "link-row";
    if (!researchLinks) return wrap;

    const entries = [
      { label: "Lodging", href: researchLinks.lodgingSearch },
      { label: "Gear", href: researchLinks.gearSearch },
      { label: "Grocery", href: researchLinks.grocerySearch },
      { label: "Takeout", href: researchLinks.takeoutSearch },
      { label: "Cars", href: researchLinks.carRentalCompare }
    ].filter((entry) => Boolean(entry.href));

    entries.forEach((entry) => {
      const link = document.createElement("a");
      link.href = entry.href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = entry.label;
      wrap.appendChild(link);
    });

    return wrap;
  }

  function renderExportRow(state) {
    const exportWrap = document.createElement("div");
    exportWrap.className = "export-row";

    if (state.sheetUrl) {
      const link = document.createElement("a");
      link.href = state.sheetUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "sheet-link";
      link.textContent = "Open shared sheet";
      exportWrap.appendChild(link);
      return exportWrap;
    }

    const button = document.createElement("button");
    button.className = "primary-btn";
    button.textContent = state.googleLinked ? "Export to Google Sheets" : "Link Google to export";
    button.addEventListener("click", onExport);
    exportWrap.appendChild(button);
    return exportWrap;
  }
}

function parseMessageWithLinks(content) {
  const fragment = document.createDocumentFragment();
  const urlRegex = /https?:\/\/[^\s)]+/g;
  let last = 0;
  let match;

  while ((match = urlRegex.exec(content))) {
    if (match.index > last) {
      fragment.appendChild(document.createTextNode(content.slice(last, match.index)));
    }

    const href = match[0];
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = shortenUrl(href);
    link.className = "inline-link";
    fragment.appendChild(link);
    last = match.index + href.length;
  }

  if (last < content.length) {
    fragment.appendChild(document.createTextNode(content.slice(last)));
  }
  return fragment;
}

function shortenUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}
