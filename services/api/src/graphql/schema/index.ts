import { commonTypeDefs } from './common.graphql.js';
import { authTypeDefs } from './auth.graphql.js';
import { repoTypeDefs } from './repo.graphql.js';
import { knowledgeTypeDefs } from './knowledge.graphql.js';
import { chatTypeDefs } from './chat.graphql.js';
import { monitorTypeDefs } from './monitor.graphql.js';

import { architectureTypeDefs } from './architecture.graphql.js';
import { templateTypeDefs } from './template.graphql.js';
import { alertTypeDefs } from './alert.graphql.js';
import { searchTypeDefs } from './search.graphql.js';

export const typeDefs = [
  commonTypeDefs,
  authTypeDefs,
  repoTypeDefs,
  knowledgeTypeDefs,
  chatTypeDefs,
  monitorTypeDefs,
  architectureTypeDefs,
  templateTypeDefs,
  alertTypeDefs,
  searchTypeDefs,
];
