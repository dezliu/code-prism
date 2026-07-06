'use client';

import { Button, Form, Input, Alert } from 'antd';
import { useState } from 'react';

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface LoginFormProps {
  title?: string;
  subtitle?: string;
  onSubmit: (values: LoginFormValues) => Promise<void>;
  loading?: boolean;
  devHint?: string;
}

export function LoginForm({
  title = '登录灵镜',
  subtitle = '使用企业本地账户登录',
  onSubmit,
  loading = false,
  devHint = '开发账户：employee@lingprism.local / lingprism123',
}: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<LoginFormValues>();

  const handleFinish = async (values: LoginFormValues) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>{subtitle}</p>

      {error ? (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      ) : null}

      <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
        <Form.Item
          label="邮箱"
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input placeholder="employee@lingprism.local" autoComplete="username" />
        </Form.Item>

        <Form.Item
          label="密码"
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password placeholder="••••••••" autoComplete="current-password" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form.Item>
      </Form>

      {devHint ? (
        <p style={{ color: '#999', fontSize: 12, marginTop: 16 }}>{devHint}</p>
      ) : null}
    </div>
  );
}
