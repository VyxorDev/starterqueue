import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  nextIssueFilter,
  emptyResultsMessage,
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
    hint: "This repository has no open 'good first issue' tickets. Press R to try another repository.",
  });
  assert.equal(emptyResultsMessage(5, "fail", "").title, "No FAIL issues");
  assert.equal(emptyResultsMessage(5, "all", "xyz").title, "No search matches");
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
