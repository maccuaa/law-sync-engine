import { Octokit } from "octokit";
import { getConfig } from "../config.js";
import type { IssueParams, PullRequestParams } from "./types.js";

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!_octokit) {
    _octokit = new Octokit({ auth: getConfig().GITHUB_TOKEN });
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
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  return data;
}
