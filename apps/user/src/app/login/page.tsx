'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoginForm } from '@lingprism/ui';
import { loginWithCredentials } from '@lingprism/graphql';

export default function UserLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await loginWithCredentials(values.email, values.password);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginForm
      title="登录用户平台"
      subtitle="智能问答与知识探索"
      onSubmit={handleLogin}
      loading={loading}
    />
  );
}
