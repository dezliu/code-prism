'use client';

import {
  Button, Card, Drawer, Form, Input, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { gql } from '../../lib/gql';
import { DocGenerateProgressModal } from '../DocGenerateProgressModal';
import { MarkdownEditor } from '../MarkdownEditor';

interface KnowledgeBaseRow {
  id: string;
  title: string;
  repoIds: string[];
  itemCount: number;
}

interface KnowledgeDocItem {
  id: string;
  knowledgeBaseId: string;
  title: string;
  status: string;
  docType: string;
  indexedInSearch: boolean;
  content?: string;
  repoIds?: string[];
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
  const [bases, setBases] = useState<KnowledgeBaseRow[]>([]);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeBase, setActiveBase] = useState<KnowledgeBaseRow | null>(null);
  const [baseItems, setBaseItems] = useState<KnowledgeDocItem[]>([]);
  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [editBaseOpen, setEditBaseOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<KnowledgeDocItem | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateTarget, setGenerateTarget] = useState<{
    itemId: string;
    title: string;
    docType: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [createBaseForm] = Form.useForm();
  const [editBaseForm] = Form.useForm();
  const [createItemForm] = Form.useForm();
  const [editItemForm] = Form.useForm();

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
      // ignore
    }
  };

  const loadBases = async () => {
    setLoading(true);
    try {
      const data = await gql<{ knowledgeBases: KnowledgeBaseRow[] }>(`
        query { knowledgeBases { id title repoIds itemCount } }
      `);
      setBases(data.knowledgeBases);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBaseDetail = async (baseId: string) => {
    const data = await gql<{ knowledgeBase: { items: KnowledgeDocItem[] } | null }>(`
      query($id: ID!) { knowledgeBase(id: $id) { items { id knowledgeBaseId title status docType indexedInSearch } } }
    `, { id: baseId });
    setBaseItems(data.knowledgeBase?.items ?? []);
  };

  useEffect(() => {
    loadRepos();
    loadBases();
  }, []);

  const openBaseDetail = async (row: KnowledgeBaseRow) => {
    setActiveBase(row);
    try {
      await loadBaseDetail(row.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载详情失败');
    }
  };

  const onCreateBase = async (values: { title: string; repoIds?: string[] }) => {
    try {
      await gql(
        `mutation($input: CreateKnowledgeBaseInput!) { createKnowledgeBase(input: $input) { id } }`,
        { input: { title: values.title, repoIds: values.repoIds ?? [] } },
      );
      message.success('知识库已创建');
      setCreateBaseOpen(false);
      createBaseForm.resetFields();
      await loadBases();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const openEditBase = (row: KnowledgeBaseRow) => {
    setEditBaseOpen(true);
    editBaseForm.setFieldsValue({ title: row.title, repoIds: row.repoIds });
    setActiveBase(row);
  };

  const onSaveBase = async () => {
    if (!activeBase) return;
    const values = await editBaseForm.validateFields();
    try {
      await gql(
        `mutation($id: ID!, $input: UpdateKnowledgeBaseInput!) {
          updateKnowledgeBase(id: $id, input: $input) { id }
        }`,
        { id: activeBase.id, input: { title: values.title, repoIds: values.repoIds ?? [] } },
      );
      message.success('知识库已更新');
      setEditBaseOpen(false);
      await loadBases();
      if (activeBase) {
        setActiveBase({ ...activeBase, title: values.title, repoIds: values.repoIds ?? [] });
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  const onDeleteBase = (row: KnowledgeBaseRow) => {
    Modal.confirm({
      title: '确认删除知识库？',
      content: `将删除「${row.title}」及其全部文档条目，此操作不可恢复。`,
      okType: 'danger',
      onOk: async () => {
        await gql(`mutation($id: ID!) { deleteKnowledgeBase(id: $id) }`, { id: row.id });
        message.success('已删除');
        if (activeBase?.id === row.id) {
          setActiveBase(null);
          setBaseItems([]);
        }
        await loadBases();
      },
    });
  };

  const onCreateItem = async (values: { title: string; docType: string }) => {
    if (!activeBase) return;
    try {
      await gql(
        `mutation($input: CreateKnowledgeDocItemInput!) { createKnowledgeDocItem(input: $input) { id } }`,
        {
          input: {
            knowledgeBaseId: activeBase.id,
            title: values.title,
            docType: values.docType,
            content: '',
          },
        },
      );
      message.success('文档条目已创建');
      setCreateItemOpen(false);
      createItemForm.resetFields();
      await loadBaseDetail(activeBase.id);
      await loadBases();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const openEditItem = async (row: KnowledgeDocItem) => {
    try {
      const data = await gql<{ knowledgeDocItem: KnowledgeDocItem | null }>(`
        query($id: ID!) {
          knowledgeDocItem(id: $id) { id knowledgeBaseId title status docType indexedInSearch content }
        }
      `, { id: row.id });
      if (!data.knowledgeDocItem) {
        message.error('文档不存在');
        return;
      }
      setEditItem(data.knowledgeDocItem);
      editItemForm.setFieldsValue({
        title: data.knowledgeDocItem.title,
        docType: data.knowledgeDocItem.docType,
        content: data.knowledgeDocItem.content ?? '',
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载详情失败');
    }
  };

  const onSaveItem = async () => {
    if (!editItem) return;
    const values = await editItemForm.validateFields();
    setSaving(true);
    try {
      await gql(
        `mutation($id: ID!, $input: UpdateKnowledgeDocItemInput!) {
          updateKnowledgeDocItem(id: $id, input: $input) { id }
        }`,
        {
          id: editItem.id,
          input: {
            title: values.title,
            docType: values.docType,
            content: values.content,
          },
        },
      );
      message.success('已保存');
      setEditItem(null);
      if (activeBase) {
        await loadBaseDetail(activeBase.id);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onPublishItem = async (id: string) => {
    try {
      await gql(`mutation($id: ID!) { publishKnowledgeDocItem(id: $id) { id status } }`, { id });
      message.success('文档已发布');
      if (editItem?.id === id) {
        setEditItem(null);
      }
      if (activeBase) {
        await loadBaseDetail(activeBase.id);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    }
  };

  const toggleItemIndexed = async (itemId: string, indexedInSearch: boolean) => {
    try {
      await gql(
        `mutation($itemId: ID!, $indexedInSearch: Boolean!) {
          updateKnowledgeDocItemIndex(itemId: $itemId, indexedInSearch: $indexedInSearch) { id indexedInSearch }
        }`,
        { itemId, indexedInSearch },
      );
      message.success(indexedInSearch ? '已加入检索库' : '已移出检索库');
      if (activeBase) {
        await loadBaseDetail(activeBase.id);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败');
    }
  };

  const onGenerateContent = () => {
    if (!editItem) return;
    if (!activeBase?.repoIds?.length) {
      message.warning('请先为知识库关联至少一个 Git 仓库');
      return;
    }
    setGenerateTarget({
      itemId: editItem.id,
      title: editItemForm.getFieldValue('title'),
      docType: editItemForm.getFieldValue('docType'),
    });
    setGenerateModalOpen(true);
  };

  const onApplyGeneratedContent = (content: string) => {
    editItemForm.setFieldValue('content', content);
    setGenerateModalOpen(false);
    setGenerateTarget(null);
    message.success('已回填到文档内容，确认后可点击保存');
  };

  return (
    <>
      <div className="admin-panel">
        <Card
          type="inner"
          title="知识库列表"
          className="admin-panel-inner"
          extra={(
            <Button type="primary" onClick={() => setCreateBaseOpen(true)}>新增知识库</Button>
          )}
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={bases}
            columns={[
              {
                title: '标题',
                dataIndex: 'title',
                render: (title: string, row) => (
                  <Button type="link" style={{ padding: 0 }} onClick={() => openBaseDetail(row)}>
                    {title}
                  </Button>
                ),
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
              { title: '文档数', dataIndex: 'itemCount', width: 90 },
              {
                title: '操作',
                width: 200,
                render: (_, row) => (
                  <Space size="small">
                    <Button size="small" type="link" onClick={() => openBaseDetail(row)}>管理文档</Button>
                    <Button size="small" type="link" onClick={() => openEditBase(row)}>编辑</Button>
                    <Button size="small" type="link" danger onClick={() => onDeleteBase(row)}>删除</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Drawer
        title={activeBase ? `知识库：${activeBase.title}` : '知识库详情'}
        width={880}
        open={!!activeBase}
        onClose={() => setActiveBase(null)}
        extra={(
          <Space>
            <Button onClick={() => activeBase && openEditBase(activeBase)}>编辑知识库</Button>
            <Button type="primary" onClick={() => setCreateItemOpen(true)}>新增文档条目</Button>
          </Space>
        )}
      >
        <Table
          rowKey="id"
          dataSource={baseItems}
          pagination={false}
          columns={[
            { title: '标题', dataIndex: 'title' },
            {
              title: '类型',
              dataIndex: 'docType',
              width: 110,
              render: (v: string) => DOC_TYPE_LABEL[v] ?? v,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (v: string) => (
                <Tag color={v === 'published' ? 'green' : 'default'}>
                  {v === 'published' ? '已发布' : '草稿'}
                </Tag>
              ),
            },
            {
              title: '纳入检索库',
              width: 120,
              render: (_, row) => (
                <Switch
                  checked={row.indexedInSearch}
                  disabled={row.status !== 'published'}
                  onChange={(checked) => toggleItemIndexed(row.id, checked)}
                />
              ),
            },
            {
              title: '操作',
              width: 160,
              render: (_, row) => (
                <Space size="small">
                  <Button size="small" type="link" onClick={() => openEditItem(row)}>编辑</Button>
                  {row.status !== 'published' && (
                    <Button size="small" type="link" onClick={() => onPublishItem(row.id)}>发布</Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Drawer>

      <Modal
        title="新增知识库"
        open={createBaseOpen}
        onCancel={() => setCreateBaseOpen(false)}
        onOk={() => createBaseForm.submit()}
        okText="创建"
        destroyOnClose
      >
        <Form form={createBaseForm} layout="vertical" onFinish={onCreateBase}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：nl-hermes 知识库" />
          </Form.Item>
          <Form.Item name="repoIds" label="关联 Git 仓库（可选，支持多选）">
            <Select
              mode="multiple"
              allowClear
              placeholder="可在创建后继续编辑"
              options={repos.map((r) => ({ value: r.id, label: r.displayName || r.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑知识库"
        open={editBaseOpen}
        onCancel={() => setEditBaseOpen(false)}
        onOk={onSaveBase}
        okText="保存"
        destroyOnClose
      >
        <Form form={editBaseForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="repoIds" label="关联 Git 仓库" extra="文档生成与代码上下文将使用这些仓库">
            <Select
              mode="multiple"
              allowClear
              options={repos.map((r) => ({ value: r.id, label: r.displayName || r.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新增文档条目"
        open={createItemOpen}
        onCancel={() => setCreateItemOpen(false)}
        onOk={() => createItemForm.submit()}
        okText="创建"
        destroyOnClose
      >
        <Form
          form={createItemForm}
          layout="vertical"
          initialValues={{ docType: 'training' }}
          onFinish={onCreateItem}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：新员工培训手册" />
          </Form.Item>
          <Form.Item name="docType" label="类型" rules={[{ required: true }]}>
            <Select options={DOC_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑文档条目"
        open={!!editItem}
        onCancel={() => setEditItem(null)}
        width={820}
        footer={(
          <Space>
            <Button onClick={() => setEditItem(null)}>取消</Button>
            {editItem?.status !== 'published' && (
              <Button onClick={() => editItem && onPublishItem(editItem.id)}>发布</Button>
            )}
            <Button onClick={onGenerateContent}>从代码生成文档</Button>
            <Button type="primary" loading={saving} onClick={onSaveItem}>保存</Button>
          </Space>
        )}
        destroyOnClose
      >
        <Form form={editItemForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="docType" label="类型" rules={[{ required: true }]}>
            <Select options={DOC_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="content" label="文档内容">
            <MarkdownEditor placeholder="可手动编辑 Markdown，或点击「从代码生成文档」" />
          </Form.Item>
        </Form>
      </Modal>

      <DocGenerateProgressModal
        open={generateModalOpen}
        itemId={generateTarget?.itemId ?? null}
        title={generateTarget?.title}
        docType={generateTarget?.docType}
        onClose={() => {
          setGenerateModalOpen(false);
          setGenerateTarget(null);
        }}
        onComplete={onApplyGeneratedContent}
      />
    </>
  );
}
