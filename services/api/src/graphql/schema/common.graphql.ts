export const commonTypeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

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
