export const commonTypeDefs = /* GraphQL */ `
  scalar DateTime

  type HealthStatus {
    status: String!
    service: String!
    timestamp: String!
  }

  type Query {
    health: HealthStatus!
  }

  type Mutation {
    _empty: String
  }
`;
