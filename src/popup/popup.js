const { MIN_LENGTH, fields, validDate, dateFromUrl, storageKey, isDraftKey, shortField } = MonevReport;
const byId = (id) => document.getElementById(id);
const hasContent = (draft) => fields.some(({ id }) => Boolean(draft[id]?.trim()));
// Formatter construction is the expensive part, so both are built once.
const DATE_LONG = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });
const DATE_JAKARTA = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});
const workspace = byId("workspace");
const dateInput = byId("report-date");
const statusLabel = byId("status");
const noteForm = byId("note-form");
const draftForm = byId("draft-form");
const settingsForm = byId("settings-form");
const summaryInput = byId("summary");
const apiKey = byId("api-key");
const toggleKey = byId("toggle-key");
const removeKey = byId("remove-key");
const resetDialog = byId("reset-dialog");
const noObstacle = byId("no-obstacle");
const autoFill = byId("auto-fill");
const replaceOption = byId("replace-option");
const replaceExisting = byId("replace-existing");
const modes = [
  { name: "notes", button: byId("show-notes"), pane: noteForm },
  { name: "draft", button: byId("show-draft"), pane: draftForm },
  { name: "settings", button: byId("show-settings"), pane: settingsForm },
];
const modeList = byId("report-modes");
const clearDrafts = byId("clear-drafts");

let busy = false;
let savedDate;
let lastSavedNotes = {};
let clearArmed = false;
let clearTimer;

function showStatus(message = "", tone = "") {
  if (statusLabel.textContent === message && statusLabel.dataset.tone === tone) return;
  statusLabel.textContent = message;
  statusLabel.dataset.tone = tone;
  statusLabel.hidden = !message;
}

function setKeyVisible(visible) {
  apiKey.type = visible ? "text" : "password";
  toggleKey.textContent = visible ? "Sembunyikan" : "Tampilkan";
}

function setMode(mode) {
  if (mode === "settings" && settingsForm.hidden) {
    apiKey.value = MonevGemini.getKey();
  }
  if (mode !== "settings") {
    setKeyVisible(false);
    apiKey.value = "";
  }

  for (const { name, button, pane } of modes) {
    const selected = mode === name;
    pane.hidden = !selected;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

function updateCount(id) {
  const length = byId(id).value.trim().length;
  const count = byId(id + "-count");
  count.textContent = length + " / " + MIN_LENGTH + " karakter minimum";
  count.dataset.valid = String(length >= MIN_LENGTH);
}

function updateControls() {
  for (const { id } of fields) updateCount(id);
  for (const control of workspace.querySelectorAll("button, textarea, input")) {
    control.disabled = busy;
  }
  const hasKey = Boolean(MonevGemini.getKey());
  removeKey.disabled = busy || !hasKey;
  const keyStatus = byId("key-status");
  const label = hasKey ? "API key sudah tersimpan di browser ini." : "Belum ada API key.";
  if (keyStatus.textContent !== label) keyStatus.textContent = label;
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
  const hasText = hasContent(draft);
  if (hasText) {
    // updatedAt holds a UUID, not a time: auto-fill only compares it to detect a changed draft.
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
  const localized = DATE_LONG.format(new Date(savedDate));
  return "Draf siap. Buka formulir Monev untuk " + localized + " agar kolom terisi otomatis.";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fillOpenReport(draft, allowReplace) {
  const tab = await getActiveTab();
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
  const values = {};
  for (const { type, value } of DATE_JAKARTA.formatToParts(new Date())) values[type] = value;
  return values.year + "-" + values.month + "-" + values.day;
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
modeList.addEventListener("keydown", (event) => {
  const index = modes.findIndex(({ button }) => button === event.target);
  if (index === -1) return;
  const step =
    event.key === "ArrowRight" ? 1 :
    event.key === "ArrowLeft" ? -1 :
    event.key === "Home" ? -index :
    event.key === "End" ? modes.length - 1 - index : 0;
  if (step === 0) return;
  event.preventDefault();
  showStatus();
  const next = modes[(index + step + modes.length) % modes.length];
  setMode(next.name);
  next.button.focus();
});
noteForm.addEventListener("input", () => {
  showStatus();
});
draftForm.addEventListener("input", (event) => {
  if (event.target !== replaceExisting) {
    showStatus();
    resetReplace();
  }
  const edited = fields.find(({ id }) => id === event.target.id);
  if (edited) updateCount(edited.id);
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
      draft = await MonevGemini.generate(notes.summary, notes.noObstacle, savedDate);
    } catch (error) {
      showStatus(error.message, "error");
      return;
    }
    if (!hasContent(draft)) {
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
      ? "Draf disusun. Lengkapi kolom yang belum mencapai " + MIN_LENGTH + " karakter."
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
  updateControls();
  setMode("notes");
  showStatus("API key tersimpan. Kamu bisa membuat draf dari ringkasanmu.", "success");
});

toggleKey.addEventListener("click", () => setKeyVisible(apiKey.type === "password"));

removeKey.addEventListener("click", () => {
  if (busy) return;
  MonevGemini.setKey("");
  apiKey.value = "";
  setKeyVisible(false);
  updateControls();
  showStatus("API key dihapus.", "success");
});

for (const button of document.querySelectorAll("[data-reset-draft]")) {
  button.addEventListener("click", () => {
    if (busy) return;
    resetDialog.returnValue = "";
    resetDialog.showModal();
  });
}

resetDialog.addEventListener("close", () => {
  if (resetDialog.returnValue !== "reset") return;
  return withControlsLocked(async () => {
    await writeDraft({}, {});
    summaryInput.value = "";
    noObstacle.checked = false;
    writeFields({});
    resetReplace();
    setMode("notes");
    showStatus("Ringkasan dan draf tanggal ini sudah direset.", "success");
  });
});

function disarmClear() {
  clearArmed = false;
  clearDrafts.textContent = "Hapus semua draf";
  clearTimeout(clearTimer);
}

// Two-step confirmation: window.confirm() would dismiss the popup.
clearDrafts.addEventListener("click", () => {
  if (busy) return;
  if (!clearArmed) {
    clearArmed = true;
    clearDrafts.textContent = "Klik lagi untuk menghapus semua";
    showStatus("Semua draf di profil browser ini akan dihapus permanen.", "error");
    clearTimer = setTimeout(disarmClear, 5000);
    return;
  }
  disarmClear();
  withControlsLocked(async () => {
    const stored = await chrome.storage.local.get(null);
    const keys = Object.keys(stored).filter(isDraftKey);
    await chrome.storage.local.remove(keys);
    await openDate(savedDate);
    showStatus(keys.length === 0
      ? "Belum ada draf yang tersimpan."
      : keys.length + " draf dihapus dari profil ini.", "success");
  });
});

byId("save").addEventListener("click", () => withControlsLocked(async () => {
  const draft = readFields();
  if (autoFill.checked && hasContent(draft) && shortField(draft)) {
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

function syncFieldLabels() {
  // Titles come from MonevReport.fields so the popup and the Monev matcher never drift apart.
  for (const { id, label } of fields) {
    const element = document.querySelector('label[for="' + id + '"]');
    if (element) element.textContent = label;
  }
}

async function initialize() {
  syncFieldLabels();
  const tab = await getActiveTab();
  dateInput.value = dateFromUrl(tab?.url) || todayInJakarta();
  await openDate(dateInput.value);
  workspace.hidden = false;
  showStatus();
  updateControls();
}

initialize().catch(() => showStatus("Draf gagal dibuka. Tutup popup lalu coba lagi.", "error"));
