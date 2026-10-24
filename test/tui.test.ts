import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  nextIssueFilter,
  emptyResultsMessage,
  availableContentRows,
  wrapTerminalText,
  safeGitHubIssueUrl,
  sanitizeTerminalText,
  truncateText,
  visibleResults,
  visibleWindow,
} from "../src/tui-model.js";
import type { AuditedIssue } from "../src/types.js";

function sample(number: number, status: AuditedIssue["status"], title: string): AuditedIssue {
  return {
    issue: {
      number,
      title,
      html_url: "https://github.com/example/project/issues/" + number,
      updated_at: "2026-10-01T00:00:00Z",
      labels: ["good first issue"],
      assignees: [],
    },
    status,
    findings: status === "pass" ? [] : [{ code: "SQ004", level: status, message: "Open closing PR" }],
  };
}

test("results explorer filters, searches, and prioritizes failures", () => {
  const issues = [sample(3, "pass", "Clean"), sample(2, "warn", "Stale"), sample(1, "fail", "Blocked")];
  assert.deepEqual(visibleResults(issues, "all", "").map((issue) => issue.issue.number), [1, 2, 3]);
  assert.deepEqual(visibleResults(issues, "warn", "").map((issue) => issue.issue.number), [2]);
  assert.deepEqual(visibleResults(issues, "all", "sq004").map((issue) => issue.issue.number), [1, 2]);
  assert.deepEqual(visibleResults(issues, "all", "#1").map((issue) => issue.issue.number), []);
  assert.deepEqual(visibleResults(issues, "all", "blocked").map((issue) => issue.issue.number), [1]);
});

test("filter cycle is deterministic", () => {
  assert.equal(nextIssueFilter("all"), "fail");
  assert.equal(nextIssueFilter("fail"), "warn");
  assert.equal(nextIssueFilter("warn"), "pass");
  assert.equal(nextIssueFilter("pass"), "all");
});

test("terminal text is sanitized and truncated", () => {
  assert.equal(sanitizeTerminalText("hello\u001b[31m\nworld"), "hello [31m world");
  assert.equal(truncateText("abcdef", 4), "abc…");
  assert.equal(truncateText("abcdef", 0), "");
});

test("results window stays within bounds", () => {
  assert.deepEqual(visibleWindow(0, 20, 5), { start: 0, end: 5 });
  assert.deepEqual(visibleWindow(19, 20, 5), { start: 15, end: 20 });
  assert.deepEqual(visibleWindow(0, 0, 5), { start: 0, end: 0 });
});

test("empty-state messages distinguish empty queues from filtered results", () => {
  assert.deepEqual(emptyResultsMessage(0, "all", ""), {
    title: "No open starter issues found",
    hint: "No open 'good first issue' tickets in this repo. Press R for a new audit.",
  });
  assert.equal(emptyResultsMessage(5, "fail", "").title, "No FAIL issues");
  assert.equal(emptyResultsMessage(5, "all", "xyz").title, "No search matches");
});

test("footer-aware viewport reserves room for navigation hints", () => {
  assert.equal(availableContentRows(33, 12, 2), 16);
  assert.equal(availableContentRows(33, 12, 3), 15);
  assert.equal(availableContentRows(22, 12, 2), 5);
  assert.equal(availableContentRows(12, 12, 2), 0);
});

test("long findings wrap without hiding their closing PR links", () => {
  const message = "Open pull request https://github.com/rust-lang/rust-clippy/pull/15992 is linked to close this issue";
  const lines = wrapTerminalText(message, 34);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" ").replace(/\\s+/g, ""), message.replace(/\\s+/g, ""));
  assert.ok(lines.every((line) => Array.from(line).length <= 34));
  assert.deepEqual(wrapTerminalText("   ", 20), [""]);
  assert.deepEqual(wrapTerminalText("hello", 0), []);
});

test("only normal GitHub issue URLs can launch a browser", () => {
  assert.equal(safeGitHubIssueUrl("https://github.com/a/b/issues/123"), "https://github.com/a/b/issues/123");
  assert.equal(safeGitHubIssueUrl("https://evil.example/issues/1"), null);
  assert.equal(safeGitHubIssueUrl("https://github.com/a/b/pulls/1"), null);
  assert.equal(safeGitHubIssueUrl("https://github.com/a/b/issues/1;whoami"), null);
});

test("non-TTY CLI still provides usage instead of launching the TUI", () => {
  const cli = new URL("../src/cli.js", import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(cli)], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.match(result.stderr, /requires a terminal/i);
});

test("--help works without an interactive terminal", () => {
  const cli = new URL("../src/cli.js", import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /starterqueue audit/);
});
