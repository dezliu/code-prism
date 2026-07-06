import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  type NormalizedCacheObject,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from './constants';

let apolloClient: ApolloClient<NormalizedCacheObject> | null = null;

export function createApolloClient(): ApolloClient<NormalizedCacheObject> {
  if (apolloClient) {
    return apolloClient;
  }

  const httpLink = new HttpLink({
    uri: GRAPHQL_ENDPOINT,
    credentials: 'same-origin',
  });

  const authLink = setContext((_, { headers }) => {
    const token = getAuthToken();
    return {
      headers: {
        ...headers,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    };
  });

  apolloClient = new ApolloClient({
    link: ApolloLink.from([authLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network' },
      query: { fetchPolicy: 'network-only' },
    },
  });

  return apolloClient;
}

export function resetApolloClient(): void {
  apolloClient = null;
}
