import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGraphqlClosingPullRequests,
  fetchStarterIssues,
  type GraphqlClosingPullRequestIssue,
} from "../src/github.js";
import type { StarterIssue } from "../src/types.js";

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function issue(number = 1): StarterIssue {
  return {
    number,
    node_id: `I_${number}`,
    title: `Starter task ${number}`,
    html_url: `https://github.com/example/project/issues/${number}`,
    body: null,
    assignees: [],
    updated_at: "2026-10-23T00:00:00Z",
    labels: [{ name: "good first issue" }],
  };
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function restoreToken(originalToken: string | undefined): void {
  if (originalToken === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = originalToken;
}

test("GraphQL closing-link extraction keeps only open PRs and deduplicates them", () => {
  const linkedIssue: GraphqlClosingPullRequestIssue = {
    number: 7,
    closedByPullRequestsReferences: {
      nodes: [
        {
          number: 51,
          title: "Open closing PR",
          url: "https://github.com/example/project/pull/51",
          state: "OPEN",
        },
        {
          number: 51,
          title: "Open closing PR",
          url: "https://github.com/example/project/pull/51",
          state: "OPEN",
        },
        {
          number: 52,
          title: "Closed PR",
          url: "https://github.com/example/project/pull/52",
          state: "CLOSED",
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  };

  const references = extractGraphqlClosingPullRequests(linkedIssue);
  assert.deepEqual(references.openPullRequests.map((pullRequest) => pullRequest.number), [51]);
  assert.equal(references.hasNextPage, false);
});

test("GraphQL closing-link extraction exposes incomplete pages", () => {
  const linkedIssue: GraphqlClosingPullRequestIssue = {
    number: 8,
    closedByPullRequestsReferences: {
      nodes: [],
      pageInfo: { hasNextPage: true },
    },
  };

  assert.equal(extractGraphqlClosingPullRequests(linkedIssue).hasNextPage, true);
});

test("tokenless audits do not guess pull request links from REST timelines", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GH_TOKEN;
  delete process.env.GH_TOKEN;
  const requests: string[] = [];

  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);

    if (url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      return jsonResponse([issue()]);
    }

    throw new Error(`Unexpected tokenless request: ${url}`);
  };

  try {
    const results = await fetchStarterIssues({ owner: "example", name: "project" });
    assert.equal(results.length, 1);
    assert.deepEqual(results[0]?.open_pull_requests, []);
    assert.equal(requests.length, 1);
    assert.ok(!requests.some((url) => url.includes("/timeline")));
    assert.ok(!requests.some((url) => url.endsWith("/graphql")));
  } finally {
    globalThis.fetch = originalFetch;
    restoreToken(originalToken);
  }
});

test("REST pagination continues beyond ten full pages", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GH_TOKEN;
  delete process.env.GH_TOKEN;
  const requestedPages: number[] = [];

  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (!url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      throw new Error(`Unexpected pagination request: ${url}`);
    }

    const page = Number(new URL(url).searchParams.get("page"));
    requestedPages.push(page);

    if (page <= 11) {
      const start = (page - 1) * 100 + 1;
      return jsonResponse(Array.from({ length: 100 }, (_, index) => issue(start + index)));
    }

    if (page === 12) return jsonResponse([issue(1101)]);
    throw new Error(`Unexpected page ${page}`);
  };

  try {
    const results = await fetchStarterIssues({ owner: "example", name: "project" });
    assert.equal(results.length, 1101);
    assert.deepEqual(requestedPages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(results.at(-1)?.number, 1101);
  } finally {
    globalThis.fetch = originalFetch;
    restoreToken(originalToken);
  }
});

test("REST requests retry transient GitHub failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GH_TOKEN;
  delete process.env.GH_TOKEN;
  let attempts = 0;

  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (!url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      throw new Error(`Unexpected retry request: ${url}`);
    }

    attempts += 1;
    if (attempts === 1) {
      return jsonResponse(
        { message: "Service unavailable" },
        503,
        { "Retry-After": "0" },
      );
    }

    return jsonResponse([issue()]);
  };

  try {
    const results = await fetchStarterIssues({ owner: "example", name: "project" });
    assert.equal(results.length, 1);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreToken(originalToken);
  }
});

