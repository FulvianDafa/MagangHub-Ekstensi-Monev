const MonevReport = (() => {
  const MIN_LENGTH = 100;
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
    if (!tabUrl) return null;
    const url = new URL(tabUrl);
    const date = url.searchParams.get("date");
    if (
      url.origin !== "https://monev.maganghub.kemnaker.go.id" ||
      url.pathname.replace(/\/$/, "") !== "/dashboard/riwayat" ||
      url.searchParams.get("view") !== "edit" ||
      !validDate(date)
    ) return null;
    return date;
  }

  function storageKey(date) {
    return "draft:" + date;
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
    const editable = Array.from(document.querySelectorAll("textarea")).filter((input) =>
      !input.matches(":disabled") && !input.readOnly &&
      !input.closest("[aria-hidden='true'], [inert]") &&
      input.getClientRects().length > 0 && getComputedStyle(input).visibility === "visible"
    );
    return fields.map((field) => {
      const matching = editable.filter((input) => fieldLabels(input).includes(normalizeLabel(field.label)));
      return { ...field, input: matching.length === 1 ? matching[0] : null };
    });
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

    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    for (const { id, input } of matches) {
      const value = draft[id].trim();
      if (input.value === value) continue;
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
    if (dateFromUrl(location.href) !== date) return { status: "wrong-page" };
    const rejected = locateFields().filter(({ id, input }) => input?.value !== draft[id].trim())
      .map(({ label }) => label);
    return rejected.length
      ? { status: "incomplete", labels: rejected }
      : { status: "filled" };
  }

  return { MIN_LENGTH, fields, validDate, dateFromUrl, storageKey, shortField, locateFields, fill };
})();
