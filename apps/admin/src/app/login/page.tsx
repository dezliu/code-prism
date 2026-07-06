'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoginForm } from '@lingprism/ui';
import { loginWithCredentials } from '@lingprism/graphql';

export default function AdminLoginPage() {
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
      title="登录管理后台"
      subtitle="数据与知识治理"
      devHint="开发账户：admin@lingprism.local / lingprism123"
      onSubmit={handleLogin}
      loading={loading}
    />
  );
}
