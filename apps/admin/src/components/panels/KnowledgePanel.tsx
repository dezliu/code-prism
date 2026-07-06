'use client';

import {
  Button, Card, Form, Input, Modal, Select, Space, Table, Tag, message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { gql } from '../../lib/gql';

interface KnowledgeDoc {
  id: string;
  title: string;
  status: string;
  docType: string;
  repoIds: string[];
  content?: string;
}

interface RepoOption {
  id: string;
  name: string;
  displayName: string | null;
}

const DOC_TYPE_OPTIONS = [
  { value: 'design', label: '设计文档' },
  { value: 'adr', label: 'ADR' },
  { value: 'ops', label: '运维文档' },
  { value: 'training', label: '培训文档' },
  { value: 'other', label: '其他' },
];

const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export function KnowledgePanel() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<KnowledgeDoc | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const repoNameMap = useMemo(
    () => new Map(repos.map((r) => [r.id, r.displayName || r.name])),
    [repos],
  );

  const loadRepos = async () => {
    try {
      const data = await gql<{ repos: RepoOption[] }>(`
        query { repos { id name displayName } }
      `);
      setRepos(data.repos);
    } catch {
      // 列表页仍可展示，编辑时若仓库未加载会提示
    }
  };

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await gql<{ knowledgeDocs: KnowledgeDoc[] }>(`
        query { knowledgeDocs { id title status docType repoIds } }
      `);
      setDocs(data.knowledgeDocs);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
    loadDocs();
  }, []);

  const openCreateModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ docType: 'training' });
    setCreateModalOpen(true);
  };

  const onCreate = async (values: { title: string; docType: string; repoIds?: string[] }) => {
    try {
      await gql(
        `mutation($input: CreateKnowledgeDocInput!) { createKnowledgeDoc(input: $input) { id } }`,
        {
          input: {
            title: values.title,
            docType: values.docType,
            content: '',
            repoIds: values.repoIds ?? [],
          },
        },
      );
      message.success('知识库已创建');
      setCreateModalOpen(false);
      createForm.resetFields();
      await loadDocs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const openEditModal = async (row: KnowledgeDoc) => {
    try {
      const data = await gql<{ knowledgeDoc: KnowledgeDoc | null }>(`
        query($id: ID!) { knowledgeDoc(id: $id) { id title status docType repoIds content } }
      `, { id: row.id });
      if (!data.knowledgeDoc) {
        message.error('文档不存在');
        return;
      }
      setEditDoc(data.knowledgeDoc);
      editForm.setFieldsValue({
        title: data.knowledgeDoc.title,
        docType: data.knowledgeDoc.docType,
        repoIds: data.knowledgeDoc.repoIds,
        content: data.knowledgeDoc.content ?? '',
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载详情失败');
    }
  };

  const onSaveEdit = async () => {
    if (!editDoc) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      await gql(
        `mutation($id: ID!, $input: UpdateKnowledgeDocInput!) {
          updateKnowledgeDoc(id: $id, input: $input) { id }
        }`,
        {
          id: editDoc.id,
          input: {
            title: values.title,
            docType: values.docType,
            repoIds: values.repoIds ?? [],
            content: values.content,
          },
        },
      );
      message.success('已保存');
      setEditDoc(null);
      await loadDocs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onGenerateContent = async () => {
    if (!editDoc) return;
    const repoIds: string[] = editForm.getFieldValue('repoIds') ?? [];
    if (!repoIds.length) {
      message.warning('请先关联至少一个 Git 仓库');
      return;
    }
    setGenerating(true);
    try {
      await gql(
        `mutation($id: ID!, $input: UpdateKnowledgeDocInput!) {
          updateKnowledgeDoc(id: $id, input: $input) { id }
        }`,
        {
          id: editDoc.id,
          input: {
            title: editForm.getFieldValue('title'),
            docType: editForm.getFieldValue('docType'),
            repoIds,
          },
        },
      );
      const data = await gql<{ generateKnowledgeDocContent: KnowledgeDoc }>(`
        mutation($id: ID!) {
          generateKnowledgeDocContent(id: $id) { id content }
        }
      `, { id: editDoc.id });
      editForm.setFieldValue('content', data.generateKnowledgeDocContent.content ?? '');
      message.success('文档已从代码索引生成');
      await loadDocs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const onPublish = async (id: string) => {
    try {
      await gql(`mutation($id: ID!) { publishKnowledgeDoc(id: $id) { id status } }`, { id });
      message.success('文档已发布');
      if (editDoc?.id === id) {
        setEditDoc(null);
      }
      await loadDocs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    }
  };

  return (
    <>
      <div className="admin-panel">
        <Card
          type="inner"
          title="知识库列表"
          className="admin-panel-inner"
          extra={(
            <Button type="primary" onClick={openCreateModal}>新增知识库</Button>
          )}
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={docs}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                render: (title: string, row) => (
                  <Button type="link" style={{ padding: 0 }} onClick={() => openEditModal(row)}>
                    {title}
                  </Button>
                ),
              },
              {
                title: '类型',
                dataIndex: 'docType',
                width: 120,
                render: (v: string) => DOC_TYPE_LABEL[v] ?? v,
              },
              {
                title: '关联仓库',
                dataIndex: 'repoIds',
                render: (ids: string[]) => (
                  ids?.length
                    ? ids.map((id) => (
                      <Tag key={id}>{repoNameMap.get(id) ?? id.slice(0, 8)}</Tag>
                    ))
                    : <span style={{ color: '#999' }}>未关联</span>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (v: string) => (
                  <Tag color={v === 'published' ? 'green' : 'default'}>
                    {v === 'published' ? '已发布' : '草稿'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                width: 160,
                render: (_, row) => (
                  <Space size="small">
                    <Button size="small" type="link" onClick={() => openEditModal(row)}>编辑</Button>
                    {row.status !== 'published' && (
                      <Button size="small" type="link" onClick={() => onPublish(row.id)}>发布</Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Modal
        title="新增知识库"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        okText="创建"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：nl-hermes 知识库" />
          </Form.Item>
          <Form.Item name="docType" label="类型" rules={[{ required: true }]}>
            <Select options={DOC_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="repoIds" label="关联 Git 仓库（可选，支持多选）">
            <Select
              mode="multiple"
              allowClear
              placeholder="创建后可继续编辑关联"
              options={repos.map((r) => ({ value: r.id, label: r.displayName || r.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑知识库"
        open={!!editDoc}
        onCancel={() => setEditDoc(null)}
        width={720}
        footer={(
          <Space>
            <Button onClick={() => setEditDoc(null)}>取消</Button>
            {editDoc?.status !== 'published' && (
              <Button onClick={() => editDoc && onPublish(editDoc.id)}>发布</Button>
            )}
            <Button loading={generating} onClick={onGenerateContent}>
              从代码生成文档
            </Button>
            <Button type="primary" loading={saving} onClick={onSaveEdit}>保存</Button>
          </Space>
        )}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="docType" label="类型" rules={[{ required: true }]}>
            <Select options={DOC_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="repoIds"
            label="关联 Git 仓库"
            extra="一个知识库可关联多个仓库（1:N）"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="选择要关联的仓库"
              options={repos.map((r) => ({ value: r.id, label: r.displayName || r.name }))}
            />
          </Form.Item>
          <Form.Item name="content" label="文档内容">
            <Input.TextArea rows={14} placeholder="可手动编辑，或点击「从代码生成文档」调用 LLM 自动生成" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
