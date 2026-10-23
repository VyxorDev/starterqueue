export type GitHubLabel = string | { name?: string | null };

export interface StarterIssue {
  number: number;
  title: string;
  html_url: string;
  assignees: unknown[];
  updated_at: string;
  labels: GitHubLabel[];
  pull_request?: unknown;
}

export type FindingLevel = "fail" | "warn";

export interface Finding {
  code: string;
  level: FindingLevel;
  message: string;
}

export type AuditStatus = "pass" | "warn" | "fail";

export interface AuditedIssue {
  issue: StarterIssue;
  status: AuditStatus;
  findings: Finding[];
}
