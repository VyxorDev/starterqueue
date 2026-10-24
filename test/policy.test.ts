import assert from "node:assert/strict";
import test from "node:test";
import { auditIssue } from "../src/audit.js";
import { findingLevel } from "../src/policy.js";
import type { StarterIssue } from "../src/types.js";

const NOW = new Date("2026-10-24T00:00:00Z");

function issue(overrides: Partial<StarterIssue> = {}): StarterIssue {
  return {
    number: 1,
    title: "Starter task",
    html_url: "https://github.com/example/project/issues/1",
    body: null,
    assignees: [],
    updated_at: "2026-10-24T00:00:00Z",
    labels: [{ name: "good first issue" }],
    locked: false,
    milestone: null,
    open_pull_requests: [],
    ...overrides,
  };
}

test("per-rule overrides take precedence over balanced policy", () => {
  assert.equal(findingLevel("SQ001", "balanced", { SQ001: "fail" }), "fail");
  assert.equal(findingLevel("SQ009", "balanced", { SQ009: "fail" }), "fail");
});

test("per-rule overrides take precedence over strict policy", () => {
  assert.equal(findingLevel("SQ001", "strict", { SQ001: "warn" }), "warn");
  assert.equal(findingLevel("SQ006", "strict", { SQ006: "warn" }), "warn");
});

test("unrelated rules keep their policy severity", () => {
  assert.equal(findingLevel("SQ002", "balanced", { SQ001: "fail" }), "fail");
  assert.equal(findingLevel("SQ003", "strict", { SQ006: "warn" }), "warn");
});

test("audit status reflects an overridden finding severity", () => {
  const result = auditIssue(
    issue({ assignees: [{ login: "dev" }] }),
    NOW,
    { policy: "balanced", ruleLevels: { SQ001: "fail" } },
  );

  assert.equal(result.status, "fail");
  assert.equal(result.findings[0]?.code, "SQ001");
  assert.equal(result.findings[0]?.level, "fail");
});

test("strict policy can soften one rule without changing detection", () => {
  const result = auditIssue(
    issue({ issue_dependencies_summary: { blocked_by: 1 } }),
    NOW,
    { policy: "strict", ruleLevels: { SQ006: "warn" } },
  );

  assert.equal(result.status, "warn");
  assert.equal(result.findings[0]?.code, "SQ006");
  assert.equal(result.findings[0]?.level, "warn");
});
