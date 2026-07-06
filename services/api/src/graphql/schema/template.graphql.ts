export const templateTypeDefs = /* GraphQL */ `
  type QaOutputField {
    name: String!
    required: Boolean!
  }

  type QaTemplate {
    id: ID!
    name: String!
    questionTypes: [String!]!
    keywords: [String!]!
    outputFields: [QaOutputField!]!
    previewTemplate: String!
    applicableRoles: [String!]
    status: String!
    priority: Int!
    updatedAt: String!
  }

  input QaOutputFieldInput {
    name: String!
    required: Boolean!
  }

  input CreateQaTemplateInput {
    name: String!
    questionTypes: [String!]!
    keywords: [String!]!
    outputFields: [QaOutputFieldInput!]!
    previewTemplate: String!
    applicableRoles: [String!]
    status: String
    priority: Int
  }

  input UpdateQaTemplateInput {
    name: String
    questionTypes: [String!]
    keywords: [String!]
    outputFields: [QaOutputFieldInput!]
    previewTemplate: String
    applicableRoles: [String!]
    status: String
    priority: Int
  }

  extend type Query {
    qaTemplates: [QaTemplate!]!
    previewQaTemplate(id: ID!, sampleQuestion: String!): String!
  }

  extend type Mutation {
    createQaTemplate(input: CreateQaTemplateInput!): QaTemplate!
    updateQaTemplate(id: ID!, input: UpdateQaTemplateInput!): QaTemplate!
    deleteQaTemplate(id: ID!): Boolean!
  }
`;
