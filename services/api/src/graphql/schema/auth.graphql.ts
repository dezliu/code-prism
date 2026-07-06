export const authTypeDefs = /* GraphQL */ `
  type User {
    id: ID!
    email: String!
    displayName: String!
    role: String!
    teamId: String
    createdAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  extend type Query {
    me: User
  }

  extend type Mutation {
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
  }
`;
