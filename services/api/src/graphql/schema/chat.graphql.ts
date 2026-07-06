export const chatTypeDefs = /* GraphQL */ `
  type ContextAnchor {
    entityType: String!
    entityId: String!
    entityName: String!
    repoId: String
  }

  type ChatSession {
    id: ID!
    title: String!
    updatedAt: String!
    anchor: ContextAnchor
  }

  type MessageSource {
    type: String!
    title: String!
    ref: String
  }

  type ChatMessage {
    id: ID!
    role: String!
    content: String!
    sources: [MessageSource!]
    interrupted: Boolean!
    createdAt: String!
  }

  extend type Query {
    chatSessions: [ChatSession!]!
    chatMessages(sessionId: ID!): [ChatMessage!]!
  }

  extend type Mutation {
    createChatSession(title: String): ChatSession!
    deleteChatSession(sessionId: ID!): Boolean!
  }
`;
