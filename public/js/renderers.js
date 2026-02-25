export function createRenderer({
  chat,
  actions,
  input,
  newChatBtn,
  sendBtn,
  pageSubhead,
  onExpand,
  onExport,
  onRefresh,
  onLock,
  onBootstrapSplitwise,
  onBootstrapChat,
  onRecompute,
  onWorkflowActions,
  onExportSnapshot,
  onValidateLinks,
  onRefreshOperations,
  onRefreshOperationsLive,
  onSyncCalendar,
  onExportCalendarIcs,
  onPreviewSplitwisePlan,
  onSendReminders,
  onApplyTemplate,
  fieldLabels = {},
  focusMode = false
}) {
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
    const workflow = state.decisionPackage.workflow || null;

    const summary = renderBudgetSummary(state.decisionPackage?.budgetSummary);
    if (summary) actions.appendChild(summary);

    const aiReview = renderAiReviewSummary(state.decisionPackage);
    if (aiReview) actions.appendChild(aiReview);

    const controls = renderControlRow(state);
    if (controls) actions.appendChild(controls);

    const matrix = renderDecisionMatrix(state.decisionPackage?.decisionMatrix);
    if (matrix) actions.appendChild(matrix);

    const grid = document.createElement("div");
    grid.className = "card-grid";

    const itineraries = state.decisionPackage.itineraries ?? [];
    if (itineraries.length === 0) {
      grid.appendChild(renderNoItineraryState(state));
    }

    itineraries.forEach((itinerary) => {
      const itineraryAudit =
        workflow?.itineraryAudit?.find((item) => item.itineraryId === itinerary.id) ?? null;
      const card = document.createElement("div");
      card.className = "card itinerary-card";

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
      const linksHint = document.createElement("p");
      linksHint.className = "small-muted";
      linksHint.textContent = "Planning links (open in new tabs):";
      const source = document.createElement("p");
      source.className = "source-line";
      const lodgingSource = itinerary.liveOptions?.lodging?.[0]?.sourceMeta?.source ?? "estimated";
      const carPlanningRequested =
        state.tripSpec?.travel?.noFlying !== true && Boolean(state.tripSpec?.travel?.arrivalAirport);
      const carSource = carPlanningRequested
        ? itinerary.liveOptions?.cars?.[0]?.sourceMeta?.source ?? "estimated"
        : "n/a";
      source.textContent = `Sources: lodging ${lodgingSource}, cars ${carSource}`;

      const topLodging = itinerary.liveOptions?.lodging?.[0];
      const liveBlurb = document.createElement("p");
      liveBlurb.className = "small-muted";
      liveBlurb.textContent = topLodging
        ? `Top stay: ${topLodging.name} ~$${
            topLodging.groupNightlyTotalUsd ?? topLodging.nightlyRateUsd
          }/night (${formatLodgingCapacity(topLodging)})`
        : "Top stay: use Lodging link to fetch current inventory.";

      const costBreakdown = renderCostBreakdown(itinerary.budgetEstimate);
      const auditBadges = renderItineraryAuditBadges(itineraryAudit);
      const aiCardReview = renderItineraryAiReview(itinerary.aiReview);
      const commentThread = renderCommentThread(workflow, "itinerary", itinerary.id);
      const lodgingOptions = renderLodgingOptions(itinerary.liveOptions?.lodging, itinerary.researchLinks);

      const button = document.createElement("button");
      button.textContent = "Expand";
      button.className = "ghost-btn";
      button.addEventListener("click", () => onExpand(itinerary.id));

      const lockBtn = document.createElement("button");
      lockBtn.textContent = "Lock + Recompute";
      lockBtn.className = "ghost-btn";
      lockBtn.addEventListener("click", () => onLock(itinerary));

      const actionRow = document.createElement("div");
      actionRow.className = "card-actions";
      actionRow.append(button, lockBtn);

      const voteBtn = document.createElement("button");
      voteBtn.textContent = "Vote Resort";
      voteBtn.className = "ghost-btn";
      voteBtn.addEventListener("click", () =>
        onWorkflowActions?.(
          [{ type: "vote_cast", voteType: "final_resort_vote", choice: itinerary.resortName }],
          `Voted for ${itinerary.resortName}.`
        )
      );

      const commentBtn = document.createElement("button");
      commentBtn.textContent = "Comment";
      commentBtn.className = "ghost-btn";
      commentBtn.addEventListener("click", () => {
        const message = window.prompt(`Comment on ${itinerary.resortName}:`);
        if (!message) return;
        onWorkflowActions?.(
          [{ type: "comment_add", targetType: "itinerary", targetId: itinerary.id, message }],
          "Added itinerary comment."
        );
      });

      const lockLodgingBtn = document.createElement("button");
      lockLodgingBtn.textContent = "Lock Lodging";
      lockLodgingBtn.className = "ghost-btn";
      lockLodgingBtn.addEventListener("click", () => {
        const lodgingName = topLodging?.name || "Preferred lodging";
        onWorkflowActions?.(
          [{ type: "decision_lock", decisionType: "lodging", value: `${itinerary.resortName}: ${lodgingName}` }],
          `Locked lodging for ${itinerary.resortName}.`
        );
      });
      actionRow.append(voteBtn, commentBtn, lockLodgingBtn);

      card.append(
        title,
        summaryCopy,
        budget,
        auditBadges,
        source,
        costBreakdown,
        aiCardReview,
        commentThread,
        liveBlurb,
        lodgingOptions,
        linksHint,
        links,
        actionRow
      );
      grid.appendChild(card);
    });

    actions.appendChild(grid);
    actions.appendChild(renderExportRow(state));

    const advancedNodes = [
      renderWorkflowStageRail(workflow),
      renderBookingReadiness(workflow),
      renderAssumptionQueue(workflow),
      renderCoordinationPanel(state),
      renderRepeatabilityPanel(state),
      renderIntegrationsPanel(state),
      renderOperationsPanel(state)
    ].filter(Boolean);

    if (advancedNodes.length > 0) {
      if (focusMode) {
        actions.appendChild(renderAdvancedDisclosure(advancedNodes));
      } else {
        advancedNodes.forEach((node) => actions.appendChild(node));
      }
    }
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

  function renderNoItineraryState(state) {
    const card = document.createElement("div");
    card.className = "card itinerary-empty-state";

    const title = document.createElement("h3");
    title.textContent = "No itinerary matches yet";

    const body = document.createElement("p");
    body.textContent =
      "No candidate resorts matched the current filters and constraints. This often happens with very specific location text or hard lodging requirements.";

    const hint = document.createElement("p");
    hint.className = "small-muted";
    hint.textContent =
      "Try broadening the destination region, switching lodging constraints to soft preferences, or increasing budget.";

    const specLine = document.createElement("p");
    specLine.className = "small-muted";
    const region = state.tripSpec?.location?.region || "any region";
    const mode = state.tripSpec?.lodgingConstraints?.constraintMode || "none";
    specLine.textContent = `Current filters: region ${region} • lodging constraints ${mode}`;

    card.append(title, body, hint, specLine);
    return card;
  }

  function renderAdvancedDisclosure(nodes) {
    const wrap = document.createElement("details");
    wrap.className = "advanced-disclosure";

    const summary = document.createElement("summary");
    summary.textContent = "Advanced planning operations";

    const body = document.createElement("div");
    body.className = "advanced-disclosure-body";
    nodes.forEach((node) => body.appendChild(node));

    wrap.append(summary, body);
    return wrap;
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

  function renderAiReviewSummary(decisionPackage) {
    const review = decisionPackage?.aiReview;
    if (!review) return null;
    const box = document.createElement("div");
    box.className = "budget-box";

    const title = document.createElement("h2");
    title.textContent = "AI trip review";

    const body = document.createElement("p");
    body.textContent = review.summary;

    const method = document.createElement("p");
    method.className = "small-muted";
    method.textContent = review.methodology;

    box.append(title, body, method);
    (review.caveats || []).slice(0, 2).forEach((caveat) => {
      const line = document.createElement("p");
      line.className = "small-muted";
      line.textContent = `Caveat: ${caveat}`;
      box.appendChild(line);
    });
    return box;
  }

  function renderControlRow(state) {
    if (!state.decisionPackage) return null;
    const row = document.createElement("div");
    row.className = "export-row";

    const refresh = document.createElement("button");
    refresh.className = "ghost-btn";
    refresh.textContent = "Refresh Live Options";
    refresh.addEventListener("click", onRefresh);

    const splitwise = document.createElement("button");
    splitwise.className = "ghost-btn";
    splitwise.textContent = "Bootstrap Splitwise";
    splitwise.addEventListener("click", onBootstrapSplitwise);

    const chatBtn = document.createElement("button");
    chatBtn.className = "ghost-btn";
    chatBtn.textContent = "Bootstrap Group Chat";
    chatBtn.addEventListener("click", onBootstrapChat);

    const recomputeSame = document.createElement("button");
    recomputeSame.className = "ghost-btn";
    recomputeSame.textContent = "Recompute (Same Snapshot)";
    recomputeSame.addEventListener("click", () => onRecompute?.("same_snapshot"));

    const recomputeLive = document.createElement("button");
    recomputeLive.className = "ghost-btn";
    recomputeLive.textContent = "Recompute (Refresh Live)";
    recomputeLive.addEventListener("click", () => onRecompute?.("refresh_live"));

    const checkLinks = document.createElement("button");
    checkLinks.className = "ghost-btn";
    checkLinks.textContent = "Check Links";
    checkLinks.addEventListener("click", onValidateLinks);

    const refreshOps = document.createElement("button");
    refreshOps.className = "ghost-btn";
    refreshOps.textContent = "Refresh Ops Checks";
    refreshOps.addEventListener("click", onRefreshOperations);

    const refreshOpsLive = document.createElement("button");
    refreshOpsLive.className = "ghost-btn";
    refreshOpsLive.textContent = "Live Ops Refresh";
    refreshOpsLive.addEventListener("click", onRefreshOperationsLive || onRefreshOperations);

    const snapshot = document.createElement("button");
    snapshot.className = "ghost-btn";
    snapshot.textContent = "Export Snapshot";
    snapshot.addEventListener("click", onExportSnapshot);

    const calendarSync = document.createElement("button");
    calendarSync.className = "ghost-btn";
    calendarSync.textContent = "Sync Calendar";
    calendarSync.addEventListener("click", onSyncCalendar);

    const calendarIcs = document.createElement("button");
    calendarIcs.className = "ghost-btn";
    calendarIcs.textContent = "Export Calendar ICS";
    calendarIcs.addEventListener("click", onExportCalendarIcs);

    const splitwisePlan = document.createElement("button");
    splitwisePlan.className = "ghost-btn";
    splitwisePlan.textContent = "Splitwise Plan";
    splitwisePlan.addEventListener("click", onPreviewSplitwisePlan);

    const sendReminders = document.createElement("button");
    sendReminders.className = "ghost-btn";
    sendReminders.textContent = "Send Reminders";
    sendReminders.addEventListener("click", onSendReminders);

    row.append(
      refresh,
      recomputeSame,
      recomputeLive,
      checkLinks,
      refreshOps,
      refreshOpsLive,
      snapshot,
      calendarSync,
      calendarIcs,
      splitwisePlan,
      sendReminders,
      splitwise,
      chatBtn
    );
    return row;
  }

  function renderWorkflowStageRail(workflow) {
    if (!workflow?.stages?.length) return null;
    const box = document.createElement("div");
    box.className = "card workflow-stage-rail";
    const title = document.createElement("h3");
    title.textContent = "Workflow Spine";
    box.appendChild(title);

    const current = document.createElement("p");
    current.className = "small-muted";
    current.textContent = `Current stage: ${labelize(workflow.currentStage)}`;
    box.appendChild(current);

    const rail = document.createElement("div");
    rail.className = "stage-rail";
    workflow.stages.forEach((stage) => {
      const pill = document.createElement("div");
      pill.className = `stage-pill ${stage.status}`;
      pill.innerHTML = `<strong>${stage.label}</strong><span>${stage.status.replace("_", " ")}</span>`;
      if (Array.isArray(stage.blockers) && stage.blockers.length) {
        pill.title = stage.blockers.join("\n");
      }
      rail.appendChild(pill);
    });
    box.appendChild(rail);
    return box;
  }

  function renderBookingReadiness(workflow) {
    if (!workflow?.bookingReadiness) return null;
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Booking Readiness";
    box.appendChild(title);

    const summary = document.createElement("p");
    summary.className = "small-muted";
    summary.textContent = workflow.bookingReadiness.ready
      ? "Booking-ready: all required checklist items are complete."
      : `${workflow.bookingReadiness.remainingCount} checklist item(s) remaining before booking-ready.`;
    box.appendChild(summary);

    const list = document.createElement("div");
    list.className = "workflow-list";
    (workflow.bookingReadiness.items || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = `workflow-list-row ${item.done ? "done" : "todo"}`;
      row.innerHTML = `<span>${item.done ? "✓" : "•"} ${item.label}</span><span>${item.detail || (item.done ? "Done" : "Open")}</span>`;
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function renderAssumptionQueue(workflow) {
    if (!workflow?.assumptions?.queue?.length) return null;
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Assumption Review Queue";
    box.appendChild(title);
    const subtitle = document.createElement("p");
    subtitle.className = "small-muted";
    subtitle.textContent = `Pending ${workflow.assumptions.counts?.pending ?? 0} • Accepted ${workflow.assumptions.counts?.accepted ?? 0} • Dismissed ${workflow.assumptions.counts?.dismissed ?? 0}`;
    box.appendChild(subtitle);

    const rows = document.createElement("div");
    rows.className = "workflow-list";
    workflow.assumptions.queue.slice(0, 8).forEach((item) => {
      const row = document.createElement("div");
      row.className = "workflow-queue-item";
      const text = document.createElement("div");
      text.innerHTML = `<strong>${item.label}</strong><div class="small-muted">${item.summary}</div>`;
      const controls = document.createElement("div");
      controls.className = "mini-actions";
      const accept = miniAction("Accept", () =>
        onWorkflowActions?.([{ type: "assumption_review", itemId: item.id, status: "accepted" }], "Assumption marked accepted.")
      );
      const dismiss = miniAction("Dismiss", () =>
        onWorkflowActions?.([{ type: "assumption_review", itemId: item.id, status: "dismissed" }], "Assumption dismissed.")
      );
      controls.append(accept, dismiss);
      row.append(text, controls);
      rows.appendChild(row);
    });
    box.appendChild(rows);
    return box;
  }

  function renderCoordinationPanel(state) {
    const workflow = state.decisionPackage?.workflow;
    if (!workflow) return null;
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Coordination";
    box.appendChild(title);

    const roles = document.createElement("p");
    roles.className = "small-muted";
    roles.textContent = `Roles: ${(workflow.coordination.roles || [])
      .map((role) => `${role.displayName} (${labelize(role.role)})`)
      .join(" • ")}`;
    box.appendChild(roles);

    const roleButton = document.createElement("button");
    roleButton.className = "ghost-btn";
    roleButton.textContent = "Assign Role";
    roleButton.addEventListener("click", () => {
      const userId = window.prompt("User ID (example: member_2)");
      if (!userId) return;
      const role = window.prompt("Role: planner_admin | member | approver", "member");
      if (!role) return;
      onWorkflowActions?.([{ type: "role_upsert", userId, role }], "Role updated.");
    });
    box.appendChild(roleButton);

    const votesWrap = document.createElement("div");
    votesWrap.className = "workflow-list";
    (workflow.coordination.votes || []).forEach((vote) => {
      const row = document.createElement("div");
      row.className = "workflow-queue-item";
      const winner = vote.winner ? ` • leader: ${vote.winner}` : "";
      row.innerHTML = `<div><strong>${vote.title}</strong><div class="small-muted">${vote.status}${winner} • ${vote.ballots?.length || 0} vote(s)</div></div>`;
      const actions = document.createElement("div");
      actions.className = "mini-actions";
      if (vote.options?.length) {
        const cast = miniAction("Vote", () => {
          const choice = window.prompt(`${vote.title} choice:\n${vote.options.join("\n")}`, vote.options[0] || "");
          if (!choice) return;
          onWorkflowActions?.([{ type: "vote_cast", voteType: vote.type, choice }], `Vote recorded for ${vote.title}.`);
        });
        actions.appendChild(cast);
      }
      const close = miniAction("Close", () =>
        onWorkflowActions?.([{ type: "vote_close", voteType: vote.type }], `${vote.title} closed.`)
      );
      actions.appendChild(close);
      row.appendChild(actions);
      votesWrap.appendChild(row);
    });
    box.appendChild(votesWrap);

    const taskTitle = document.createElement("p");
    taskTitle.className = "small-muted";
    taskTitle.textContent = "Critical booking tasks (owner + due date required):";
    box.appendChild(taskTitle);
    box.appendChild(renderTaskList(workflow));
    return box;
  }

  function renderTaskList(workflow) {
    const list = document.createElement("div");
    list.className = "workflow-list";
    (workflow.coordination.tasks || []).slice(0, 8).forEach((task) => {
      const row = document.createElement("div");
      row.className = "workflow-queue-item";
      const thread = renderCommentThread(workflow, "task", task.id);
      const left = document.createElement("div");
      left.innerHTML = `<strong>${task.title}</strong><div class="small-muted">${task.status} • owner ${task.owner || "TBD"} • due ${task.dueDate || "TBD"} • reminder ${task.reminderDaysBefore}d</div>`;
      const actions = document.createElement("div");
      actions.className = "mini-actions";
      actions.append(
        miniAction("Assign", () => {
          const owner = window.prompt(`Owner for "${task.title}"`, task.owner || "");
          if (owner === null) return;
          onWorkflowActions?.([{ type: "task_patch", taskId: task.id, owner }], "Task owner updated.");
        }),
        miniAction("Due", () => {
          const dueDate = window.prompt(`Due date YYYY-MM-DD for "${task.title}"`, task.dueDate || "");
          if (dueDate === null) return;
          onWorkflowActions?.([{ type: "task_patch", taskId: task.id, dueDate: dueDate || null }], "Task due date updated.");
        }),
        miniAction(task.status === "done" ? "Reopen" : "Done", () =>
          onWorkflowActions?.(
            [{ type: "task_patch", taskId: task.id, status: task.status === "done" ? "todo" : "done" }],
            `Task "${task.title}" updated.`
          )
        ),
        miniAction("Comment", () => {
          const message = window.prompt(`Comment on task "${task.title}"`);
          if (!message) return;
          onWorkflowActions?.([{ type: "comment_add", targetType: "task", targetId: task.id, message }], "Task comment added.");
        })
      );
      row.append(left, actions);
      list.appendChild(row);
      if (thread.childNodes.length) list.appendChild(thread);
    });
    return list;
  }

  function renderRepeatabilityPanel(state) {
    const workflow = state.decisionPackage?.workflow;
    if (!workflow) return null;
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Repeatability + Auditability";
    box.appendChild(title);

    const runs = workflow.repeatability?.runs || [];
    const latest = runs[runs.length - 1];
    const runLine = document.createElement("p");
    runLine.className = "small-muted";
    runLine.textContent = latest
      ? `Latest run ${latest.runId} • ${latest.trigger} • ${latest.llmProfile}/${latest.llmModel} • snapshot ${latest.dataSnapshotDigest}`
      : "No run metadata yet.";
    box.appendChild(runLine);

    if (workflow.repeatability?.latestDiff) {
      const diff = document.createElement("p");
      diff.className = "small-muted";
      diff.textContent = workflow.repeatability.latestDiff.summary;
      box.appendChild(diff);
    }

    const templateRow = document.createElement("div");
    templateRow.className = "link-row";
    (workflow.repeatability.templates || []).forEach((template) => {
      const btn = document.createElement("button");
      btn.className = "ghost-btn";
      btn.textContent = template.name;
      btn.addEventListener("click", () => {
        if (window.confirm(`Apply template "${template.name}" to this trip spec?`)) onApplyTemplate?.(template);
      });
      templateRow.appendChild(btn);
    });
    box.appendChild(templateRow);
    return box;
  }

  function renderIntegrationsPanel(state) {
    const workflow = state.decisionPackage?.workflow;
    if (!workflow) return null;
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Integration Hardening";
    box.appendChild(title);

    const linkHealth = workflow.integrations?.linkHealth;
    const broken = (linkHealth?.records || []).filter((r) => r.status === "broken").length;
    const warn = (linkHealth?.records || []).filter((r) => r.status === "warning").length;
    const line = document.createElement("p");
    line.className = "small-muted";
    line.textContent = `Link health: checked ${linkHealth?.lastCheckedAt || "never"} • broken ${broken} • warnings ${warn}`;
    box.appendChild(line);

    const calendarLine = document.createElement("p");
    calendarLine.className = "small-muted";
    calendarLine.textContent = `Calendar: ${workflow.integrations?.calendarDraft?.lastSyncSummary || "No sync/export yet."}`;
    box.appendChild(calendarLine);

    const reminderLine = document.createElement("p");
    reminderLine.className = "small-muted";
    reminderLine.textContent = `Messaging: last dispatch ${workflow.integrations?.messaging?.lastDispatchAt || "never"} • history ${(workflow.integrations?.messaging?.dispatchHistory || []).length}`;
    box.appendChild(reminderLine);

    const splitwiseLine = document.createElement("p");
    splitwiseLine.className = "small-muted";
    splitwiseLine.textContent = `Splitwise planning: ${(workflow.integrations?.splitwise?.plannedExpenses || []).length} planned expense rows`;
    box.appendChild(splitwiseLine);

    const sheets = document.createElement("p");
    sheets.className = "small-muted";
    sheets.textContent = `Sheets stable columns: ${(workflow.integrations?.sheets?.stableColumns || []).join(", ")}`;
    box.appendChild(sheets);

    const calendar = document.createElement("p");
    calendar.className = "small-muted";
    calendar.textContent = `Calendar draft events: ${workflow.integrations?.calendarDraft?.events?.length || 0}`;
    box.appendChild(calendar);

    const messaging = document.createElement("div");
    messaging.className = "workflow-list";
    (workflow.integrations?.messaging?.reminderNudges || []).slice(0, 4).forEach((nudge) => {
      const row = document.createElement("div");
      row.className = "workflow-list-row";
      row.innerHTML = `<span>${nudge.kind}</span><span>${nudge.message}</span>`;
      messaging.appendChild(row);
    });
    box.appendChild(messaging);
    return box;
  }

  function renderOperationsPanel(state) {
    const workflow = state.decisionPackage?.workflow;
    if (!workflow) return null;
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Operational Intelligence";
    box.appendChild(title);

    const score = document.createElement("p");
    score.className = "small-muted";
    score.textContent = `Trip week readiness: ${workflow.operations?.tripWeekReadinessScore ?? 0}%`;
    box.appendChild(score);

    const list = document.createElement("div");
    list.className = "workflow-list";
    (workflow.operations?.checks || []).forEach((check) => {
      const row = document.createElement("div");
      row.className = `workflow-list-row ${check.status}`;
      row.innerHTML = `<span>${check.label}</span><span>${check.status}</span>`;
      row.title = check.summary;
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  function renderDecisionMatrix(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const wrap = document.createElement("div");
    wrap.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Decision matrix";
    wrap.appendChild(title);

    const caption = document.createElement("p");
    caption.className = "small-muted";
    caption.textContent = "Overall = 32% budget + 20% pass + 20% snow/skill + 18% lodging + 10% travel.";
    wrap.appendChild(caption);

    const scroll = document.createElement("div");
    scroll.className = "matrix-scroll";

    const table = document.createElement("table");
    table.className = "matrix-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Resort</th>
          <th>Total pp</th>
          <th>Overall</th>
          <th>Budget</th>
          <th>Pass</th>
          <th>Snow+Skill</th>
          <th>Lodging</th>
          <th>Travel</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (row.locked) tr.classList.add("locked");
      tr.title = [
        row.details?.overall,
        row.details?.budget,
        row.details?.pass,
        row.details?.snowSkill,
        row.details?.lodging,
        row.details?.travel
      ]
        .filter(Boolean)
        .join("\n");
      tr.innerHTML = `
        <td>${row.resortName}${row.locked ? " (locked)" : ""}</td>
        <td>${typeof row.totalCostPerPerson === "number" ? `$${row.totalCostPerPerson}` : "-"}</td>
        <td>${scoreLabel(row.overallScore)}</td>
        <td>${scoreLabel(row.budgetFitScore)}</td>
        <td>${scoreLabel(row.passFitScore)}</td>
        <td>${scoreLabel(row.snowSkillScore)}</td>
        <td>${scoreLabel(row.lodgingFitScore)}</td>
        <td>${scoreLabel(row.travelFitScore)}</td>
      `;
      tbody?.appendChild(tr);
    });

    scroll.appendChild(table);
    wrap.appendChild(scroll);

    const detailList = document.createElement("div");
    detailList.className = "matrix-rationale";
    rows.forEach((row) => {
      const line = document.createElement("p");
      line.className = "small-muted";
      line.textContent = `${row.resortName}: ${row.details?.budget ?? ""} ${row.details?.pass ?? ""} ${row.details?.lodging ?? ""}`;
      detailList.appendChild(line);
    });
    wrap.appendChild(detailList);
    return wrap;
  }

  function renderItineraryAuditBadges(audit) {
    const wrap = document.createElement("div");
    wrap.className = "badge-row";
    if (!audit) return wrap;

    const freshness = document.createElement("span");
    freshness.className = `badge freshness ${audit.sourceFreshness?.overall || "unknown"}`;
    freshness.textContent = audit.sourceFreshness?.overallLabel || "Source freshness unknown";
    wrap.appendChild(freshness);

    (audit.confirmedTags || []).slice(0, 3).forEach((tag) => {
      const el = document.createElement("span");
      el.className = "badge confirmed";
      el.textContent = tag;
      wrap.appendChild(el);
    });
    (audit.assumptionTags || []).slice(0, 3).forEach((tag) => {
      const el = document.createElement("span");
      el.className = "badge assumed";
      el.textContent = tag;
      wrap.appendChild(el);
    });
    return wrap;
  }

  function renderCommentThread(workflow, targetType, targetId) {
    const wrap = document.createElement("div");
    wrap.className = "comment-thread";
    const comments = (workflow?.coordination?.comments || []).filter(
      (comment) => comment.targetType === targetType && comment.targetId === targetId
    );
    comments.slice(-2).forEach((comment) => {
      const line = document.createElement("p");
      line.className = "small-muted";
      line.textContent = `${comment.author}: ${comment.message}`;
      wrap.appendChild(line);
    });
    return wrap;
  }

  function miniAction(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-btn mini";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderLinkRow(researchLinks) {
    const wrap = document.createElement("div");
    wrap.className = "link-row";
    if (!researchLinks) return wrap;

    const entries = [
      { label: "Hotels", href: researchLinks.lodgingSearch },
      { label: "Airbnb", href: researchLinks.airbnbSearch },
      { label: "VRBO", href: researchLinks.vrboSearch },
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
      link.textContent = `Open ${entry.label}`;
      link.title = `Open ${entry.label} in a new tab`;
      link.setAttribute("aria-label", `Open ${entry.label} in a new tab`);
      wrap.appendChild(link);
    });

    return wrap;
  }

  function renderLodgingOptions(options, researchLinks) {
    const wrap = document.createElement("div");
    wrap.className = "lodging-options";

    const title = document.createElement("p");
    title.className = "small-muted";
    title.textContent = "Lodging options (click to open):";
    wrap.appendChild(title);

    const list = document.createElement("div");
    list.className = "link-row";

    const topOptions = Array.isArray(options) ? options.slice(0, 3) : [];
    if (topOptions.length > 0) {
      topOptions.forEach((option) => {
        const link = document.createElement("a");
        link.href = option.bookingUrl || researchLinks?.lodgingSearch || "#";
        link.target = "_blank";
        link.rel = "noreferrer";
        const nightly = option.groupNightlyTotalUsd || option.nightlyRateUsd;
        link.textContent = `${option.name} • ~$${nightly}/nt • ${formatLodgingCapacity(option)}`;
        link.title = option.bookingUrl ? "Open listing" : "Open hotel search (listing link unavailable)";
        if (!option.bookingUrl && !researchLinks?.lodgingSearch) {
          link.setAttribute("aria-disabled", "true");
          link.removeAttribute("href");
        }
        list.appendChild(link);
      });
    } else {
      const hint = document.createElement("span");
      hint.className = "small-muted";
      hint.textContent = "No direct listings loaded yet. Use Hotels / Airbnb / VRBO links below.";
      list.appendChild(hint);
    }

    wrap.appendChild(list);
    return wrap;
  }

  function renderItineraryAiReview(aiReview) {
    const wrap = document.createElement("div");
    wrap.className = "itinerary-ai-review";
    if (!aiReview) return wrap;

    const title = document.createElement("p");
    title.className = "small-muted";
    title.textContent = `AI review: #${aiReview.rank} • ${formatVerdict(aiReview.verdict)} • ${Math.round((aiReview.confidence || 0) * 100)}% confidence`;
    wrap.appendChild(title);

    const rationale = document.createElement("p");
    rationale.className = "small-muted";
    rationale.textContent = aiReview.rationale;
    wrap.appendChild(rationale);

    if (Array.isArray(aiReview.tradeoffs) && aiReview.tradeoffs.length > 0) {
      const trade = document.createElement("p");
      trade.className = "small-muted";
      trade.textContent = `Trade-offs: ${aiReview.tradeoffs.join(" • ")}`;
      wrap.appendChild(trade);
    }
    return wrap;
  }

  function formatLodgingCapacity(option) {
    const units = option?.unitsNeededForGroup || 1;
    const sleeps = option?.estimatedSleeps;
    if (units > 1) {
      return typeof sleeps === "number"
        ? `${units} units est. (sleeps ~${sleeps}/unit)`
        : `${units} units est.`;
    }
    if (typeof sleeps === "number") return `single-unit est. (sleeps ~${sleeps})`;
    return "group-fit estimate";
  }

  function renderCostBreakdown(budgetEstimate) {
    const wrap = document.createElement("div");
    wrap.className = "cost-breakdown";
    const parts = budgetEstimate?.components;
    if (!parts) {
      wrap.textContent = "Cost breakdown pending.";
      return wrap;
    }

    const sourceMap = budgetEstimate?.componentSources || {};
    const total =
      typeof budgetEstimate?.perPersonTotal === "number"
        ? budgetEstimate.perPersonTotal
        : [parts.pass, parts.travel, parts.food, parts.gear_rental, parts.housing].reduce((sum, v) => sum + (v || 0), 0);

    const lines = [
      ["Pass", parts.pass, sourceMap.pass],
      ["Travel", parts.travel, sourceMap.travel],
      ["Lodging", parts.housing, sourceMap.housing],
      ["Food", parts.food, sourceMap.food],
      ["Gear", parts.gear_rental, sourceMap.gear_rental]
    ];

    const title = document.createElement("p");
    title.className = "small-muted";
    title.textContent = "Cost breakdown (per person):";
    wrap.appendChild(title);

    const list = document.createElement("div");
    list.className = "cost-breakdown-list";
    lines.forEach(([label, amount, source]) => {
      const row = document.createElement("div");
      row.className = "cost-breakdown-row";
      row.innerHTML = `<span>${label}</span><span>$${amount}</span><span>${source || "estimated"}</span>`;
      list.appendChild(row);
    });

    const totalRow = document.createElement("div");
    totalRow.className = "cost-breakdown-row total";
    totalRow.innerHTML = `<span>Total</span><span>$${total}</span><span>pp</span>`;
    list.appendChild(totalRow);
    wrap.appendChild(list);
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

function scoreLabel(value) {
  const pct = Math.round((Number(value) || 0) * 100);
  return `${pct}%`;
}

function formatVerdict(verdict) {
  const map = {
    best_overall: "Best overall",
    best_value: "Best value",
    best_pass_fit: "Best pass fit",
    best_snow_skill: "Best snow+skill fit",
    high_convenience: "High convenience",
    backup: "Backup"
  };
  return map[verdict] || verdict || "Review";
}

function labelize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
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
