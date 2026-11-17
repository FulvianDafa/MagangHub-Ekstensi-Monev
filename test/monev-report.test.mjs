import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Loaded the way the extension does: same source, the published global handed back to the tests.
const source = readFileSync(new URL("../src/lib/monev-report.js", import.meta.url), "utf8");
vm.runInThisContext(source + "\nglobalThis.__MonevReport = MonevReport;", { filename: "monev-report.js" });
const MonevReport = globalThis.__MonevReport;
delete globalThis.__MonevReport;

const url = (path) => "https://monev.maganghub.kemnaker.go.id" + path;

test("validDate rejects malformed and impossible dates", () => {
  assert.equal(MonevReport.validDate("2026-11-16"), true);
  assert.equal(MonevReport.validDate("2024-02-29"), true);
  assert.equal(MonevReport.validDate("2026-02-30"), false);
  assert.equal(MonevReport.validDate("2026-13-01"), false);
  assert.equal(MonevReport.validDate("16-11-2026"), false);
  assert.equal(MonevReport.validDate(""), false);
  assert.equal(MonevReport.validDate(null), false);
});

test("dateFromUrl accepts only the edit view of a report page", () => {
  assert.equal(MonevReport.dateFromUrl(url("/dashboard/riwayat?date=2026-11-16&view=edit")), "2026-11-16");
  assert.equal(MonevReport.dateFromUrl(url("/dashboard/riwayat/?date=2026-11-16&view=edit")), "2026-11-16");
  assert.equal(MonevReport.dateFromUrl(url("/dashboard/riwayat?date=2026-11-16")), null);
  assert.equal(MonevReport.dateFromUrl(url("/dashboard/riwayat?date=2026-11-16&view=view")), null);
  assert.equal(MonevReport.dateFromUrl(url("/dashboard/riwayat?date=2026-02-30&view=edit")), null);
  assert.equal(MonevReport.dateFromUrl(url("/dashboard/other?date=2026-11-16&view=edit")), null);
  assert.equal(
    MonevReport.dateFromUrl("https://evil.example/dashboard/riwayat?date=2026-11-16&view=edit"),
    null,
  );
});

test("dateFromUrl returns null instead of throwing on unusable input", () => {
  assert.equal(MonevReport.dateFromUrl(""), null);
  assert.equal(MonevReport.dateFromUrl("bukan url"), null);
  assert.equal(MonevReport.dateFromUrl(undefined), null);
  assert.equal(MonevReport.dateFromUrl(null), null);
});

test("storageKey namespaces drafts per date", () => {
  assert.equal(MonevReport.storageKey("2026-11-16"), "draft:2026-11-16");
});

test("isDraftKey accepts exactly the keys storageKey produces", () => {
  assert.equal(MonevReport.isDraftKey(MonevReport.storageKey("2026-11-16")), true);
  assert.equal(MonevReport.isDraftKey("other-key"), false);
  assert.equal(MonevReport.isDraftKey(""), false);
  assert.equal(MonevReport.isDraftKey(undefined), false);
});

test("shortField reports the first column below the site minimum", () => {
  const ok = "a".repeat(MonevReport.MIN_LENGTH);
  assert.equal(MonevReport.MIN_LENGTH, 100);
  assert.equal(MonevReport.shortField({ activity: ok, learning: ok, obstacle: ok }), undefined);
  assert.equal(MonevReport.shortField({ activity: "a".repeat(99), learning: ok, obstacle: ok }).id, "activity");
  assert.equal(MonevReport.shortField({ learning: ok, obstacle: ok }).id, "activity");
  assert.equal(MonevReport.shortField({ activity: "   ", learning: ok, obstacle: ok }).id, "activity");
  assert.equal(MonevReport.shortField(undefined).id, "activity");
});

test("fields describe the three Monev columns in order", () => {
  assert.deepEqual(MonevReport.fields.map(({ id }) => id), ["activity", "learning", "obstacle"]);
});

test("the popup dashboard link targets the validated origin", () => {
  const html = readFileSync(new URL("../src/popup/popup.html", import.meta.url), "utf8");
  const tag = html.match(/<a\b[^>]*id="open-dashboard"[^>]*>/)?.[0];
  assert.ok(tag, "popup.html has no #open-dashboard link");
  assert.equal(tag.match(/href="([^"]+)"/)?.[1], MonevReport.DASHBOARD_URL);
  assert.equal(new URL(MonevReport.DASHBOARD_URL).origin, MonevReport.SITE_ORIGIN);
  assert.match(tag, /target="_blank"/);
  assert.match(tag, /rel="noopener noreferrer"/);
});

test("the manifest content script runs on the same origin the code validates", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const patterns = manifest.content_scripts.flatMap(({ matches }) => matches);
  assert.ok(patterns.length > 0, "manifest has no content_scripts matches");
  for (const pattern of patterns) {
    assert.ok(
      pattern.startsWith(MonevReport.SITE_ORIGIN + "/"),
      pattern + " does not start with " + MonevReport.SITE_ORIGIN + "/",
    );
  }
});
