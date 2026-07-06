import {
  clearAuthToken,
  setAuthToken,
  type AuthUser,
  type LoginResponse,
} from '@lingprism/shared';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from './constants';
import { resetApolloClient } from './apollo-client';

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        email
        displayName
        role
        teamId
        createdAt
      }
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
      email
      displayName
      role
      teamId
      createdAt
    }
  }
`;

async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'GraphQL request failed');
  }

  if (!payload.data) {
    throw new Error('GraphQL response missing data');
  }

  return payload.data;
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const data = await graphqlRequest<{ login: LoginResponse }>(LOGIN_MUTATION, {
    email,
    password,
  });

  setAuthToken(data.login.token);
  resetApolloClient();
  return data.login;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!getAuthToken()) {
    return null;
  }

  const data = await graphqlRequest<{ me: AuthUser | null }>(ME_QUERY);
  return data.me;
}

export function logout(): void {
  clearAuthToken();
  resetApolloClient();
}
