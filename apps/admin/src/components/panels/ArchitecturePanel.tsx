'use client';

import { Button, Card, Input, Select, Space, message } from 'antd';
import { useEffect, useState } from 'react';
import { ArchitectureGraph, type GraphData } from '@lingprism/graph-viz';
import { gql } from '../../lib/gql';

interface RepoOption {
  id: string;
  name: string;
  displayName: string | null;
}

export function ArchitecturePanel() {
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [repoId, setRepoId] = useState<string>();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [versionNote, setVersionNote] = useState('');

  useEffect(() => {
    gql<{ repos: RepoOption[] }>(`query { repos { id name displayName } }`)
      .then((data) => {
        setRepos(data.repos);
        if (data.repos[0]) setRepoId(data.repos[0].id);
      })
      .catch((error) => {
        message.error(error instanceof Error ? error.message : '加载仓库失败');
      });
  }, []);

  const generateDraft = async () => {
    if (!repoId) return;
    try {
      const data = await gql<{ generateArchDraft: { graphData: GraphData } }>(`
        mutation($repoId: ID!) {
          generateArchDraft(repoId: $repoId) {
            graphData { nodes { id label type } edges { id source target label } }
          }
        }
      `, { repoId });
      setGraph(data.generateArchDraft.graphData);
      message.success('草稿已生成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败');
    }
  };

  const publish = async () => {
    if (!repoId || !versionNote.trim()) {
      message.warning('请填写版本说明');
      return;
    }
    try {
      await gql(`
        mutation($repoId: ID!, $versionNote: String!) {
          publishOfficialArchitecture(repoId: $repoId, versionNote: $versionNote) { id version }
        }
      `, { repoId, versionNote });
      message.success('官方架构图已发布');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    }
  };

  return (
    <div className="admin-panel">
      <Card type="inner" style={{ marginBottom: 16 }} className="admin-panel-inner">
        <Space wrap>
          <Select
            style={{ width: 280 }}
            value={repoId}
            onChange={setRepoId}
            options={repos.map((r) => ({ value: r.id, label: r.displayName || r.name }))}
          />
          <Button type="primary" onClick={generateDraft}>生成草稿</Button>
          <Input
            placeholder="发布说明"
            value={versionNote}
            onChange={(e) => setVersionNote(e.target.value)}
            style={{ width: 240 }}
          />
          <Button onClick={publish}>发布官方版</Button>
        </Space>
      </Card>
      <Card type="inner" title="架构草稿预览" className="admin-panel-inner">
        {graph ? (
          <ArchitectureGraph data={graph} />
        ) : (
          '选择仓库并点击「生成草稿」'
        )}
      </Card>
    </div>
  );
}
