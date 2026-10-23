import assert from "node:assert/strict";
import test from "node:test";
import { auditExitCode, EXIT_AUDIT_THRESHOLD, EXIT_OK } from "../src/exit.js";
import type { AuditedIssue, AuditStatus } from "../src/types.js";

function result(status: AuditStatus): AuditedIssue {
  return {
    issue: {
      number: 1,
      title: "Starter task",
      html_url: "https://github.com/example/project/issues/1",
      assignees: [],
      updated_at: "2026-10-23T00:00:00Z",
      labels: [{ name: "good first issue" }],
    },
    status,
    findings: [],
  };
}

test("default CI policy never fails on audit findings", () => {
  assert.equal(auditExitCode([result("fail")], "none"), EXIT_OK);
});

test("fail threshold exits 2 only for failing findings", () => {
  assert.equal(auditExitCode([result("warn")], "fail"), EXIT_OK);
  assert.equal(auditExitCode([result("fail")], "fail"), EXIT_AUDIT_THRESHOLD);
});

test("warn threshold exits 2 for warnings or failures", () => {
  assert.equal(auditExitCode([result("warn")], "warn"), EXIT_AUDIT_THRESHOLD);
  assert.equal(auditExitCode([result("fail")], "warn"), EXIT_AUDIT_THRESHOLD);
});
