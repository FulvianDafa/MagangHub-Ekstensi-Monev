(() => {
  const { dateFromUrl, storageKey, shortField, locateFields, fill } = MonevReport;
  let cachedDate;
  let cachedDraft;
  let storageRevision = 0;
  let automaticAttempt;
  let observedDate;
  let timer;

  async function runAutomatic() {
    const date = dateFromUrl(location.href);
    if (!date) {
      automaticAttempt = null;
      return;
    }

    if (cachedDate !== date) {
      const revision = storageRevision;
      const key = storageKey(date);
      const stored = await chrome.storage.local.get(key);
      if (revision !== storageRevision || dateFromUrl(location.href) !== date) return;
      cachedDate = date;
      cachedDraft = stored[key];
    }
    if (!cachedDraft?.autoFill || shortField(cachedDraft)) return;

    const matches = locateFields();
    if (matches.some(({ input }) => !input)) return;

    // One attempt per rendered form and saved draft. Editing a field after that stays manual.
    const inputs = matches.map(({ input }) => input);
    const revision = cachedDraft.updatedAt;
    if (
      automaticAttempt?.date === date && automaticAttempt.revision === revision &&
      automaticAttempt.inputs.every((input, index) => input === inputs[index])
    ) return;

    automaticAttempt = { date, revision, inputs };
    await fill(date, cachedDraft, false, matches);
  }

  function scheduleAutomatic() {
    const date = dateFromUrl(location.href);
    if (date !== observedDate) {
      observedDate = date;
      automaticAttempt = null;
    }
    if (timer !== undefined) clearTimeout(timer);
    if (!date) return;
    timer = setTimeout(() => {
      timer = undefined;
      runAutomatic().catch(() => {});
    }, 120);
  }

  // Riwayat can display a report after an in-site navigation or an asynchronous render.
  new MutationObserver(scheduleAutomatic).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["hidden", "aria-hidden", "inert", "disabled", "readonly"],
  });
  addEventListener("popstate", scheduleAutomatic);
  addEventListener("pageshow", scheduleAutomatic);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.keys(changes).some((key) => key.startsWith("draft:"))) return;
    storageRevision++;
    cachedDate = undefined;
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
