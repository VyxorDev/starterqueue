import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGraphqlClosingPullRequests,
  fetchStarterIssues,
  type GraphqlClosingPullRequestIssue,
} from "../src/github.js";
import type { StarterIssue } from "../src/types.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
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
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
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
    if (originalToken === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = originalToken;
  }
});

test("authenticated audits use GitHub closing PR links for SQ004 data", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
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

test("authenticated audits fail rather than return incomplete closing-link data", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

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
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

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
