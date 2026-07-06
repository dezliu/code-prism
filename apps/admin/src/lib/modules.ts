export type AdminModule = 'repos' | 'knowledge' | 'architecture' | 'templates' | 'alerts';

export const MODULE_LABELS: Record<AdminModule, string> = {
  repos: '代码源管理',
  knowledge: '知识库',
  architecture: '架构图',
  templates: '问答模板',
  alerts: '预警配置',
};

export function parseModuleParam(value: string | null): AdminModule | null {
  if (!value) return null;
  if (value in MODULE_LABELS) return value as AdminModule;
  return null;
}
