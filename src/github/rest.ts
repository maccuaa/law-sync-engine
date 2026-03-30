import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "octokit";
import { getConfig } from "../config.js";
import type { IssueParams, PullRequestParams } from "./types.js";

const ThrottledOctokit = Octokit.plugin(retry, throttling);

let _octokit: InstanceType<typeof ThrottledOctokit> | null = null;

function getOctokit(): InstanceType<typeof ThrottledOctokit> {
  if (!_octokit) {
    _octokit = new ThrottledOctokit({
      auth: getConfig().GITHUB_TOKEN,
      throttle: {
        onRateLimit: (
          retryAfter: number,
          _options: Record<string, unknown>,
          _octokit: unknown,
          retryCount: number,
        ) => {
          console.warn(
            `  ⏳ GitHub rate limit hit, retrying in ${retryAfter}s (attempt ${retryCount + 1})`,
          );
          return retryCount < 3;
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          _options: Record<string, unknown>,
          _octokit: unknown,
          retryCount: number,
        ) => {
          console.warn(
            `  ⏳ GitHub secondary rate limit, retrying in ${retryAfter}s (attempt ${retryCount + 1})`,
          );
          return retryCount < 3;
        },
      },
    });
  }
  return _octokit;
}

export async function createPullRequest(params: PullRequestParams) {
  const octokit = getOctokit();

  const { data: pr } = await octokit.rest.pulls.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body,
    head: params.head,
    base: params.base,
  });

  if (params.labels?.length) {
    await addLabels(params.owner, params.repo, pr.number, params.labels);
  }

  return pr;
}

export async function addLabels(
  owner: string,
  repo: string,
  prNumber: number,
  labels: string[],
) {
  const octokit = getOctokit();
  const { data } = await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: prNumber,
    labels,
  });
  return data;
}

export async function createIssue(params: IssueParams) {
  const octokit = getOctokit();
  const { data } = await octokit.rest.issues.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body,
    labels: params.labels,
  });
  return data;
}

export async function closePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
) {
  const octokit = getOctokit();
  const { data } = await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    state: "closed",
  });
  return data;
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
) {
  const octokit = getOctokit();
  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: "squash",
  });
  return data;
}

export async function listOpenPullRequests(owner: string, repo: string) {
  const octokit = getOctokit();
  return octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
}

export async function findPullRequestByHead(
  owner: string,
  repo: string,
  head: string,
): Promise<{ number: number; html_url: string } | null> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${head}`,
    state: "open",
    per_page: 1,
  });
  return data.length > 0
    ? { number: data[0].number, html_url: data[0].html_url }
    : null;
}
