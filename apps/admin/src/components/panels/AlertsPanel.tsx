'use client';

import {
  Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { useEffect, useState } from 'react';
import { gql } from '../../lib/gql';

interface AlertRuleRow {
  id: string;
  name: string;
  ruleType: string;
  scope: string;
  scopeId: string | null;
  thresholdValue: number;
  thresholdUnit: string | null;
  notifyChannels: string[];
  enabled: boolean;
  updatedAt: string;
}

const RULE_TYPE_OPTIONS = [
  { value: 'health_score_min', label: '健康度评分下限' },
  { value: 'circular_deps_max', label: '循环依赖数上限' },
  { value: 'file_lines_max', label: '单文件行数上限' },
  { value: 'arch_drift', label: '架构漂移检测' },
];

const SCOPE_OPTIONS = [
  { value: 'global', label: '全局' },
  { value: 'team', label: '团队' },
  { value: 'project', label: '项目' },
];

const CHANNEL_OPTIONS = [
  { value: 'in_app', label: '站内消息' },
  { value: 'email', label: '邮件' },
];

export function AlertsPanel() {
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRuleRow | null>(null);
  const [form] = Form.useForm();
  const scope = Form.useWatch('scope', form);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await gql<{ alertRules: AlertRuleRow[] }>(`
        query { alertRules { id name ruleType scope scopeId thresholdValue thresholdUnit
          notifyChannels enabled updatedAt } }
      `);
      setRules(data.alertRules);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      scope: 'global',
      enabled: true,
      notifyChannels: ['in_app'],
      thresholdValue: 60,
      ruleType: 'health_score_min',
    });
    setModalOpen(true);
  };

  const openEdit = (row: AlertRuleRow) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      ruleType: row.ruleType,
      scope: row.scope,
      scopeId: row.scopeId ?? '',
      thresholdValue: row.thresholdValue,
      thresholdUnit: row.thresholdUnit ?? '',
      notifyChannels: row.notifyChannels,
      enabled: row.enabled,
    });
    setModalOpen(true);
  };

  const saveRule = async () => {
    const values = await form.validateFields();
    const input = {
      name: values.name,
      ruleType: values.ruleType,
      scope: values.scope,
      scopeId: values.scope === 'global' ? null : values.scopeId || null,
      thresholdValue: values.thresholdValue,
      thresholdUnit: values.thresholdUnit || null,
      notifyChannels: values.notifyChannels,
      enabled: values.enabled,
    };
    try {
      if (editing) {
        await gql(`
          mutation($id: ID!, $input: UpdateAlertRuleInput!) {
            updateAlertRule(id: $id, input: $input) { id }
          }
        `, { id: editing.id, input });
        message.success('预警规则已更新');
      } else {
        await gql(`
          mutation($input: CreateAlertRuleInput!) { createAlertRule(input: $input) { id } }
        `, { input });
        message.success('预警规则已创建');
      }
      setModalOpen(false);
      await loadRules();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  const deleteRule = (row: AlertRuleRow) => {
    Modal.confirm({
      title: '确认删除预警规则？',
      content: `将删除「${row.name}」。`,
      okType: 'danger',
      onOk: async () => {
        try {
          await gql(`mutation($id: ID!) { deleteAlertRule(id: $id) }`, { id: row.id });
          message.success('规则已删除');
          await loadRules();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败');
        }
      },
    });
  };

  const toggleEnabled = async (row: AlertRuleRow, enabled: boolean) => {
    try {
      await gql(`
        mutation($id: ID!, $input: UpdateAlertRuleInput!) {
          updateAlertRule(id: $id, input: $input) { id enabled }
        }
      `, { id: row.id, input: { enabled } });
      message.success(enabled ? '规则已启用' : '规则已停用');
      await loadRules();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败');
    }
  };

  return (
    <>
      <Card
        type="inner"
        title="预警规则"
        extra={<Button type="primary" onClick={openCreate}>新建规则</Button>}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rules}
          columns={[
            { title: '名称', dataIndex: 'name' },
            {
              title: '类型',
              dataIndex: 'ruleType',
              render: (v: string) => RULE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
            },
            {
              title: '作用范围',
              render: (_, row) => (
                <span>
                  {SCOPE_OPTIONS.find((o) => o.value === row.scope)?.label ?? row.scope}
                  {row.scopeId ? ` · ${row.scopeId}` : ''}
                </span>
              ),
            },
            {
              title: '阈值',
              render: (_, row) => `${row.thresholdValue}${row.thresholdUnit ? ` ${row.thresholdUnit}` : ''}`,
            },
            {
              title: '通知',
              render: (_, row) => row.notifyChannels.map((c) => (
                <Tag key={c}>{CHANNEL_OPTIONS.find((o) => o.value === c)?.label ?? c}</Tag>
              )),
            },
            {
              title: '启用',
              render: (_, row) => (
                <Switch checked={row.enabled} onChange={(checked) => toggleEnabled(row, checked)} />
              ),
            },
            {
              title: '操作',
              width: 140,
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                  <Button size="small" danger onClick={() => deleteRule(row)}>删除</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? '编辑预警规则' : '新建预警规则'}
        open={modalOpen}
        onOk={saveRule}
        onCancel={() => setModalOpen(false)}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select options={RULE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="scope" label="作用范围" rules={[{ required: true }]}>
            <Select options={SCOPE_OPTIONS} />
          </Form.Item>
          {scope && scope !== 'global' ? (
            <Form.Item
              name="scopeId"
              label={scope === 'team' ? '团队 ID' : '项目/仓库 ID'}
              rules={[{ required: true, message: '请填写作用范围 ID' }]}
            >
              <Input />
            </Form.Item>
          ) : null}
          <Form.Item
            name="thresholdValue"
            label="阈值"
            rules={[{ required: true, message: '请输入正数阈值' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="thresholdUnit" label="单位（可选）">
            <Input placeholder="score / count / lines" />
          </Form.Item>
          <Form.Item name="notifyChannels" label="通知渠道" rules={[{ required: true }]}>
            <Select mode="multiple" options={CHANNEL_OPTIONS} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
