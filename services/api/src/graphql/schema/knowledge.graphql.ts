export const knowledgeTypeDefs = /* GraphQL */ `
  type KnowledgeDoc {
    id: ID!
    title: String!
    status: String!
  }

  extend type Query {
    knowledgeDocs: [KnowledgeDoc!]!
  }
`;
