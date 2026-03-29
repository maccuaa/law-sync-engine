import { graphql } from "@octokit/graphql";
import { getConfig } from "../config.js";
import type { ProjectField, ProjectItem } from "./types.js";

function getGraphqlClient() {
  return graphql.defaults({
    headers: { authorization: `token ${getConfig().GITHUB_TOKEN}` },
  });
}

export async function getProjectId(
  owner: string,
  projectNumber: number,
): Promise<{ id: string; title: string; fields: ProjectField[] }> {
  const gql = getGraphqlClient();

  const result = await gql<{
    user: {
      projectV2: {
        id: string;
        title: string;
        fields: {
          nodes: Array<{
            id: string;
            name: string;
            options?: { id: string; name: string }[];
          }>;
        };
      };
    };
  }>(
    `query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          title
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }`,
    { owner, number: projectNumber },
  );

  const project = result.user.projectV2;
  return {
    id: project.id,
    title: project.title,
    fields: project.fields.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      options: node.options,
    })),
  };
}

export async function getProjectFields(
  projectId: string,
): Promise<ProjectField[]> {
  const gql = getGraphqlClient();

  const result = await gql<{
    node: {
      fields: {
        nodes: Array<{
          id: string;
          name: string;
          options?: { id: string; name: string }[];
        }>;
      };
    };
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }`,
    { projectId },
  );

  return result.node.fields.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    options: node.options,
  }));
}

export async function addItemToProject(
  projectId: string,
  contentId: string,
): Promise<string> {
  const gql = getGraphqlClient();

  const result = await gql<{
    addProjectV2ItemById: { item: { id: string } };
  }>(
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId },
  );

  return result.addProjectV2ItemById.item.id;
}

export async function updateItemField(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): Promise<string> {
  const gql = getGraphqlClient();

  const result = await gql<{
    updateProjectV2ItemFieldValue: { projectV2Item: { id: string } };
  }>(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }`,
    { projectId, itemId, fieldId, optionId },
  );

  return result.updateProjectV2ItemFieldValue.projectV2Item.id;
}

export async function getProjectItems(
  projectId: string,
): Promise<ProjectItem[]> {
  const gql = getGraphqlClient();

  const result = await gql<{
    node: {
      items: {
        nodes: Array<{
          id: string;
          content: { number: number; title: string } | null;
          fieldValues: {
            nodes: Array<{
              field?: { name: string };
              name?: string;
            }>;
          };
        }>;
      };
    };
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content {
                ... on PullRequest {
                  number
                  title
                }
                ... on Issue {
                  number
                  title
                }
              }
              fieldValues(first: 10) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field { ... on ProjectV2SingleSelectField { name } }
                    name
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { projectId },
  );

  return result.node.items.nodes.map((item) => {
    const fieldValues: Record<string, string> = {};
    for (const fv of item.fieldValues.nodes) {
      if (fv.field?.name && fv.name) {
        fieldValues[fv.field.name] = fv.name;
      }
    }
    return {
      id: item.id,
      content: item.content ?? undefined,
      fieldValues,
    };
  });
}
