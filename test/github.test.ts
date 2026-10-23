import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGraphqlPullRequestReferences,
  extractMergedPullRequests,
  extractOpenPullRequests,
  fetchStarterIssues,
  type GraphqlCrossReferenceIssue,
  type TimelineEvent,
} from "../src/github.js";
import type { StarterIssue } from "../src/types.js";

const events: TimelineEvent[] = [
  {
    event: "cross-referenced",
    source: {
      issue: {
        number: 41,
        title: "Open PR",
        html_url: "https://github.com/example/project/pull/41",
        state: "open",
        pull_request: { merged_at: null },
      },
    },
  },
  {
    event: "cross-referenced",
    source: {
      issue: {
        number: 42,
        title: "Merged PR",
        html_url: "https://github.com/example/project/pull/42",
        state: "closed",
        pull_request: { merged_at: "2026-10-20T00:00:00Z" },
      },
    },
  },
  {
    event: "cross-referenced",
    source: {
      issue: {
        number: 43,
        title: "Closed unmerged PR",
        html_url: "https://github.com/example/project/pull/43",
        state: "closed",
        pull_request: { merged_at: null },
      },
    },
  },
  {
    event: "cross-referenced",
    source: {
      issue: {
        number: 42,
        title: "Merged PR",
        html_url: "https://github.com/example/project/pull/42",
        state: "closed",
        pull_request: { merged_at: "2026-10-20T00:00:00Z" },
      },
    },
  },
  {
    event: "commented",
    source: {
      issue: {
        number: 44,
        title: "Not a cross-reference",
        html_url: "https://github.com/example/project/pull/44",
        state: "open",
        pull_request: { merged_at: null },
      },
    },
  },
];

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("timeline extraction separates open and merged pull requests", () => {
  assert.deepEqual(extractOpenPullRequests(events).map((pullRequest) => pullRequest.number), [41]);
  assert.deepEqual(extractMergedPullRequests(events).map((pullRequest) => pullRequest.number), [42]);
});

test("closed unmerged pull requests are ignored", () => {
  assert.ok(!extractMergedPullRequests(events).some((pullRequest) => pullRequest.number === 43));
});

test("GraphQL extraction separates and deduplicates open and merged references", () => {
  const issue: GraphqlCrossReferenceIssue = {
    number: 7,
    timelineItems: {
      nodes: [
        {
          source: {
            __typename: "PullRequest",
            number: 51,
            title: "Open GraphQL PR",
            url: "https://github.com/example/project/pull/51",
            state: "OPEN",
            mergedAt: null,
          },
        },
        {
          source: {
            __typename: "PullRequest",
            number: 52,
            title: "Merged GraphQL PR",
            url: "https://github.com/example/project/pull/52",
            state: "MERGED",
            mergedAt: "2026-10-22T00:00:00Z",
          },
        },
        {
          source: {
            __typename: "PullRequest",
            number: 52,
            title: "Merged GraphQL PR",
            url: "https://github.com/example/project/pull/52",
            state: "MERGED",
            mergedAt: "2026-10-22T00:00:00Z",
          },
        },
        {
          source: {
            __typename: "PullRequest",
            number: 53,
            title: "Closed unmerged GraphQL PR",
            url: "https://github.com/example/project/pull/53",
            state: "CLOSED",
            mergedAt: null,
          },
        },
        {
          source: {
            __typename: "Issue",
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  };

  const references = extractGraphqlPullRequestReferences(issue);
  assert.deepEqual(references.openPullRequests.map((pullRequest) => pullRequest.number), [51]);
  assert.deepEqual(references.mergedPullRequests.map((pullRequest) => pullRequest.number), [52]);
  assert.equal(references.hasNextPage, false);
  assert.equal(references.requiresRestFallback, false);
});

test("GraphQL extraction exposes incomplete timelines for REST fallback", () => {
  const issue: GraphqlCrossReferenceIssue = {
    number: 8,
    timelineItems: {
      nodes: [],
      pageInfo: { hasNextPage: true },
    },
  };

  assert.equal(extractGraphqlPullRequestReferences(issue).hasNextPage, true);
});

test("hidden GraphQL cross-reference sources require REST fallback", () => {
  const issue: GraphqlCrossReferenceIssue = {
    number: 9,
    timelineItems: {
      nodes: [{ source: null }],
      pageInfo: { hasNextPage: false },
    },
  };

  const references = extractGraphqlPullRequestReferences(issue);
  assert.equal(references.requiresRestFallback, true);
  assert.deepEqual(references.openPullRequests, []);
  assert.deepEqual(references.mergedPullRequests, []);
});

test("GraphQL cross-reference sources without a type require REST fallback", () => {
  const issue: GraphqlCrossReferenceIssue = {
    number: 10,
    timelineItems: {
      nodes: [
        {
          source: {
            number: 54,
            title: "Ambiguous source",
            url: "https://github.com/example/project/pull/54",
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  };

  assert.equal(extractGraphqlPullRequestReferences(issue).requiresRestFallback, true);
});

test("successful GraphQL batches are preserved when a later batch fails", async () => {
  const originalFetch = globalThis.fetch;
  const starterIssues: StarterIssue[] = Array.from({ length: 26 }, (_, index) => ({
    number: index + 1,
    node_id: `I_${index + 1}`,
    title: `Starter task ${index + 1}`,
    html_url: `https://github.com/example/project/issues/${index + 1}`,
    body: null,
    assignees: [],
    updated_at: "2026-10-23T00:00:00Z",
    labels: [{ name: "good first issue" }],
  }));

  let graphqlCalls = 0;
  const restTimelineIssues: number[] = [];

  globalThis.fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.startsWith("https://api.github.com/repos/example/project/issues?")) {
      return jsonResponse(starterIssues);
    }

    if (url === "https://api.github.com/graphql") {
      graphqlCalls += 1;
      if (graphqlCalls === 1) {
        return jsonResponse({
          data: {
            nodes: starterIssues.slice(0, 25).map((issue) => ({
              number: issue.number,
              timelineItems: {
                nodes: [],
                pageInfo: { hasNextPage: false },
              },
            })),
          },
        });
      }
      return new Response("batch failed", { status: 500 });
    }

    const timelineMatch = url.match(/\/issues\/(\d+)\/timeline/);
    if (timelineMatch) {
      restTimelineIssues.push(Number(timelineMatch[1]));
      return jsonResponse([]);
    }

    throw new Error(`Unexpected request in test: ${url}`);
  };

  try {
    const results = await fetchStarterIssues(
      { owner: "example", name: "project" },
      { token: "test-token" },
    );

    assert.equal(results.length, 26);
    assert.equal(graphqlCalls, 2);
    assert.deepEqual(restTimelineIssues, [26]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
