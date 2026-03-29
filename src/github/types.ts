export interface PullRequestParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  labels?: string[];
}

export interface IssueParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface ProjectField {
  id: string;
  name: string;
  options?: { id: string; name: string }[];
}

export interface ProjectItem {
  id: string;
  content?: {
    number: number;
    title: string;
  };
  fieldValues?: Record<string, string>;
}
