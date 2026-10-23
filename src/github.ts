import { DEFAULT_STARTER_LABEL } from "./config.js";
import type { LinkedPullRequest, StarterIssue } from "./types.js";

const GRAPHQL_BATCH_SIZE = 25;
const GRAPHQL_CROSS_REFERENCE_QUERY = `
  query StarterQueueCrossReferences($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Issue {
        number
        timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                __typename
                ... on PullRequest {
                  number
                  title
                  url
                  state
                  mergedAt
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    }
  }
`;

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

export interface GraphqlCrossReferenceIssue {
  number: number;
  timelineItems?: {
    nodes?: Array<{
      source?: {
        __typename?: string;
        number?: number;
        title?: string;
        url?: string;
        state?: string;
        mergedAt?: string | null;
      } | null;
    } | null> | null;
    pageInfo?: {
      hasNextPage?: boolean;
    } | null;
  } | null;
}

interface PullRequestReferences {
  openPullRequests: LinkedPullRequest[];
  mergedPullRequests: LinkedPullRequest[];
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface GraphqlNodesData {
  nodes?: Array<GraphqlCrossReferenceIssue | null> | null;
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

async function fetchGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API returned ${response.status}.`);
  }

  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors?.length) {
    const message = payload.errors[0]?.message ?? "Unknown GraphQL error";
    throw new Error(`GitHub GraphQL API error: ${message}`);
  }
  if (!payload.data) {
    throw new Error("GitHub GraphQL API returned no data.");
  }

  return payload.data;
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

export function extractGraphqlPullRequestReferences(
  issue: GraphqlCrossReferenceIssue,
): PullRequestReferences & { hasNextPage: boolean; requiresRestFallback: boolean } {
  const openPullRequests = new Map<string, LinkedPullRequest>();
  const mergedPullRequests = new Map<string, LinkedPullRequest>();
  let requiresRestFallback = false;

  for (const node of issue.timelineItems?.nodes ?? []) {
    const source = node?.source;

    // Cross-reference sources can be hidden from an installation-scoped token.
    // In that case REST preserves the pre-GraphQL behavior and avoids false negatives.
    if (!source) {
      requiresRestFallback = true;
      continue;
    }

    if (!source.__typename) {
      requiresRestFallback = true;
      continue;
    }

    if (source.__typename !== "PullRequest") continue;

    if (
      typeof source.number !== "number"
      || !source.title
      || !source.url
    ) {
      requiresRestFallback = true;
      continue;
    }

    const pullRequest: LinkedPullRequest = {
      number: source.number,
      title: source.title,
      html_url: source.url,
    };

    if (source.state === "OPEN") {
      openPullRequests.set(pullRequest.html_url, pullRequest);
    }
    if (source.mergedAt) {
      mergedPullRequests.set(pullRequest.html_url, pullRequest);
    }
  }

  return {
    openPullRequests: [...openPullRequests.values()],
    mergedPullRequests: [...mergedPullRequests.values()],
    hasNextPage: issue.timelineItems?.pageInfo?.hasNextPage === true,
    requiresRestFallback,
  };
}

async function fetchPullRequestReferencesRest(
  repo: RepoRef,
  issueNumber: number,
  token?: string,
): Promise<PullRequestReferences> {
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

async function fetchPullRequestReferencesGraphql(
  issues: StarterIssue[],
  token: string,
): Promise<Map<number, PullRequestReferences>> {
  const references = new Map<number, PullRequestReferences>();
  const withNodeIds = issues.filter(
    (issue): issue is StarterIssue & { node_id: string } => typeof issue.node_id === "string" && issue.node_id.length > 0,
  );

  for (let offset = 0; offset < withNodeIds.length; offset += GRAPHQL_BATCH_SIZE) {
    const batch = withNodeIds.slice(offset, offset + GRAPHQL_BATCH_SIZE);

    try {
      const data = await fetchGraphql<GraphqlNodesData>(
        GRAPHQL_CROSS_REFERENCE_QUERY,
        { ids: batch.map((issue) => issue.node_id) },
        token,
      );

      for (const node of data.nodes ?? []) {
        if (!node) continue;
        const extracted = extractGraphqlPullRequestReferences(node);
        if (extracted.hasNextPage || extracted.requiresRestFallback) continue;
        references.set(node.number, {
          openPullRequests: extracted.openPullRequests,
          mergedPullRequests: extracted.mergedPullRequests,
        });
      }
    } catch {
      // Keep successful earlier batches. Issues from this batch simply fall back to REST.
      continue;
    }
  }

  return references;
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

  const graphqlReferences = token && issues.length > 0
    ? await fetchPullRequestReferencesGraphql(issues, token)
    : new Map<number, PullRequestReferences>();

  const enriched: StarterIssue[] = [];
  for (const issue of issues) {
    const references = graphqlReferences.get(issue.number)
      ?? await fetchPullRequestReferencesRest(repo, issue.number, token);
    enriched.push({
      ...issue,
      open_pull_requests: references.openPullRequests,
      merged_pull_requests: references.mergedPullRequests,
    });
  }

  return enriched;
}
