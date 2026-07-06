export const monitorTypeDefs = /* GraphQL */ `
  type IndexJobSummary {
    id: ID!
    repoId: ID!
    status: String!
  }

  extend type Query {
    indexJobs: [IndexJobSummary!]!
  }
`;
