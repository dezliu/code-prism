export const knowledgeTypeDefs = /* GraphQL */ `
  type KnowledgeBase {
    id: ID!
    title: String!
    repoIds: [String!]!
    itemCount: Int!
    items: [KnowledgeDocItem!]!
  }

  type KnowledgeDocItem {
    id: ID!
    knowledgeBaseId: ID!
    title: String!
    status: String!
    docType: String!
    content: String
    indexedInSearch: Boolean!
    repoIds: [String!]
  }

  type DocGenerateJob {
    id: ID!
    itemId: ID!
    itemTitle: String!
    knowledgeBaseId: ID!
    knowledgeBaseTitle: String
    title: String!
    docType: String!
    status: String!
    phase: String
    errorMessage: String
    content: String
    createdAt: String!
    startedAt: String
    completedAt: String
  }

  """ @deprecated 请使用 KnowledgeDocItem """
  type KnowledgeDoc {
    id: ID!
    title: String!
    status: String!
    docType: String!
    repoIds: [String!]!
    content: String
  }

  input CreateKnowledgeBaseInput {
    title: String!
    repoIds: [String!]
  }

  input UpdateKnowledgeBaseInput {
    title: String
    repoIds: [String!]
  }

  input CreateKnowledgeDocItemInput {
    knowledgeBaseId: ID!
    title: String!
    docType: String!
    content: String
  }

  input UpdateKnowledgeDocItemInput {
    title: String
    docType: String
    content: String
  }

  input EnqueueDocGenerateJobInput {
    itemId: ID!
    title: String
    docType: String
  }

  """ @deprecated """
  input CreateKnowledgeDocInput {
    title: String!
    docType: String!
    content: String
    repoIds: [String!]
  }

  """ @deprecated """
  input UpdateKnowledgeDocInput {
    title: String
    docType: String
    content: String
    repoIds: [String!]
  }

  extend type Query {
    knowledgeBases: [KnowledgeBase!]!
    knowledgeBase(id: ID!): KnowledgeBase
    knowledgeDocItem(id: ID!): KnowledgeDocItem
    knowledgeDocs: [KnowledgeDoc!]!
    knowledgeDoc(id: ID!): KnowledgeDoc
    docGenerateJobs(status: String, limit: Int = 50): [DocGenerateJob!]!
    docGenerateJob(id: ID!): DocGenerateJob
  }

  extend type Mutation {
    createKnowledgeBase(input: CreateKnowledgeBaseInput!): KnowledgeBase!
    updateKnowledgeBase(id: ID!, input: UpdateKnowledgeBaseInput!): KnowledgeBase!
    deleteKnowledgeBase(id: ID!): Boolean!
    createKnowledgeDocItem(input: CreateKnowledgeDocItemInput!): KnowledgeDocItem!
    updateKnowledgeDocItem(id: ID!, input: UpdateKnowledgeDocItemInput!): KnowledgeDocItem!
    publishKnowledgeDocItem(id: ID!): KnowledgeDocItem!
    updateKnowledgeDocItemIndex(itemId: ID!, indexedInSearch: Boolean!): KnowledgeDocItem!
    generateKnowledgeDocContent(id: ID!): KnowledgeDocItem!
    enqueueDocGenerateJob(input: EnqueueDocGenerateJobInput!): DocGenerateJob!
    cancelDocGenerateJob(id: ID!): DocGenerateJob!
    applyDocGenerateJob(id: ID!): KnowledgeDocItem!
    createKnowledgeDoc(input: CreateKnowledgeDocInput!): KnowledgeDoc!
    updateKnowledgeDoc(id: ID!, input: UpdateKnowledgeDocInput!): KnowledgeDoc!
    publishKnowledgeDoc(id: ID!): KnowledgeDoc!
    generateTrainingDoc(repoId: ID!): KnowledgeDoc!
  }
`;
