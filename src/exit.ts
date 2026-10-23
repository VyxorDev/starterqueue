import type { FailOn } from "./args.js";
import type { AuditedIssue } from "./types.js";

export const EXIT_OK = 0;
export const EXIT_TOOL_ERROR = 1;
export const EXIT_AUDIT_THRESHOLD = 2;

export function auditThresholdViolated(results: AuditedIssue[], failOn: FailOn): boolean {
  if (failOn === "none") return false;
  if (failOn === "fail") return results.some((result) => result.status === "fail");
  return results.some((result) => result.status === "warn" || result.status === "fail");
}

export function auditExitCode(results: AuditedIssue[], failOn: FailOn): number {
  return auditThresholdViolated(results, failOn) ? EXIT_AUDIT_THRESHOLD : EXIT_OK;
}
