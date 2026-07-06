export const repoTypeDefs = /* GraphQL */ `
  type Repo {
    id: ID!
    name: String!
    url: String!
    indexStatus: String
  }

  extend type Query {
    repos: [Repo!]!
  }
`;
