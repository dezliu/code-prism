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

  type CodeLocation {
    repoId: ID!
    repoName: String!
    repoUrl: String!
    filePath: String!
    language: String
    packageName: String
    className: String
    methodName: String!
    symbolKind: String
    startLine: Int!
    endLine: Int!
    docComment: String
    qualifiedRef: String!
    snippet: String
    codeSnippet: String # 新增：实际代码片段（带行号）
    score: Float
  }

  type ChatMessage {
    id: ID!
    role: String!
    content: String!
    sources: [MessageSource!]
    codeLocations: [CodeLocation!]
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
