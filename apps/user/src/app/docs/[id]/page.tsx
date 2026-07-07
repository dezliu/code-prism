'use client';

import { Breadcrumb, Button, Card, Divider, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { gql } from '../../../lib/gql';

const { Title, Text } = Typography;

interface DocDetail {
  id: string;
  knowledgeBaseId: string;
  title: string;
  docType: string;
  content: string;
  status: string;
}

interface KnowledgeBase {
  id: string;
  title: string;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  training: '培训文档',
  design: '设计文档',
  adr: 'ADR',
  ops: '运维文档',
  other: '其他',
};

export default function DocDetailPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params.id as string;
  
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocDetail();
  }, [docId]);

  const loadDocDetail = async () => {
    setLoading(true);
    try {
      // 获取文档详情
      const docData = await gql<{ knowledgeDocItem: DocDetail | null }>(`
        query($id: ID!) {
          knowledgeDocItem(id: $id) {
            id
            knowledgeBaseId
            title
            docType
            content
            status
          }
        }
      `, { id: docId });

      if (!docData.knowledgeDocItem) {
        setDoc(null);
        return;
      }

      setDoc(docData.knowledgeDocItem);

      // 获取知识库信息
      const baseData = await gql<{ knowledgeBase: KnowledgeBase | null }>(`
        query($id: ID!) {
          knowledgeBase(id: $id) {
            id
            title
          }
        }
      `, { id: docData.knowledgeDocItem.knowledgeBaseId });

      if (baseData.knowledgeBase) {
        setKnowledgeBase(baseData.knowledgeBase);
      }
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (knowledgeBase) {
      router.push(`/docs?knowledgeBaseId=${knowledgeBase.id}`);
    } else {
      router.push('/docs');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text type="secondary">加载中...</Text>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Title level={3}>文档不存在</Title>
        <Button onClick={handleBack}>返回文档中心</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* 顶部工具栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottom: '1px solid #f0f0f0'
      }}>
        <Space>
          <a href="/" style={{ color: '#1890ff' }}>智能问答</a>
          <a href="/architecture" style={{ color: '#1890ff' }}>架构图</a>
          <a href="/docs" style={{ color: '#1890ff' }}>文档中心</a>
          <a href="/code-search" style={{ color: '#1890ff' }}>代码检索</a>
        </Space>
      </div>

      {/* 面包屑导航 */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={handleBack}>文档中心</a> },
          ...(knowledgeBase ? [{ title: knowledgeBase.title }] : []),
          { title: doc.title },
        ]}
      />

      {/* 返回按钮 */}
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={handleBack}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      {/* 文档标题和元信息 */}
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={2} style={{ margin: 0 }}>{doc.title}</Title>
          <Space>
            <Text type="secondary">类型：</Text>
            <Text>{DOC_TYPE_LABEL[doc.docType] || doc.docType}</Text>
          </Space>
        </Space>
      </Card>

      {/* 文档内容 */}
      <Card title="文档内容">
        {doc.content ? (
          <div className="markdown-content">
            <MarkdownPreview
              source={doc.content}
              style={{
                padding: 20,
                background: '#fff',
              }}
            />
          </div>
        ) : (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 40 }}>
            暂无内容
          </Text>
        )}
      </Card>
    </div>
  );
}
