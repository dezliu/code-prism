export const monitorTypeDefs = /* GraphQL */ `
  type IndexJobSummary {
    id: ID!
    repoId: ID!
    status: String!
    errorMessage: String
    repoName: String
    createdAt: String!
  }

  type HealthScoreSummary {
    id: ID!
    repoId: ID!
    score: Int!
    metrics: JSON
    repoName: String
    calculatedAt: String!
  }

  type ArchDriftSummary {
    id: ID!
    repoId: ID!
    description: String!
    driftType: String!
    sourceNode: String
    targetNode: String
    status: String!
    repoName: String
    detectedAt: String!
  }

  extend type Query {
    indexJobs: [IndexJobSummary!]!
    healthScores: [HealthScoreSummary!]!
    archDrifts(status: String): [ArchDriftSummary!]!
  }
`;
