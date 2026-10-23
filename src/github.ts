import type { StarterIssue } from "./types.js";

export interface RepoRef {
  owner: string;
  name: string;
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

export async function fetchStarterIssues(
  repo: RepoRef,
  token = process.env.GH_TOKEN,
): Promise<StarterIssue[]> {
  const issues: StarterIssue[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      state: "open",
      labels: "good first issue",
      per_page: "100",
      page: String(page),
    });

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/issues?${params}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );

    if (!response.ok) {
      const hint = response.status === 403
        ? " GitHub may have rate-limited the request; set GH_TOKEN and retry."
        : "";
      throw new Error(`GitHub API returned ${response.status}.${hint}`);
    }

    const pageItems = (await response.json()) as StarterIssue[];
    issues.push(...pageItems.filter((issue) => !issue.pull_request));

    if (pageItems.length < 100) break;
  }

  return issues;
}
