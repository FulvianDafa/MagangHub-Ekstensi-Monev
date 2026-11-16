const { MIN_LENGTH, fields, validDate, dateFromUrl, storageKey, shortField } = MonevReport;
const byId = (id) => document.getElementById(id);
const workspace = byId("workspace");
const dateInput = byId("report-date");
const statusLabel = byId("status");
const noteForm = byId("note-form");
const draftForm = byId("draft-form");
const settingsForm = byId("settings-form");
const summaryInput = byId("summary");
const apiKey = byId("api-key");
const removeKey = byId("remove-key");
const noObstacle = byId("no-obstacle");
const autoFill = byId("auto-fill");
const replaceOption = byId("replace-option");
const replaceExisting = byId("replace-existing");
const modes = [
  { name: "notes", button: byId("show-notes"), pane: noteForm },
  { name: "draft", button: byId("show-draft"), pane: draftForm },
  { name: "settings", button: byId("show-settings"), pane: settingsForm },
];

let busy = false;
let savedDate;
let lastSavedNotes = {};

function showStatus(message = "", tone = "") {
  statusLabel.textContent = message;
  statusLabel.dataset.tone = tone;
  statusLabel.hidden = !message;
}

function setMode(mode) {
  for (const { name, button, pane } of modes) {
    const selected = mode === name;
    pane.hidden = !selected;
    button.setAttribute("aria-pressed", String(selected));
  }
}

function updateControls() {
  for (const { id } of fields) {
    const length = byId(id).value.trim().length;
    const count = byId(id + "-count");
    count.textContent = length + " / " + MIN_LENGTH + " karakter minimum";
    count.dataset.valid = String(length >= MIN_LENGTH);
  }
  for (const control of workspace.querySelectorAll("button, textarea, input")) {
    control.disabled = busy;
  }
  const hasKey = Boolean(MonevGemini.getKey());
  removeKey.disabled = busy || !hasKey;
  byId("key-status").textContent = hasKey ? "API key sudah tersimpan di browser ini." : "Belum ada API key.";
}

function resetReplace() {
  replaceExisting.checked = false;
  replaceOption.hidden = true;
}

function readFields() {
  return Object.fromEntries(fields.map(({ id }) => [id, byId(id).value]));
}

function writeFields(data) {
  for (const { id } of fields) {
    byId(id).value = typeof data?.[id] === "string" ? data[id] : "";
  }
}

async function openDate(date) {
  if (!validDate(date)) {
    dateInput.value = savedDate || todayInJakarta();
    return;
  }
  const key = storageKey(date);
  const saved = (await chrome.storage.local.get(key))[key] || {};
  savedDate = date;
  writeFields(saved);
  lastSavedNotes = saved.notes || {};
  summaryInput.value = typeof lastSavedNotes.summary === "string" ? lastSavedNotes.summary : "";
  noObstacle.checked = lastSavedNotes.noObstacle === true;
  autoFill.checked = saved.autoFill === true;
  resetReplace();
  setMode(fields.some(({ id }) => Boolean(saved[id])) ? "draft" : "notes");
}

async function writeDraft(draft, notes) {
  const key = storageKey(savedDate);
  const hasText = fields.some(({ id }) => draft[id].trim());
  if (hasText) {
    await chrome.storage.local.set({
      [key]: { ...draft, notes, autoFill: autoFill.checked, updatedAt: crypto.randomUUID() },
    });
  } else {
    await chrome.storage.local.remove(key);
    autoFill.checked = false;
  }
  lastSavedNotes = hasText ? notes : {};
  return hasText;
}

function reportReadyMessage() {
  const localized = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(savedDate));
  return "Draf siap. Buka formulir Monev untuk " + localized + " agar kolom terisi otomatis.";
}

async function fillOpenReport(draft, allowReplace) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (dateFromUrl(tab?.url) !== savedDate || !Number.isInteger(tab?.id)) {
    showStatus(autoFill.checked ? reportReadyMessage() : "Draf tersimpan. Buka formulir Monev untuk tanggal ini.", "success");
    return;
  }
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, {
      type: "fill-monev-report", date: savedDate, draft, replaceExisting: allowReplace,
    });
  } catch {
    showStatus("Draf tersimpan. Muat ulang halaman Monev agar ekstensi bisa mengisi formulir.", "error");
    return;
  }

  switch (result?.status) {
    case "filled":
      resetReplace();
      showStatus("Tiga kolom sudah terisi. Tinjau hasilnya di Monev.", "success");
      break;
    case "occupied":
      replaceOption.hidden = false;
      replaceExisting.checked = false;
      showStatus("Ada teks di kolom " + result.labels.join(", ") +
        ". Untuk menggantinya, centang izin lalu klik Isi sekarang.");
      break;
    case "missing":
      showStatus("Draf tersimpan. Pastikan tiga kolom teks sudah terlihat di Monev.", "error");
      break;
    case "incomplete":
      showStatus("Periksa kembali kolom " + result.labels.join(", ") + " di Monev.", "error");
      break;
    default:
      showStatus("Draf tersimpan. Buka kembali formulir untuk tanggal yang dipilih.", "error");
  }
}

