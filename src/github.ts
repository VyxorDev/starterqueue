import { DEFAULT_STARTER_LABEL } from "./config.js";
import type { LinkedPullRequest, StarterIssue } from "./types.js";

export interface RepoRef {
  owner: string;
  name: string;
}

export interface FetchStarterIssuesOptions {
  label?: string;
  token?: string;
}

export interface TimelineEvent {
  event?: string;
  source?: {
    issue?: {
      number?: number;
      title?: string;
      html_url?: string;
      state?: string;
      pull_request?: {
        merged_at?: string | null;
      };
    };
  };
}

export function parseRepo(input: string): RepoRef {
  let value = input.trim();

  if (value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value);
    if (url.hostname !== "github.com") {
      throw new Error("Repository URL must point to github.com");
    }
    value = url.pathname.replace(/^\/+|\/+$/g, "");
  }

  const parts = value.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Repository must be in owner/repo form or a GitHub repository URL");
  }

  const [owner, name] = parts;
  return { owner, name: name.replace(/\.git$/, "") };
}

function githubHeaders(token?: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders(token) });

  if (!response.ok) {
    const hint = response.status === 403
      ? " GitHub may have rate-limited the request; set GH_TOKEN and retry."
      : "";
    throw new Error(`GitHub API returned ${response.status}.${hint}`);
  }

  return (await response.json()) as T;
}

function linkedPullRequestFromEvent(event: TimelineEvent): LinkedPullRequest | null {
  if (event.event !== "cross-referenced") return null;

  const source = event.source?.issue;
  if (!source?.pull_request) return null;
  if (typeof source.number !== "number" || !source.title || !source.html_url) return null;

  return {
    number: source.number,
    title: source.title,
    html_url: source.html_url,
  };
}

export function extractOpenPullRequests(events: TimelineEvent[]): LinkedPullRequest[] {
  const pullRequests = new Map<string, LinkedPullRequest>();

  for (const event of events) {
    if (event.source?.issue?.state !== "open") continue;
    const pullRequest = linkedPullRequestFromEvent(event);
    if (!pullRequest) continue;
    pullRequests.set(pullRequest.html_url, pullRequest);
  }

  return [...pullRequests.values()];
}

export function extractMergedPullRequests(events: TimelineEvent[]): LinkedPullRequest[] {
  const pullRequests = new Map<string, LinkedPullRequest>();

  for (const event of events) {
    if (!event.source?.issue?.pull_request?.merged_at) continue;
    const pullRequest = linkedPullRequestFromEvent(event);
    if (!pullRequest) continue;
    pullRequests.set(pullRequest.html_url, pullRequest);
  }

  return [...pullRequests.values()];
}

async function fetchPullRequestReferences(
  repo: RepoRef,
  issueNumber: number,
  token?: string,
): Promise<{
  openPullRequests: LinkedPullRequest[];
  mergedPullRequests: LinkedPullRequest[];
}> {
  const events: TimelineEvent[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({ per_page: "100", page: String(page) });
    const pageEvents = await fetchJson<TimelineEvent[]>(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/issues/${issueNumber}/timeline?${params}`,
      token,
    );

    events.push(...pageEvents);
    if (pageEvents.length < 100) break;
  }

  return {
    openPullRequests: extractOpenPullRequests(events),
    mergedPullRequests: extractMergedPullRequests(events),
  };
}

export async function fetchStarterIssues(
  repo: RepoRef,
  options: FetchStarterIssuesOptions = {},
): Promise<StarterIssue[]> {
  const issues: StarterIssue[] = [];
  const label = options.label ?? DEFAULT_STARTER_LABEL;
  const token = options.token ?? process.env.GH_TOKEN;

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      state: "open",
      labels: label,
      per_page: "100",
      page: String(page),
    });

    const pageItems = await fetchJson<StarterIssue[]>(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/issues?${params}`,
      token,
    );

    issues.push(...pageItems.filter((issue) => !issue.pull_request));
    if (pageItems.length < 100) break;
  }

  const enriched: StarterIssue[] = [];
  for (const issue of issues) {
    const references = await fetchPullRequestReferences(repo, issue.number, token);
    enriched.push({
      ...issue,
      open_pull_requests: references.openPullRequests,
      merged_pull_requests: references.mergedPullRequests,
    });
  }

  return enriched;
}
