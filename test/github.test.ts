import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGraphqlPullRequestReferences,
  extractMergedPullRequests,
  extractOpenPullRequests,
  type GraphqlCrossReferenceIssue,
  type TimelineEvent,
} from "../src/github.js";

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
