'use client';

import { Button, Card, Form, Input, Select, Space, Table, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';

interface KnowledgeDoc {
  id: string;
  title: string;
  status: string;
  docType: string;
  content?: string;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export default function KnowledgePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await gql<{ knowledgeDocs: KnowledgeDoc[] }>(`
        query { knowledgeDocs { id title status docType } }
      `);
      setDocs(data.knowledgeDocs);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser()
      .then((current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        return loadDocs();
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const onCreate = async (values: { title: string; docType: string; content: string }) => {
    try {
      await gql(
        `mutation($input: CreateKnowledgeDocInput!) { createKnowledgeDoc(input: $input) { id } }`,
        { input: values },
      );
      message.success('文档已创建');
      form.resetFields();
      await loadDocs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const onPublish = async (id: string) => {
    try {
      await gql(`mutation($id: ID!) { publishKnowledgeDoc(id: $id) { id status } }`, { id });
      message.success('文档已发布');
      await loadDocs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    }
  };

  return (
    <AppShell appTitle="管理后台" accentColor="#6366f1">
      <PageHeader
        title="知识库管理"
        description={user ? `管理员：${user.displayName}` : ''}
        extra={
          <Space>
            <Button onClick={() => router.push('/repos')}>代码源</Button>
            <Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>
          </Space>
        }
      />
      <Card title="新建文档" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="docType" label="类型" initialValue="manual">
            <Select options={[
              { value: 'manual', label: '手册' },
              { value: 'adr', label: 'ADR' },
              { value: 'training', label: '培训文档' },
            ]} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
          <Button type="primary" htmlType="submit">保存草稿</Button>
        </Form>
      </Card>
      <Card title="文档列表">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={docs}
          columns={[
            { title: '标题', dataIndex: 'title' },
            { title: '类型', dataIndex: 'docType' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => <Tag color={v === 'published' ? 'green' : 'default'}>{v}</Tag>,
            },
            {
              title: '操作',
              render: (_, row) => row.status !== 'published' ? (
                <Button size="small" type="link" onClick={() => onPublish(row.id)}>发布</Button>
              ) : null,
            },
          ]}
        />
      </Card>
    </AppShell>
  );
}
