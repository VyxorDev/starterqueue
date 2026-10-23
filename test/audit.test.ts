import assert from "node:assert/strict";
import test from "node:test";
import { auditIssue } from "../src/audit.js";
import type { StarterIssue } from "../src/types.js";

const NOW = new Date("2026-10-23T00:00:00Z");

function issue(overrides: Partial<StarterIssue> = {}): StarterIssue {
  return {
    number: 1,
    title: "Starter task",
    html_url: "https://github.com/example/project/issues/1",
    body: null,
    assignees: [],
    updated_at: "2026-10-20T00:00:00Z",
    labels: [{ name: "good first issue" }],
    locked: false,
    milestone: null,
    open_pull_requests: [],
    merged_pull_requests: [],
    ...overrides,
  };
}

test("clean starter issue passes", () => {
  assert.equal(auditIssue(issue(), NOW).status, "pass");
});

test("assigned starter issue fails with SQ001", () => {
  const result = auditIssue(issue({ assignees: [{ login: "dev" }] }), NOW);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0]?.code, "SQ001");
});

test("blocked starter issue fails with SQ002", () => {
  const result = auditIssue(issue({ labels: [{ name: "good first issue" }, { name: "blocked" }] }), NOW);
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) => finding.code === "SQ002"));
});

test("inactive starter issue warns with SQ003", () => {
  const result = auditIssue(issue({ updated_at: "2026-01-01T00:00:00Z" }), NOW);
  assert.equal(result.status, "warn");
  assert.ok(result.findings.some((finding) => finding.code === "SQ003"));
});

test("custom stale threshold controls SQ003", () => {
  const result = auditIssue(
    issue({ updated_at: "2026-10-01T00:00:00Z" }),
    NOW,
    { staleDays: 14 },
  );
  assert.equal(result.status, "warn");
  assert.ok(result.findings.some((finding) => finding.code === "SQ003"));
});

test("starter issue referenced by an open pull request fails with SQ004", () => {
  const pullRequestUrl = "https://github.com/example/project/pull/42";
  const result = auditIssue(issue({
    open_pull_requests: [
      {
        number: 42,
        title: "Fix starter task",
        html_url: pullRequestUrl,
      },
    ],
  }), NOW);

  assert.equal(result.status, "fail");
  const finding = result.findings.find((candidate) => candidate.code === "SQ004");
  assert.ok(finding);
  assert.match(finding.message, new RegExp(pullRequestUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("issue explicitly marked not ready for contributions fails with SQ005", () => {
  const result = auditIssue(issue({
    body: "**This issue is not ready for contributions yet.** Please wait for maintainer review.",
  }), NOW);

  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) => finding.code === "SQ005"));
});

test("contributor saying they are not ready to contribute does not trigger SQ005", () => {
  const result = auditIssue(issue({
    body: "I'm not ready to contribute code, but others are welcome to work on this.",
  }), NOW);

  assert.equal(result.status, "pass");
  assert.ok(!result.findings.some((finding) => finding.code === "SQ005"));
});

test("issue blocked by a GitHub issue dependency fails with SQ006", () => {
  const result = auditIssue(issue({
    issue_dependencies_summary: {
      blocked_by: 1,
      total_blocked_by: 1,
      blocking: 0,
      total_blocking: 0,
    },
  }), NOW);

  assert.equal(result.status, "fail");
  const finding = result.findings.find((candidate) => candidate.code === "SQ006");
  assert.ok(finding);
  assert.equal(finding.message, "Issue is blocked by 1 open GitHub issue dependency");
});

test("SQ006 reports multiple open GitHub issue dependencies", () => {
  const result = auditIssue(issue({
    issue_dependencies_summary: { blocked_by: 3 },
  }), NOW);

  const finding = result.findings.find((candidate) => candidate.code === "SQ006");
  assert.ok(finding);
  assert.equal(finding.message, "Issue is blocked by 3 open GitHub issue dependencies");
});

test("locked starter issue fails with SQ007", () => {
  const result = auditIssue(issue({ locked: true }), NOW);

  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) => finding.code === "SQ007"));
});

test("starter issue on a closed milestone fails with SQ008", () => {
  const result = auditIssue(issue({
    milestone: {
      title: "v0.1",
      state: "closed",
      due_on: "2026-09-01T00:00:00Z",
    },
  }), NOW);

  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((finding) => finding.code === "SQ008"));
  assert.ok(!result.findings.some((finding) => finding.code === "SQ009"));
});

test("starter issue on an overdue open milestone warns with SQ009", () => {
  const result = auditIssue(issue({
    milestone: {
      title: "v0.2",
      state: "open",
      due_on: "2026-10-01T00:00:00Z",
    },
  }), NOW);

  assert.equal(result.status, "warn");
  const finding = result.findings.find((candidate) => candidate.code === "SQ009");
  assert.ok(finding);
  assert.match(finding.message, /2026-10-01/);
});

test("past-due milestone without explicit open state does not trigger SQ009", () => {
  const result = auditIssue(issue({
    milestone: {
      title: "legacy milestone",
      due_on: "2026-10-01T00:00:00Z",
    },
  }), NOW);

  assert.equal(result.status, "pass");
  assert.ok(!result.findings.some((finding) => finding.code === "SQ009"));
});

test("future milestone does not trigger SQ009", () => {
  const result = auditIssue(issue({
    milestone: {
      title: "v0.3",
      state: "open",
      due_on: "2026-11-01T00:00:00Z",
    },
  }), NOW);

  assert.equal(result.status, "pass");
  assert.ok(!result.findings.some((finding) => finding.code === "SQ009"));
});

test("starter issue referenced by a merged pull request fails with SQ010", () => {
  const pullRequestUrl = "https://github.com/example/project/pull/77";
  const result = auditIssue(issue({
    merged_pull_requests: [
      {
        number: 77,
        title: "Implement starter task",
        html_url: pullRequestUrl,
      },
    ],
  }), NOW);

  assert.equal(result.status, "fail");
  const finding = result.findings.find((candidate) => candidate.code === "SQ010");
  assert.ok(finding);
  assert.match(finding.message, new RegExp(pullRequestUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
