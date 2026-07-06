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

  extend type Query {
    adminArchitectures: [AdminArchitectureItem!]!
    architectureDraft(repoId: ID!): Architecture
    officialArchitectures: [Architecture!]!
    officialArchitecture(repoId: ID!): Architecture
  }

  extend type Mutation {
    generateArchDraft(repoId: ID!): Architecture!
    publishOfficialArchitecture(repoId: ID!, versionNote: String!): Architecture!
  }
`;
