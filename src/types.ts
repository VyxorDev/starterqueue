export type GitHubLabel = string | { name?: string | null };

export interface LinkedPullRequest {
  number: number;
  title: string;
  html_url: string;
}

export interface IssueDependenciesSummary {
  blocked_by?: number;
  total_blocked_by?: number;
  blocking?: number;
  total_blocking?: number;
}

export interface GitHubMilestone {
  title: string;
  state?: string;
  due_on?: string | null;
  html_url?: string;
}

export interface StarterIssue {
  number: number;
  node_id?: string;
  title: string;
  html_url: string;
  body?: string | null;
  assignees: unknown[];
  updated_at: string;
  labels: GitHubLabel[];
  locked?: boolean;
  milestone?: GitHubMilestone | null;
  issue_dependencies_summary?: IssueDependenciesSummary;
  open_pull_requests?: LinkedPullRequest[];
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
