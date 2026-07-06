export const alertTypeDefs = /* GraphQL */ `
  type AlertRule {
    id: ID!
    name: String!
    ruleType: String!
    scope: String!
    scopeId: String
    thresholdValue: Float!
    thresholdUnit: String
    notifyChannels: [String!]!
    enabled: Boolean!
    updatedAt: String!
  }

  input CreateAlertRuleInput {
    name: String!
    ruleType: String!
    scope: String
    scopeId: String
    thresholdValue: Float!
    thresholdUnit: String
    notifyChannels: [String!]!
    enabled: Boolean
  }

  input UpdateAlertRuleInput {
    name: String
    ruleType: String
    scope: String
    scopeId: String
    thresholdValue: Float
    thresholdUnit: String
    notifyChannels: [String!]
    enabled: Boolean
  }

  extend type Query {
    alertRules: [AlertRule!]!
  }

  extend type Mutation {
    createAlertRule(input: CreateAlertRuleInput!): AlertRule!
    updateAlertRule(id: ID!, input: UpdateAlertRuleInput!): AlertRule!
    deleteAlertRule(id: ID!): Boolean!
  }
`;
