export const chatTypeDefs = /* GraphQL */ `
  type ChatSession {
    id: ID!
    title: String!
    createdAt: String!
  }

  extend type Query {
    chatSessions: [ChatSession!]!
  }
`;
