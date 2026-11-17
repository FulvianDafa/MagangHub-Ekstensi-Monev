(() => {
  const { dateFromUrl, storageKey, isDraftKey, shortField, locateFields, fill } = MonevReport;
  // Late renders arrive as DOM mutations, so the observer only restarts this timer.
  const SETTLE_DEBOUNCE_MS = 120;
  const REPORT_PATH = "/dashboard/riwayat";

  let cachedDate;
  let cachedDraft;
  let storageRevision = 0;
  let automaticAttempt;
  let filledFor;
  let observedDate;
  let timer;

  async function runAutomatic() {
    const date = dateFromUrl(location.href);
    if (date !== observedDate) {
      observedDate = date;
      automaticAttempt = null;
      filledFor = undefined;
    }
    if (!date) return;

    if (cachedDate !== date) {
      const revision = storageRevision;
      const key = storageKey(date);
      const stored = await chrome.storage.local.get(key);
      if (revision !== storageRevision || dateFromUrl(location.href) !== date) return;
      cachedDate = date;
      cachedDraft = stored[key];
    }
    if (!cachedDraft?.autoFill || shortField(cachedDraft)) return;

    const revision = cachedDraft.updatedAt;
    // This exact draft already sits in the form, so the DOM scan is skipped entirely.
    if (filledFor?.date === date && filledFor.revision === revision) return;

    const matches = locateFields();
    if (matches.some(({ input }) => !input)) return;

    // One attempt per rendered form and saved draft. Editing a field after that stays manual.
    const inputs = matches.map(({ input }) => input);
    if (
      automaticAttempt?.date === date && automaticAttempt.revision === revision &&
      automaticAttempt.inputs.every((input, index) => input === inputs[index])
    ) return;

    automaticAttempt = { date, revision, inputs };
    const result = await fill(date, cachedDraft, false, matches);
    if (result.status === "filled") filledFor = { date, revision };
  }

  function reportError(error) {
    console.debug("[Draf Monev] pengisian otomatis dilewati:", error);
  }

  function scheduleAutomatic() {
    if (timer !== undefined) clearTimeout(timer);
    // A string check, not URL parsing: this runs on every mutation batch.
    if (!location.pathname.includes(REPORT_PATH)) return;
    timer = setTimeout(() => {
      timer = undefined;
      runAutomatic().catch(reportError);
    }, SETTLE_DEBOUNCE_MS);
  }

  // Riwayat can display a report after an in-site navigation or an asynchronous render.
  new MutationObserver(scheduleAutomatic).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "aria-hidden", "inert", "disabled", "readonly"],
  });
  addEventListener("popstate", scheduleAutomatic);
  addEventListener("pageshow", scheduleAutomatic);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.keys(changes).some(isDraftKey)) return;
    storageRevision++;
    cachedDate = undefined;
    filledFor = undefined;
    scheduleAutomatic();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "fill-monev-report") return;
    fill(message.date, message.draft, message.replaceExisting === true)
      .then(sendResponse, () => sendResponse({ status: "unavailable" }));
    return true;
  });

  scheduleAutomatic();
})();
