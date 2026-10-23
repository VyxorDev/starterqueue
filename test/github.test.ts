import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMergedPullRequests,
  extractOpenPullRequests,
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
