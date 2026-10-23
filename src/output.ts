import type { AuditCliOptions } from "./args.js";
import type { AuditedIssue } from "./types.js";

export const JSON_SCHEMA_VERSION = 1;

export interface AuditSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
}

export function summarizeAudit(results: AuditedIssue[]): AuditSummary {
  return {
    total: results.length,
    pass: results.filter((result) => result.status === "pass").length,
    warn: results.filter((result) => result.status === "warn").length,
    fail: results.filter((result) => result.status === "fail").length,
  };
}

export function createJsonOutput(
  repository: string,
  options: AuditCliOptions,
  results: AuditedIssue[],
): object {
  return {
    schema_version: JSON_SCHEMA_VERSION,
    repository,
    configuration: {
      label: options.label,
      stale_days: options.staleDays,
      fail_on: options.failOn,
    },
    summary: summarizeAudit(results),
    results,
  };
}
