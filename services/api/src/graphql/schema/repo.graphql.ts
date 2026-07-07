export const repoTypeDefs = /* GraphQL */ `
  type Repo {
    id: ID!
    name: String!
    url: String!
    indexStatus: String
    connectionStatus: String!
    indexedInSearch: Boolean!
    enabled: Boolean!
    displayName: String
    tags: [String!]!
    businessOwner: String
    techOwner: String
    languageSummary: JSON
    lastCommitAt: String
    lastCommitSummary: String
    syncStatus: String!
    syncError: String
    localCommitHash: String
    remoteCommitHash: String
    indexedCommitHash: String
    hasPendingCommit: Boolean!
    lastSyncedAt: String
  }

  input CreateRepoInput {
    url: String!
    authType: String!
    defaultBranch: String
    authToken: String
  }

  input UpdateRepoInput {
    defaultBranch: String
    authToken: String
    enabled: Boolean
  }

  input UpdateRepoMetadataInput {
    displayName: String
    tags: [String!]
    businessOwner: String
    techOwner: String
    indexedInSearch: Boolean
  }

  input TestConnectionByUrlInput {
    url: String!
    authType: String!
    defaultBranch: String
  }

  type TestConnectionResult {
    ok: Boolean!
    error: String
  }

  type EnqueueIndexResult {
    jobId: String!
    status: String!
  }

  extend type Query {
    repos: [Repo!]!
    repo(id: ID!): Repo
  }

  extend type Mutation {
    createRepo(input: CreateRepoInput!): Repo!
    testRepoConnection(repoId: ID!): TestConnectionResult!
    testConnectionByUrl(input: TestConnectionByUrlInput!): TestConnectionResult!
    updateRepoMetadata(repoId: ID!, input: UpdateRepoMetadataInput!): Repo!
    updateRepo(repoId: ID!, input: UpdateRepoInput!): Repo!
    deleteRepo(repoId: ID!): Boolean!
    syncAndIndexRepo(repoId: ID!): EnqueueIndexResult!
  }
`;
