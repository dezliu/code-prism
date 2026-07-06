'use client';

import { Button, Card, Form, Input, Select, Table, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { gql } from '../../lib/gql';

interface KnowledgeDoc {
  id: string;
  title: string;
  status: string;
  docType: string;
}

export function KnowledgePanel() {
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
    loadDocs();
  }, []);

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
    <div className="admin-panel">
      <Card type="inner" title="新建文档" style={{ marginBottom: 16 }} className="admin-panel-inner">
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
      <Card type="inner" title="文档列表" className="admin-panel-inner">
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
    </div>
  );
}
