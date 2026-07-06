'use client';

import { ApolloProvider } from '@apollo/client';
import type { ReactNode } from 'react';
import { createApolloClient } from './apollo-client';

export function LingPrismApolloProvider({ children }: { children: ReactNode }) {
  const client = createApolloClient();
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
