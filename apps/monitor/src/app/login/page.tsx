'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoginForm } from '@lingprism/ui';
import { loginWithCredentials } from '@lingprism/graphql';

export default function MonitorLoginPage() {
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
      title="登录监控平台"
      subtitle="全局治理看板"
      devHint="开发账户：admin@lingprism.local / lingprism123"
      onSubmit={handleLogin}
      loading={loading}
    />
  );
}
