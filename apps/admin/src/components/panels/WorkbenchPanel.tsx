'use client';

import { Col, Row, Statistic } from 'antd';
import {
  AlertOutlined,
  ApiOutlined,
  BookOutlined,
  DatabaseOutlined,
  PartitionOutlined,
} from '@ant-design/icons';

const MODULES = [
  { key: 'repos', icon: <DatabaseOutlined />, label: '代码源管理', desc: 'Git 仓库接入、元数据、索引纳管' },
  { key: 'knowledge', icon: <BookOutlined />, label: '知识库', desc: '文档草稿与发布' },
  { key: 'architecture', icon: <PartitionOutlined />, label: '架构图', desc: '草稿生成与官方版发布' },
  { key: 'templates', icon: <ApiOutlined />, label: '问答模板', desc: '触发条件与结构化输出格式' },
  { key: 'alerts', icon: <AlertOutlined />, label: '预警配置', desc: '健康度阈值与架构漂移规则' },
] as const;

export function WorkbenchPanel() {
  return (
    <>
      <p style={{ marginBottom: 24 }}>
        请从左侧选择管理模块。代码源、知识库、架构图、问答模板与预警配置均已可用。
      </p>
      <Row gutter={[16, 16]}>
        {MODULES.map((m) => (
          <Col xs={24} sm={12} md={8} key={m.key}>
            <Statistic title={m.label} value={m.desc} prefix={m.icon} valueStyle={{ fontSize: 14 }} />
          </Col>
        ))}
      </Row>
    </>
  );
}
