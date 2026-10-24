import { DEFAULT_STALE_DAYS } from "./config.js";
import {
  DEFAULT_AUDIT_POLICY,
  findingLevel,
  type AuditPolicy,
  type AuditRuleCode,
} from "./policy.js";
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
  policy?: AuditPolicy;
}

function normalizeLabel(label: GitHubLabel): string {
  if (typeof label === "string") return label.trim().toLowerCase();
  return (label.name ?? "").trim().toLowerCase();
}

function explicitlySaysNotReady(body: string | null | undefined): boolean {
  return typeof body === "string" && EXPLICIT_NOT_READY_PATTERN.test(body);
}

function finding(
  code: AuditRuleCode,
  message: string,
  policy: AuditPolicy,
): Finding {
  return {
    code,
    level: findingLevel(code, policy),
    message,
  };
}

export function auditIssue(
  issue: StarterIssue,
  now = new Date(),
  options: AuditOptions = {},
): AuditedIssue {
  const findings: Finding[] = [];
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const policy = options.policy ?? DEFAULT_AUDIT_POLICY;

  if (issue.assignees.length > 0) {
    findings.push(finding("SQ001", "Issue is already assigned", policy));
  }

  const labels = issue.labels.map(normalizeLabel);
  if (labels.some((label) => BLOCKED_LABELS.has(label))) {
    findings.push(finding("SQ002", "Issue is marked as blocked or waiting", policy));
  }

  const updatedAt = new Date(issue.updated_at);
  const ageMs = now.getTime() - updatedAt.getTime();
  const ageDays = Number.isFinite(ageMs) ? Math.floor(ageMs / 86_400_000) : 0;

  if (ageDays >= staleDays) {
    findings.push(finding("SQ003", `No activity for ${ageDays} days`, policy));
  }

  const openPullRequests = issue.open_pull_requests ?? [];
  if (openPullRequests.length > 0) {
    const refs = openPullRequests.map((pullRequest) => pullRequest.html_url).join(", ");
    findings.push(finding(
      "SQ004",
      openPullRequests.length === 1
        ? `Open pull request ${refs} is linked to close this issue`
        : `Open pull requests ${refs} are linked to close this issue`,
      policy,
    ));
  }

  if (explicitlySaysNotReady(issue.body)) {
    findings.push(finding(
      "SQ005",
      "Issue text explicitly says it is not ready for contributions",
      policy,
    ));
  }

  const blockedBy = issue.issue_dependencies_summary?.blocked_by ?? 0;
  if (blockedBy > 0) {
    findings.push(finding(
      "SQ006",
      blockedBy === 1
        ? "Issue is blocked by 1 open GitHub issue dependency"
        : `Issue is blocked by ${blockedBy} open GitHub issue dependencies`,
      policy,
    ));
  }

  if (issue.locked) {
    findings.push(finding("SQ007", "Issue conversation is locked", policy));
  }

  const milestone = issue.milestone;
  if (milestone?.state === "closed") {
    findings.push(finding(
      "SQ008",
      `Issue belongs to closed milestone "${milestone.title}"`,
      policy,
    ));
  } else if (milestone?.state === "open" && milestone.due_on) {
    const dueOn = new Date(milestone.due_on);
    if (Number.isFinite(dueOn.getTime()) && dueOn.getTime() < now.getTime()) {
      findings.push(finding(
        "SQ009",
        `Milestone "${milestone.title}" is past due (due ${dueOn.toISOString().slice(0, 10)})`,
        policy,
      ));
    }
  }

  const status = findings.some((candidate) => candidate.level === "fail")
    ? "fail"
    : findings.some((candidate) => candidate.level === "warn")
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
