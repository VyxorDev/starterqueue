import assert from "node:assert/strict";
import test from "node:test";
import { createJsonOutput, JSON_SCHEMA_VERSION } from "../src/output.js";
import type { AuditedIssue } from "../src/types.js";

const results: AuditedIssue[] = [
  {
    issue: {
      number: 1,
      title: "Clean starter task",
      html_url: "https://github.com/example/project/issues/1",
      assignees: [],
      updated_at: "2026-10-23T00:00:00Z",
      labels: [{ name: "good first issue" }],
    },
    status: "pass",
    findings: [],
  },
  {
    issue: {
      number: 2,
      title: "Stale starter task",
      html_url: "https://github.com/example/project/issues/2",
      assignees: [],
      updated_at: "2026-01-01T00:00:00Z",
      labels: [{ name: "good first issue" }],
    },
    status: "warn",
    findings: [{ code: "SQ003", level: "warn", message: "No activity for 295 days" }],
  },
];

test("JSON output has a stable schema version and summary", () => {
  const output = createJsonOutput(
    "example/project",
    {
      json: true,
      label: "good first issue",
      staleDays: 90,
      failOn: "warn",
      policy: "strict",
      ruleLevels: { SQ009: "fail" },
    },
    results,
  ) as Record<string, unknown>;

  assert.equal(output.schema_version, JSON_SCHEMA_VERSION);
  assert.equal(output.repository, "example/project");
  assert.deepEqual(output.configuration, {
    label: "good first issue",
    stale_days: 90,
    policy: "strict",
    rule_levels: { SQ009: "fail" },
    fail_on: "warn",
  });
  assert.deepEqual(output.summary, {
    total: 2,
    pass: 1,
    warn: 1,
    fail: 0,
  });
  assert.equal((output.results as unknown[]).length, 2);
});
