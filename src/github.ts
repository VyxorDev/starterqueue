import { DEFAULT_STARTER_LABEL } from "./config.js";
import type { LinkedPullRequest, StarterIssue } from "./types.js";

const GRAPHQL_BATCH_SIZE = 25;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const GRAPHQL_CLOSING_PULL_REQUEST_QUERY = `
  query StarterQueueClosingPullRequests($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Issue {
        number
        closedByPullRequestsReferences(first: 100) {
          nodes {
            number
            title
            url
            state
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

export interface GraphqlClosingPullRequestIssue {
  number: number;
  closedByPullRequestsReferences?: {
    nodes?: Array<{
      number?: number;
      title?: string;
      url?: string;
      state?: string;
    } | null> | null;
    pageInfo?: {
      hasNextPage?: boolean;
    } | null;
  } | null;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface GraphqlNodesData {
  nodes?: Array<GraphqlClosingPullRequestIssue | null> | null;
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableResponse(response: Response): boolean {
  if (RETRYABLE_STATUS_CODES.has(response.status)) return true;

  // GitHub can report secondary rate limiting as 403 with Retry-After.
  return response.status === 403 && response.headers.has("Retry-After");
}

function retryDelayMs(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, RETRY_MAX_DELAY_MS);
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), RETRY_MAX_DELAY_MS);
    }
  }

  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
}

async function requestWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (
        response.ok
        || !isRetryableResponse(response)
        || attempt === MAX_REQUEST_ATTEMPTS - 1
      ) {
        return response;
      }

      await sleep(retryDelayMs(response, attempt));
    } catch (error) {
      if (attempt === MAX_REQUEST_ATTEMPTS - 1) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `GitHub request failed after ${MAX_REQUEST_ATTEMPTS} attempts: ${message}`,
        );
      }

      await sleep(retryDelayMs(undefined, attempt));
    }
  }

  throw new Error("GitHub request failed after exhausting retry attempts.");
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const response = await requestWithRetry(url, { headers: githubHeaders(token) });

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
  const response = await requestWithRetry("https://api.github.com/graphql", {
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

export function extractGraphqlClosingPullRequests(
  issue: GraphqlClosingPullRequestIssue,
): { openPullRequests: LinkedPullRequest[]; hasNextPage: boolean } {
  const pullRequests = new Map<string, LinkedPullRequest>();

  for (const node of issue.closedByPullRequestsReferences?.nodes ?? []) {
    if (!node || node.state !== "OPEN") continue;
    if (typeof node.number !== "number" || !node.title || !node.url) continue;

    pullRequests.set(node.url, {
      number: node.number,
      title: node.title,
      html_url: node.url,
    });
  }

  return {
    openPullRequests: [...pullRequests.values()],
    hasNextPage: issue.closedByPullRequestsReferences?.pageInfo?.hasNextPage === true,
  };
}

async function fetchClosingPullRequestsGraphql(
  issues: StarterIssue[],
  token: string,
): Promise<Map<number, LinkedPullRequest[]>> {
  const withNodeIds = issues.filter(
    (issue): issue is StarterIssue & { node_id: string } => typeof issue.node_id === "string" && issue.node_id.length > 0,
  );

  if (withNodeIds.length !== issues.length) {
    const missing = issues.find((issue) => !issue.node_id);
    throw new Error(`GitHub issue #${missing?.number ?? "unknown"} did not include a node_id required for linked pull request detection.`);
  }

  const references = new Map<number, LinkedPullRequest[]>();

  for (let offset = 0; offset < withNodeIds.length; offset += GRAPHQL_BATCH_SIZE) {
    const batch = withNodeIds.slice(offset, offset + GRAPHQL_BATCH_SIZE);
    const data = await fetchGraphql<GraphqlNodesData>(
      GRAPHQL_CLOSING_PULL_REQUEST_QUERY,
      { ids: batch.map((issue) => issue.node_id) },
      token,
    );

    const returnedIssues = new Set<number>();
    for (const node of data.nodes ?? []) {
      if (!node) continue;
      returnedIssues.add(node.number);
      const extracted = extractGraphqlClosingPullRequests(node);
      if (extracted.hasNextPage) {
        throw new Error(`GitHub returned more than 100 closing pull requests for issue #${node.number}; refusing an incomplete audit.`);
      }
      references.set(node.number, extracted.openPullRequests);
    }

    for (const issue of batch) {
      if (!returnedIssues.has(issue.number)) {
        throw new Error(`GitHub GraphQL did not return closing pull request data for issue #${issue.number}.`);
      }
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

  for (let page = 1; ; page += 1) {
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

  const closingPullRequests = token && issues.length > 0
    ? await fetchClosingPullRequestsGraphql(issues, token)
    : new Map<number, LinkedPullRequest[]>();

  return issues.map((issue) => ({
    ...issue,
    open_pull_requests: closingPullRequests.get(issue.number) ?? [],
  }));
}
