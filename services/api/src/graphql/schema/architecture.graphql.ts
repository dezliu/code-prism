export const architectureTypeDefs = /* GraphQL */ `
  type GraphNode {
    id: ID!
    label: String!
    type: String!
    metadata: JSON
  }

  type GraphEdge {
    id: ID!
    source: ID!
    target: ID!
    label: String
  }

  type GraphData {
    nodes: [GraphNode!]!
    edges: [GraphEdge!]!
  }

  type Architecture {
    id: ID!
    repoId: ID!
    version: Int!
    isOfficial: Boolean!
    graphData: GraphData!
    versionNote: String
    repoName: String
    publishedAt: String
  }

  type ArchitectureSummary {
    id: ID!
    repoId: ID!
    version: Int!
    isOfficial: Boolean!
    versionNote: String
    repoName: String
    nodeCount: Int!
    publishedAt: String
    updatedAt: String!
  }

  type AdminArchitectureItem {
    repoId: ID!
    repoName: String
    draft: ArchitectureSummary
    official: ArchitectureSummary
  }

  extend type Mutation {
    addManagedArchitecture(repoId: ID!): AdminArchitectureItem!
    generateArchDraft(repoId: ID!): Architecture!
    publishOfficialArchitecture(repoId: ID!, versionNote: String!): Architecture!
    enqueueArchGenerateJob(repoId: ID!): ArchGenerateJob!
    cancelArchGenerateJob(id: ID!): ArchGenerateJob!
  }

  type ArchGenerateJob {
    id: ID!
    repoId: ID!
    repoName: String
    status: String!
    phase: String
    errorMessage: String
    graphData: GraphData
    attemptCount: Int!
    createdAt: String!
    startedAt: String
    completedAt: String
  }

  extend type Query {
    adminArchitectures: [AdminArchitectureItem!]!
    architectureDraft(repoId: ID!): Architecture
    officialArchitectures: [Architecture!]!
    officialArchitecture(repoId: ID!): Architecture
    archGenerateJobs(status: String, limit: Int): [ArchGenerateJob!]!
    archGenerateJob(id: ID!): ArchGenerateJob
  }
`;
