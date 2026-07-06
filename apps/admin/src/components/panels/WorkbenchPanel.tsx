'use client';

const MODULES = [
  { key: 'repos', icon: '⎇', label: '代码源管理', desc: 'Git 仓库接入、元数据、索引纳管' },
  { key: 'knowledge', icon: '📄', label: '知识库', desc: '文档草稿与发布' },
  { key: 'architecture', icon: '◇', label: '架构图', desc: '草稿生成与官方版发布' },
  { key: 'templates', icon: '⌘', label: '问答模板', desc: '触发条件与结构化输出格式' },
  { key: 'alerts', icon: '⚡', label: '预警配置', desc: '健康度阈值与架构漂移规则' },
] as const;

interface WorkbenchPanelProps {
  onSelect?: (key: (typeof MODULES)[number]['key']) => void;
}

export function WorkbenchPanel({ onSelect }: WorkbenchPanelProps) {
  return (
    <div className="admin-workbench-grid">
      {MODULES.map((m) => (
        <button
          key={m.key}
          type="button"
          className="admin-workbench-card"
          onClick={() => onSelect?.(m.key)}
        >
          <span className="admin-workbench-icon">{m.icon}</span>
          <h3>{m.label}</h3>
          <p>{m.desc}</p>
        </button>
      ))}
    </div>
  );
}
