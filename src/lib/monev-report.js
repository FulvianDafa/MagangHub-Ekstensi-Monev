const MonevReport = (() => {
  const SITE_ORIGIN = "https://monev.maganghub.kemnaker.go.id";
  // Popup link target; also locked against popup.html by the unit test.
  const DASHBOARD_URL = SITE_ORIGIN + "/dashboard";
  // Monev rejects a report column shorter than this.
  const MIN_LENGTH = 100;
  // The site may re-render and drop a written value, so verify instead of trusting one fixed delay.
  const SETTLE_TIMEOUT_MS = 800;
  const SETTLE_POLL_MS = 40;
  const DRAFT_PREFIX = "draft:";
  const fields = [
    { id: "activity", label: "Uraian aktivitas" },
    { id: "learning", label: "Pembelajaran yang diperoleh" },
    { id: "obstacle", label: "Kendala yang dialami" },
  ];

  function validDate(date) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
  }

  function dateFromUrl(tabUrl) {
    if (typeof tabUrl !== "string") return null;
    let url;
    try {
      url = new URL(tabUrl);
    } catch {
      return null;
    }
    const date = url.searchParams.get("date");
    if (
      url.origin !== SITE_ORIGIN ||
      url.pathname.replace(/\/$/, "") !== "/dashboard/riwayat" ||
      url.searchParams.get("view") !== "edit" ||
      !validDate(date)
    ) return null;
    return date;
  }

  function isDraftKey(key) {
    return typeof key === "string" && key.startsWith(DRAFT_PREFIX);
  }

  function storageKey(date) {
    return DRAFT_PREFIX + date;
  }

  function shortField(draft) {
    return fields.find(({ id }) =>
      typeof draft?.[id] !== "string" || draft[id].trim().length < MIN_LENGTH
    );
  }

  function normalizeLabel(label) {
    return label.toLowerCase().replace(/[\s*:]+$/, "").trim().replace(/\s+/g, " ");
  }

  function fieldLabels(input) {
    const labelIds = (input.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    return [
      ...Array.from(input.labels, (label) => label.textContent),
      ...labelIds.map((id) => document.getElementById(id)?.textContent),
      input.getAttribute("aria-label"),
      input.getAttribute("placeholder"),
    ].filter(Boolean).map(normalizeLabel);
  }

  function locateFields() {
    // Label text is resolved once per textarea; reading it again per field tripled the parsing.
    const editable = Array.from(document.querySelectorAll("textarea"))
      .filter((input) =>
        !input.matches(":disabled") && !input.readOnly &&
        !input.closest("[aria-hidden='true'], [inert]") &&
        input.getClientRects().length > 0 && getComputedStyle(input).visibility === "visible"
      )
      .map((input) => ({ input, labels: fieldLabels(input) }));

    return fields.map((field) => {
      const target = normalizeLabel(field.label);
      const matching = editable.filter(({ labels }) => labels.includes(target));
      return { ...field, input: matching.length === 1 ? matching[0].input : null };
    });
  }

  function applyValues(targets, setValue) {
    for (const { input, value } of targets) {
      if (input.value === value) continue;
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async function settleValues(targets) {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let pending;
    do {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
      pending = targets.filter(({ input, value }) => input.value !== value);
    } while (pending.length > 0 && Date.now() < deadline);
    return pending;
  }

  async function fill(date, draft, replaceExisting, matches) {
    if (!date || dateFromUrl(location.href) !== date) return { status: "wrong-page" };
    if (shortField(draft)) return { status: "short" };
    matches ??= locateFields();

    const missing = matches.filter((field) => !field.input).map((field) => field.label);
    if (missing.length > 0 || new Set(matches.map((field) => field.input)).size !== fields.length) {
      return { status: "missing", labels: missing };
    }

    const occupied = matches.filter(({ id, input }) => input.value.trim() && input.value !== draft[id].trim())
      .map(({ label }) => label);
    if (occupied.length > 0 && !replaceExisting) return { status: "occupied", labels: occupied };

    const targets = matches.map(({ id, label, input }) => ({ label, input, value: draft[id].trim() }));
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;

    // Write, verify, and retry once: a re-render between write and read drops the value.
    let pending = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      applyValues(targets, setValue);
      pending = await settleValues(targets);
      if (dateFromUrl(location.href) !== date) return { status: "wrong-page" };
      if (pending.length === 0) return { status: "filled" };
      if (pending.some(({ input }) => !input.isConnected)) break;
    }
    return { status: "incomplete", labels: pending.map(({ label }) => label) };
  }

  return { SITE_ORIGIN, DASHBOARD_URL, MIN_LENGTH, fields, validDate, dateFromUrl, storageKey, isDraftKey, shortField, locateFields, fill };
})();
