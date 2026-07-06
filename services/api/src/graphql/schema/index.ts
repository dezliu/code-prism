import { commonTypeDefs } from './common.graphql.js';
import { repoTypeDefs } from './repo.graphql.js';
import { knowledgeTypeDefs } from './knowledge.graphql.js';
import { chatTypeDefs } from './chat.graphql.js';
import { monitorTypeDefs } from './monitor.graphql.js';

export const typeDefs = [
  commonTypeDefs,
  repoTypeDefs,
  knowledgeTypeDefs,
  chatTypeDefs,
  monitorTypeDefs,
];
