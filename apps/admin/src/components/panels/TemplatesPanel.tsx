'use client';

import {
  Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { useEffect, useState } from 'react';
import { gql } from '../../lib/gql';

interface OutputField {
  name: string;
  required: boolean;
}

interface QaTemplateRow {
  id: string;
  name: string;
  questionTypes: string[];
  keywords: string[];
  outputFields: OutputField[];
  previewTemplate: string;
  applicableRoles: string[] | null;
  status: string;
  priority: number;
  updatedAt: string;
}

const QUESTION_TYPE_OPTIONS = [
  { value: 'architecture', label: '架构类' },
  { value: 'code', label: '代码类' },
  { value: 'doc', label: '文档类' },
  { value: 'people', label: '人员类' },
];

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<QaTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QaTemplateRow | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [form] = Form.useForm();

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await gql<{ qaTemplates: QaTemplateRow[] }>(`
        query { qaTemplates { id name questionTypes keywords outputFields { name required }
          previewTemplate applicableRoles status priority updatedAt } }
      `);
      setTemplates(data.qaTemplates);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'enabled',
      priority: 0,
      questionTypes: ['architecture'],
      outputFields: [{ name: '概述', required: true }],
    });
    setPreviewText('');
    setModalOpen(true);
  };

  const openEdit = (row: QaTemplateRow) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      questionTypes: row.questionTypes,
      keywords: row.keywords.join(', '),
      outputFields: row.outputFields,
      previewTemplate: row.previewTemplate,
      applicableRoles: row.applicableRoles?.join(', ') ?? '',
      status: row.status,
      priority: row.priority,
    });
    setPreviewText('');
    setModalOpen(true);
  };

  const saveTemplate = async () => {
    const values = await form.validateFields();
    const input = {
      name: values.name,
      questionTypes: values.questionTypes,
      keywords: String(values.keywords).split(',').map((k: string) => k.trim()).filter(Boolean),
      outputFields: values.outputFields,
      previewTemplate: values.previewTemplate,
      applicableRoles: String(values.applicableRoles ?? '')
        .split(',')
        .map((r: string) => r.trim())
        .filter(Boolean),
      status: values.status,
      priority: values.priority ?? 0,
    };
    try {
      if (editing) {
        await gql(`
          mutation($id: ID!, $input: UpdateQaTemplateInput!) {
            updateQaTemplate(id: $id, input: $input) { id }
          }
        `, { id: editing.id, input });
        message.success('模板已更新');
      } else {
        await gql(`
          mutation($input: CreateQaTemplateInput!) { createQaTemplate(input: $input) { id } }
        `, { input });
        message.success('模板已创建');
      }
      setModalOpen(false);
      await loadTemplates();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  const deleteTemplate = (row: QaTemplateRow) => {
    Modal.confirm({
      title: '确认删除模板？',
      content: `将删除「${row.name}」，此操作不可恢复。`,
      okType: 'danger',
      onOk: async () => {
        try {
          await gql(`mutation($id: ID!) { deleteQaTemplate(id: $id) }`, { id: row.id });
          message.success('模板已删除');
          await loadTemplates();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败');
        }
      },
    });
  };

  const runPreview = async () => {
    if (!editing) {
      message.info('请先保存模板后再预览');
      return;
    }
    const sampleQuestion = form.getFieldValue('sampleQuestion') || '请说明支付服务的整体架构';
    try {
      const data = await gql<{ previewQaTemplate: string }>(`
        query($id: ID!, $sampleQuestion: String!) {
          previewQaTemplate(id: $id, sampleQuestion: $sampleQuestion)
        }
      `, { id: editing.id, sampleQuestion });
      setPreviewText(data.previewQaTemplate);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '预览失败');
    }
  };

  return (
    <div className="admin-panel">
      <Card
        type="inner"
        title="问答模板"
        extra={<Button type="primary" onClick={openCreate}>新建模板</Button>}
        style={{ marginBottom: 16 }}
        className="admin-panel-inner"
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={templates}
          columns={[
            { title: '名称', dataIndex: 'name' },
            {
              title: '触发条件',
              render: (_, row) => (
                <Space wrap size={[4, 4]}>
                  {row.questionTypes.map((t) => <Tag key={t}>{t}</Tag>)}
                  {row.keywords.slice(0, 3).map((k) => <Tag key={k}>{k}</Tag>)}
                </Space>
              ),
            },
            {
              title: '输出格式',
              ellipsis: true,
              render: (_, row) => row.outputFields.map((f) => f.name).join(' → '),
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => <Tag color={v === 'enabled' ? 'green' : 'default'}>{v}</Tag>,
            },
            { title: '优先级', dataIndex: 'priority', width: 80 },
            {
              title: '操作',
              width: 180,
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                  <Button size="small" danger onClick={() => deleteTemplate(row)}>删除</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? '编辑问答模板' : '新建问答模板'}
        open={modalOpen}
        onOk={saveTemplate}
        onCancel={() => setModalOpen(false)}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="如：服务概览" />
          </Form.Item>
          <Form.Item name="questionTypes" label="问题类型" rules={[{ required: true }]}>
            <Select mode="multiple" options={QUESTION_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="keywords" label="匹配关键词（逗号分隔）" rules={[{ required: true }]}>
            <Input placeholder="架构, 模块, 依赖" />
          </Form.Item>
          <Form.List name="outputFields">
            {(fields, { add, remove }) => (
              <>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>输出字段</div>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      rules={[{ required: true, message: '字段名' }]}
                    >
                      <Input placeholder="字段名" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'required']} valuePropName="checked">
                      <Switch checkedChildren="必填" unCheckedChildren="可选" />
                    </Form.Item>
                    <Button type="link" onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ name: '', required: true })} block>
                  添加字段
                </Button>
              </>
            )}
          </Form.List>
          <Form.Item name="previewTemplate" label="预览文案" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="检测到相似问题时的卡片预览文案" />
          </Form.Item>
          <Form.Item name="applicableRoles" label="适用角色（可选，逗号分隔）">
            <Input placeholder="developer, leader" />
          </Form.Item>
          <Space>
            <Form.Item name="status" label="状态" style={{ width: 120 }}>
              <Select options={[
                { value: 'enabled', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]} />
            </Form.Item>
            <Form.Item name="priority" label="优先级">
              <InputNumber min={0} max={100} />
            </Form.Item>
          </Space>
          {editing ? (
            <>
              <Form.Item name="sampleQuestion" label="示例问题">
                <Input placeholder="输入示例问题用于预览" />
              </Form.Item>
              <Button onClick={runPreview}>预览输出效果</Button>
              {previewText ? (
                <pre style={{ marginTop: 12, background: '#f5f5f5', padding: 12, whiteSpace: 'pre-wrap' }}>
                  {previewText}
                </pre>
              ) : null}
            </>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
}
