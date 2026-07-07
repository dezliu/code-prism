'use client';

import { Card, Input, Select, Space, Tag, Typography } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { gql } from '../../lib/gql';

const { Title, Text } = Typography;
const { Search } = Input;

interface KnowledgeBase {
  id: string;
  title: string;
  repoIds: string[];
  itemCount: number;
}

interface DocItem {
  id: string;
  knowledgeBaseId: string;
  title: string;
  docType: string;
  status: string;
  updatedAt: string;
  indexedInSearch: boolean;
}

const DOC_TYPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'training', label: '培训文档' },
  { value: 'design', label: '设计文档' },
  { value: 'adr', label: 'ADR' },
  { value: 'ops', label: '运维文档' },
  { value: 'other', label: '其他' },
];

const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPE_OPTIONS.filter((o) => o.value !== 'all').map((o) => [o.value, o.label]),
);

const DOC_TYPE_COLOR: Record<string, string> = {
  training: 'blue',
  design: 'green',
  adr: 'orange',
  ops: 'purple',
  other: 'default',
};

export default function DocsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);

  // 从 URL 参数中获取知识库 ID
  useEffect(() => {
    const baseId = searchParams.get('knowledgeBaseId');
    if (baseId) {
      setSelectedBaseId(baseId);
    }
  }, [searchParams]);

  // 加载知识库列表
  useEffect(() => {
    loadBases();
  }, []);

  // 加载选中知识库的文档
  useEffect(() => {
    if (selectedBaseId) {
      loadDocs(selectedBaseId);
    } else {
      setDocs([]);
    }
  }, [selectedBaseId]);

  const loadBases = async () => {
    try {
      const data = await gql<{ knowledgeBases: KnowledgeBase[] }>(`
        query { 
          knowledgeBases { 
            id 
            title 
            repoIds 
            itemCount 
          } 
        }
      `);
      // 只显示有已发布文档的知识库
      const activeBases = data.knowledgeBases.filter((b) => b.itemCount > 0);
      setBases(activeBases);
      
      // 如果当前没有选中且有待选知识库，自动选中第一个
      if (!selectedBaseId && activeBases.length > 0) {
        setSelectedBaseId(activeBases[0].id);
      }
    } catch (error) {
      console.error('加载知识库失败:', error);
    }
  };

  const loadDocs = async (baseId: string) => {
    setLoading(true);
    try {
      const data = await gql<{ knowledgeBase: { items: DocItem[] } | null }>(`
        query($id: ID!) { 
          knowledgeBase(id: $id) { 
            items { 
              id 
              knowledgeBaseId 
              title 
              docType 
              status 
              updatedAt 
              indexedInSearch 
            } 
          } 
        }
      `, { id: baseId });
      
      const allDocs = data.knowledgeBase?.items ?? [];
      // 只显示已发布的文档（测试阶段可注释掉此行查看草稿）
      const publishedDocs = allDocs.filter((doc) => doc.status === 'published');
      // const publishedDocs = allDocs; // 测试时取消注释可查看草稿
      setDocs(publishedDocs);
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBaseSelect = (baseId: string) => {
    setSelectedBaseId(baseId);
    router.push(`/docs?knowledgeBaseId=${baseId}`, { scroll: false });
  };

  const handleDocClick = (docId: string) => {
    router.push(`/docs/${docId}`);
  };

  // 过滤文档
  const filteredDocs = docs.filter((doc) => {
    const matchType = filterType === 'all' || doc.docType === filterType;
    const matchSearch = !searchText || doc.title.toLowerCase().includes(searchText.toLowerCase());
    return matchType && matchSearch;
  });

  const selectedBase = bases.find((b) => b.id === selectedBaseId);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* 顶部工具栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 24,
        paddingBottom: 16,
        borderBottom: '1px solid #f0f0f0'
      }}>
        <Title level={2} style={{ margin: 0 }}>
          📚 文档中心
        </Title>
        <Space>
          <a href="/" style={{ color: '#1890ff' }}>智能问答</a>
          <a href="/architecture" style={{ color: '#1890ff' }}>架构图</a>
          <a href="/code-search" style={{ color: '#1890ff' }}>代码检索</a>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* 左侧：知识库列表 */}
        <Card
          title="知识库"
          style={{ width: 280, flexShrink: 0 }}
          bodyStyle={{ padding: 12 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bases.map((base) => (
              <div
                key={base.id}
                onClick={() => handleBaseSelect(base.id)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedBaseId === base.id ? '#e6f7ff' : 'transparent',
                  border: selectedBaseId === base.id ? '1px solid #1890ff' : '1px solid transparent',
                  transition: 'all 0.3s',
                }}
              >
                <Text strong>{base.title}</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color="blue">{base.itemCount} 篇文档</Tag>
                </div>
              </div>
            ))}
            {bases.length === 0 && (
              <Text type="secondary" style={{ textAlign: 'center', padding: 20 }}>
                暂无可用知识库
              </Text>
            )}
          </div>
        </Card>

        {/* 右侧：文档列表 */}
        <Card
          title={selectedBase ? `${selectedBase.title} - 文档列表` : '请选择知识库'}
          style={{ flex: 1 }}
          extra={
            selectedBase && (
              <Space>
                <Select
                  value={filterType}
                  onChange={setFilterType}
                  style={{ width: 120 }}
                  options={DOC_TYPE_OPTIONS}
                />
                <Search
                  placeholder="搜索文档..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 200 }}
                  allowClear
                />
              </Space>
            )
          }
        >
          {loading ? (
            <Text type="secondary">加载中...</Text>
          ) : filteredDocs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredDocs.map((doc) => (
                <Card
                  key={doc.id}
                  hoverable
                  onClick={() => handleDocClick(doc.id)}
                  style={{ cursor: 'pointer' }}
                  bodyStyle={{ padding: '16px 20px' }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 16 }}>{doc.title}</Text>
                      <Tag color={DOC_TYPE_COLOR[doc.docType] || 'default'}>
                        {DOC_TYPE_LABEL[doc.docType] || doc.docType}
                      </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      更新于 {new Date(doc.updatedAt).toLocaleString('zh-CN')}
                    </Text>
                  </Space>
                </Card>
              ))}
            </div>
          ) : (
            <Text type="secondary" style={{ textAlign: 'center', padding: 40 }}>
              {selectedBase ? '暂无符合条件的文档' : '请先选择左侧的知识库'}
            </Text>
          )}
        </Card>
      </div>
    </div>
  );
}