test("REST requests do not retry permanent client failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GH_TOKEN;
  delete process.env.GH_TOKEN;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    return jsonResponse({ message: "Not Found" }, 404);
  };

  try {
    await assert.rejects(
      () => fetchStarterIssues({ owner: "example", name: "project" }),
      /GitHub API returned 404/,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreToken(originalToken);
  }
});

test("authenticated audits use GitHub closing PR links for SQ004 data", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push(url);

    if (url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      return jsonResponse([issue()]);
    }

    if (url === "https://api.github.com/graphql") {
      const body = JSON.parse(String(init?.body)) as { query?: string };
      assert.match(body.query ?? "", /closedByPullRequestsReferences/);
      assert.ok(!(body.query ?? "").includes("timelineItems"));
      return jsonResponse({
        data: {
          nodes: [
            {
              number: 1,
              closedByPullRequestsReferences: {
                nodes: [
                  {
                    number: 42,
                    title: "Fix starter task",
                    url: "https://github.com/example/project/pull/42",
                    state: "OPEN",
                  },
                ],
                pageInfo: { hasNextPage: false },
              },
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected authenticated request: ${url}`);
  };

  try {
    const results = await fetchStarterIssues(
      { owner: "example", name: "project" },
      { token: "test-token" },
    );

    assert.equal(results.length, 1);
    assert.deepEqual(results[0]?.open_pull_requests?.map((pullRequest) => pullRequest.number), [42]);
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GraphQL requests retry transient GitHub failures", async () => {
  const originalFetch = globalThis.fetch;
  let graphqlAttempts = 0;

  globalThis.fetch = async (input) => {
    const url = requestUrl(input);

    if (url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      return jsonResponse([issue()]);
    }

    if (url === "https://api.github.com/graphql") {
      graphqlAttempts += 1;
      if (graphqlAttempts === 1) {
        return jsonResponse(
          { message: "Bad gateway" },
          502,
          { "Retry-After": "0" },
        );
      }

      return jsonResponse({
        data: {
          nodes: [
            {
              number: 1,
              closedByPullRequestsReferences: {
                nodes: [],
                pageInfo: { hasNextPage: false },
              },
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected GraphQL retry request: ${url}`);
  };

  try {
    const results = await fetchStarterIssues(
      { owner: "example", name: "project" },
      { token: "test-token" },
    );
    assert.equal(results.length, 1);
    assert.equal(graphqlAttempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated audits fail rather than return incomplete closing-link data", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = requestUrl(input);

    if (url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      return jsonResponse([issue()]);
    }

    if (url === "https://api.github.com/graphql") {
      return jsonResponse({
        data: {
          nodes: [
            {
              number: 1,
              closedByPullRequestsReferences: {
                nodes: [],
                pageInfo: { hasNextPage: true },
              },
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await assert.rejects(
      () => fetchStarterIssues(
        { owner: "example", name: "project" },
        { token: "test-token" },
      ),
      /more than 100 closing pull requests/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated audits require node IDs instead of silently skipping SQ004", async () => {
  const originalFetch = globalThis.fetch;
  const missingNodeId = issue();
  delete missingNodeId.node_id;

  globalThis.fetch = async (input) => {
    const url = requestUrl(input);

    if (url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      return jsonResponse([missingNodeId]);
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await assert.rejects(
      () => fetchStarterIssues(
        { owner: "example", name: "project" },
        { token: "test-token" },
      ),
      /did not include a node_id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("abort stops GitHub retries immediately", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    controller.abort();
    throw new Error("request aborted");
  };

  try {
    await assert.rejects(
      () => fetchStarterIssues(
        { owner: "example", name: "project" },
        { signal: controller.signal, token: "" },
      ),
      /request aborted/,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
