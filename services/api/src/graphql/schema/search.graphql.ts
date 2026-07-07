export const searchTypeDefs = /* GraphQL */ `
  input ResolveSymbolsInput {
    query: String!
    className: String
    methodName: String
    repoIds: [ID!]
    limit: Int = 5
  }

  extend type Query {
    resolveSymbols(input: ResolveSymbolsInput!): [CodeLocation!]!
  }
`;