async function withControlsLocked(action) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    await action();
  } catch {
    showStatus("Terjadi masalah saat mengakses draf. Coba lagi.", "error");
  } finally {
    busy = false;
    updateControls();
  }
}

function todayInJakarta() {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return [values.year, values.month, values.day].join("-");
}

dateInput.addEventListener("change", () => withControlsLocked(async () => {
  showStatus();
  await openDate(dateInput.value);
}));
for (const { name, button } of modes) {
  button.addEventListener("click", () => {
    showStatus();
    setMode(name);
  });
}
noteForm.addEventListener("input", () => {
  showStatus();
});
draftForm.addEventListener("input", (event) => {
  if (event.target !== replaceExisting) {
    showStatus();
    resetReplace();
  }
  updateControls();
});

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  const notes = { summary: summaryInput.value.trim(), noObstacle: noObstacle.checked };
  if (!notes.summary) {
    summaryInput.focus();
    showStatus("Tulis ringkasan kegiatan hari ini dulu.", "error");
    return;
  }
  if (!MonevGemini.getKey()) {
    setMode("settings");
    apiKey.focus();
    showStatus("Simpan API key Gemini dulu, lalu kembali ke Tulis laporan.");
    return;
  }

  return withControlsLocked(async () => {
    showStatus("Gemini sedang menyusun draf…");
    let draft;
    try {
      draft = await MonevGemini.generate(notes.summary, notes.noObstacle);
    } catch (error) {
      showStatus(error.message, "error");
      return;
    }
    if (fields.every(({ id }) => !draft[id])) {
      showStatus("Tambahkan detail kegiatan, pembelajaran, atau kendala agar draf bisa disusun.", "error");
      return;
    }
    // A newly generated draft remains in review until the user chooses to fill it.
    autoFill.checked = false;
    await writeDraft(draft, notes);
    writeFields(draft);
    resetReplace();
    setMode("draft");
    const short = shortField(draft);
    showStatus(short
      ? "Draf disusun. Lengkapi kolom yang belum mencapai 100 karakter."
      : "Draf siap ditinjau. Klik Isi sekarang untuk memasukkannya ke Monev.", short ? "" : "success");
  });
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  const key = apiKey.value.trim();
  if (!key || /\s/.test(key)) {
    showStatus("Tempel API key Gemini tanpa spasi.", "error");
    return;
  }
  MonevGemini.setKey(key);
  apiKey.value = "";
  updateControls();
  setMode("notes");
  showStatus("API key tersimpan. Kamu bisa membuat draf dari ringkasanmu.", "success");
});

removeKey.addEventListener("click", () => {
  if (busy) return;
  MonevGemini.setKey("");
  apiKey.value = "";
  updateControls();
  showStatus("API key dihapus.", "success");
});

byId("save").addEventListener("click", () => withControlsLocked(async () => {
  const draft = readFields();
  if (autoFill.checked && fields.some(({ id }) => draft[id].trim()) && shortField(draft)) {
    showStatus("Pengisian otomatis siap setelah tiga kolom mencapai " + MIN_LENGTH + " karakter.", "error");
    return;
  }
  const hasText = await writeDraft(draft, lastSavedNotes);
  showStatus(hasText
    ? (autoFill.checked ? "Draf tersimpan. Pengisian otomatis aktif untuk tanggal ini." : "Draf tanggal ini tersimpan.")
    : "Draf tanggal ini sudah dihapus.", "success");
}));

draftForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  const draft = readFields();
  const short = shortField(draft);
  if (short) {
    byId(short.id).focus();
    showStatus(short.label + " perlu minimal " + MIN_LENGTH + " karakter.", "error");
    return;
  }

  return withControlsLocked(async () => {
    await writeDraft(draft, lastSavedNotes);
    await fillOpenReport(draft, replaceExisting.checked);
  });
});

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  dateInput.value = dateFromUrl(tab?.url) || todayInJakarta();
  await openDate(dateInput.value);
  workspace.hidden = false;
  showStatus();
  updateControls();
}

initialize().catch(() => showStatus("Draf gagal dibuka. Tutup popup lalu coba lagi.", "error"));
