import { DEFAULT_STALE_DAYS } from "./config.js";
import type { AuditedIssue, Finding, GitHubLabel, StarterIssue } from "./types.js";

const BLOCKED_LABELS = new Set([
  "blocked",
  "status: blocked",
  "waiting",
  "on hold",
  "on-hold",
]);

const EXPLICIT_NOT_READY_PATTERN = /\bnot\s+ready\s+for\s+contributions?\b/i;

export interface AuditOptions {
  staleDays?: number;
}

function normalizeLabel(label: GitHubLabel): string {
  if (typeof label === "string") return label.trim().toLowerCase();
  return (label.name ?? "").trim().toLowerCase();
}

function explicitlySaysNotReady(body: string | null | undefined): boolean {
  return typeof body === "string" && EXPLICIT_NOT_READY_PATTERN.test(body);
}

export function auditIssue(
  issue: StarterIssue,
  now = new Date(),
  options: AuditOptions = {},
): AuditedIssue {
  const findings: Finding[] = [];
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;

  if (issue.assignees.length > 0) {
    findings.push({
      code: "SQ001",
      level: "fail",
      message: "Issue is already assigned",
    });
  }

  const labels = issue.labels.map(normalizeLabel);
  if (labels.some((label) => BLOCKED_LABELS.has(label))) {
    findings.push({
      code: "SQ002",
      level: "fail",
      message: "Issue is marked as blocked or waiting",
    });
  }

  const updatedAt = new Date(issue.updated_at);
  const ageMs = now.getTime() - updatedAt.getTime();
  const ageDays = Number.isFinite(ageMs) ? Math.floor(ageMs / 86_400_000) : 0;

  if (ageDays >= staleDays) {
    findings.push({
      code: "SQ003",
      level: "warn",
      message: `No activity for ${ageDays} days`,
    });
  }

  const openPullRequests = issue.open_pull_requests ?? [];
  if (openPullRequests.length > 0) {
    const refs = openPullRequests.map((pullRequest) => pullRequest.html_url).join(", ");
    findings.push({
      code: "SQ004",
      level: "fail",
      message: openPullRequests.length === 1
        ? `Open pull request ${refs} references this issue`
        : `Open pull requests ${refs} reference this issue`,
    });
  }

  if (explicitlySaysNotReady(issue.body)) {
    findings.push({
      code: "SQ005",
      level: "fail",
      message: "Issue text explicitly says it is not ready for contributions",
    });
  }

  const blockedBy = issue.issue_dependencies_summary?.blocked_by ?? 0;
  if (blockedBy > 0) {
    findings.push({
      code: "SQ006",
      level: "fail",
      message: blockedBy === 1
        ? "Issue is blocked by 1 open GitHub issue dependency"
        : `Issue is blocked by ${blockedBy} open GitHub issue dependencies`,
    });
  }

  const status = findings.some((finding) => finding.level === "fail")
    ? "fail"
    : findings.some((finding) => finding.level === "warn")
      ? "warn"
      : "pass";

  return { issue, status, findings };
}

export function auditIssues(
  issues: StarterIssue[],
  now = new Date(),
  options: AuditOptions = {},
): AuditedIssue[] {
  return issues.map((issue) => auditIssue(issue, now, options));
}
