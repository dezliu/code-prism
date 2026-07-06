export const knowledgeTypeDefs = /* GraphQL */ `
  type KnowledgeDoc {
    id: ID!
    title: String!
    status: String!
    docType: String!
    repoIds: [String!]!
    content: String
  }

  input CreateKnowledgeDocInput {
    title: String!
    docType: String!
    content: String
    repoIds: [String!]
  }

  input UpdateKnowledgeDocInput {
    title: String
    docType: String
    content: String
    repoIds: [String!]
  }

  extend type Query {
    knowledgeDocs: [KnowledgeDoc!]!
    knowledgeDoc(id: ID!): KnowledgeDoc
  }

  extend type Mutation {
    createKnowledgeDoc(input: CreateKnowledgeDocInput!): KnowledgeDoc!
    updateKnowledgeDoc(id: ID!, input: UpdateKnowledgeDocInput!): KnowledgeDoc!
    publishKnowledgeDoc(id: ID!): KnowledgeDoc!
    generateKnowledgeDocContent(id: ID!): KnowledgeDoc!
    generateTrainingDoc(repoId: ID!): KnowledgeDoc!
  }
`;
