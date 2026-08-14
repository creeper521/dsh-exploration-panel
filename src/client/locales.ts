/**
 * `exploration` namespace dictionaries: the panel's tab label, section copy,
 * dock line, and legend strings.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'exploration'

/** The exploration dictionary key set (the source of truth for both locales). */
export type ExplorationKey =
  | 'view.exploration'
  | 'aria.panel'
  | 'anchor.label'
  | 'anchor.goalEmpty'
  | 'anchor.user'
  | 'flow.declPlan'
  | 'flow.items'
  | 'flow.allDone'
  | 'flow.history'
  | 'flow.superseded'
  | 'flow.completed'
  | 'flow.failed'
  | 'flow.reading'
  | 'flow.pending'
  | 'flow.done'
  | 'flow.offplan'
  | 'flow.readingHint'
  | 'flow.pendingHint'
  | 'flow.offplanHint'
  | 'flow.emptyReading'
  | 'flow.emptyPending'
  | 'flow.emptyDone'
  | 'flow.emptyOffplan'
  | 'bucket.files'
  | 'bucket.modified'
  | 'bucket.search'
  | 'bucket.web'
  | 'bucket.shell'
  | 'bucket.lines'
  | 'bucket.queries'
  | 'bucket.cmds'
  | 'bucket.shellItem'
  | 'bucket.more'
  | 'legend.inflight'
  | 'legend.done'
  | 'legend.failed'
  | 'legend.offplan'
  | 'legend.pending'
  | 'new.badge'
  | 'new.group'
  | 'dock.reading'
  | 'dock.pending'
  | 'dock.read'
  | 'dock.offplan'
  | 'dock.idle'
  | 'dock.expand'
  | 'dock.collapse'
  | 'empty.noEvents'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The exploration panel's copy (tab label, sections, dock, legend). */
    'exploration': ExplorationKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<ExplorationKey, string> = {
  'view.exploration': '探索对齐',
  'aria.panel': '探索对齐面板',
  'anchor.label': '方向锚 · 当前目标',
  'anchor.goalEmpty': '(尚无活跃目标)',
  'anchor.user': '用户',
  'flow.declPlan': '已声明读取计划',
  'flow.items': '项',
  'flow.allDone': '声明已完成(全部读取)',
  'flow.history': '历史声明',
  'flow.superseded': '已被新计划取代',
  'flow.completed': '已完成',
  'flow.failed': '读取失败',
  'flow.reading': '正在读',
  'flow.pending': '待读',
  'flow.done': '已完成',
  'flow.offplan': '脱轨',
  'flow.readingHint': 'in-flight · 流式',
  'flow.pendingHint': '声明未执行',
  'flow.offplanHint': '未声明读取',
  'flow.emptyReading': '暂无进行中读取。',
  'flow.emptyPending': '无活跃声明,不显示待读。',
  'flow.emptyDone': '暂无已完成的声明项。',
  'flow.emptyOffplan': '无脱轨。',
  'bucket.files': 'Files',
  'bucket.modified': 'Modified',
  'bucket.search': 'Search',
  'bucket.web': 'Web',
  'bucket.shell': 'Shell',
  'bucket.lines': '{n} 行',
  'bucket.queries': '{n} 次',
  'bucket.cmds': '{n} 条',
  'bucket.shellItem': '命令',
  'bucket.more': '+{n} …',
  'legend.inflight': '进行中',
  'legend.done': '已完成',
  'legend.failed': '失败',
  'legend.offplan': '脱轨',
  'legend.pending': '待读',
  'new.badge': 'NEW',
  'new.group': '自上次查看以来',
  'dock.reading': '正在读',
  'dock.pending': '待读',
  'dock.read': '已读',
  'dock.offplan': '脱轨',
  'dock.idle': '空闲 · 等待 agent 开始读取',
  'dock.expand': '展开面板 ▴',
  'dock.collapse': '收起 ▾',
  'empty.noEvents': '暂无会话事件 — agent 开始读取后,这里会实时对齐它的方向。',
}

/** English dictionary. */
export const en: Record<ExplorationKey, string> = {
  'view.exploration': 'Exploration',
  'aria.panel': 'Exploration panel',
  'anchor.label': 'Direction anchor · current goal',
  'anchor.goalEmpty': '(no active goal yet)',
  'anchor.user': 'user',
  'flow.declPlan': 'Declared read plan',
  'flow.items': 'items',
  'flow.allDone': 'Plan complete (all read)',
  'flow.history': 'Declaration history',
  'flow.superseded': 'superseded by a newer plan',
  'flow.completed': 'completed',
  'flow.failed': 'read failed',
  'flow.reading': 'Reading now',
  'flow.pending': 'To read',
  'flow.done': 'Done',
  'flow.offplan': 'Off-plan',
  'flow.readingHint': 'in-flight · streaming',
  'flow.pendingHint': 'declared, not yet executed',
  'flow.offplanHint': 'undeclared reads',
  'flow.emptyReading': 'No in-flight reads.',
  'flow.emptyPending': 'No active declaration — to-read hidden.',
  'flow.emptyDone': 'No completed declared items yet.',
  'flow.emptyOffplan': 'None off-plan.',
  'bucket.files': 'Files',
  'bucket.modified': 'Modified',
  'bucket.search': 'Search',
  'bucket.web': 'Web',
  'bucket.shell': 'Shell',
  'bucket.lines': '{n} lines',
  'bucket.queries': '{n} queries',
  'bucket.cmds': '{n} cmds',
  'bucket.shellItem': 'command',
  'bucket.more': '+{n} …',
  'legend.inflight': 'in-flight',
  'legend.done': 'done',
  'legend.failed': 'failed',
  'legend.offplan': 'off-plan',
  'legend.pending': 'pending',
  'new.badge': 'NEW',
  'new.group': 'since you last looked',
  'dock.reading': 'reading',
  'dock.pending': 'to-read',
  'dock.read': 'read',
  'dock.offplan': 'off-plan',
  'dock.idle': 'idle · waiting for the agent to read',
  'dock.expand': 'expand ▴',
  'dock.collapse': 'collapse ▾',
  'empty.noEvents': 'No session events yet — once the agent starts reading, its direction shows up here live.',
}
