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
    assignees: [],
    updated_at: "2026-10-20T00:00:00Z",
    labels: [{ name: "good first issue" }],
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
