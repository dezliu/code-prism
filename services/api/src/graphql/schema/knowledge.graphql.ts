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

  extend type Query {
    knowledgeDocs: [KnowledgeDoc!]!
  }

  extend type Mutation {
    createKnowledgeDoc(input: CreateKnowledgeDocInput!): KnowledgeDoc!
    publishKnowledgeDoc(id: ID!): KnowledgeDoc!
    generateTrainingDoc(repoId: ID!): KnowledgeDoc!
  }
`;
