# 前端客户端契约(CLIENT.md)

> 本文件是给**负责前端实现的 agent** 的交接契约。后端(宿主侧)已完成,
> 本文件定义前端必须产出的文件、接口与约束。设计规格以
> `scratch-exploration-panel/ui-design-light.md` 为准(浅色主题 UI 设计文档,
> 视觉与行为逐条落实 §4/§5/§6/§7/§8/§10/§11);需求背景见同目录
> `requirements.md` / `data-contract.md` / `acceptance.md`。

## 必须产出的文件(位于本项目根下)

```
src/client/index.ts         插件入口:locale + view tab + dock 注册
src/client/locales.ts       NS 'exploration' 的 zh/en 字典 + LocaleNamespaceMap 合并
src/client/PanelView.tsx    主面板(方向锚/执行流/证据桶/NEW 分组/图例)
src/client/PanelView.module.css
src/client/DockStrip.tsx    紧凑条(一行摘要 + 呼吸点 + NEW 脉冲 + 展开迷你面板)
src/client/DockStrip.module.css
src/client/new-increment.ts 纯函数:NEW 条目筛选(可测试)
tests/client/panel-view.spec.tsx   // @vitest-environment jsdom
tests/client/dock-strip.spec.tsx
```

## 后端已提供、前端直接消费

- **投影数据**:`useProjection('exploration')`(PropsRuntime 标准套件),类型
  `ExplorationProjection` 从 `../types.ts` 导入(含 `SessionProjectionMap`
  的 `exploration` 键合并,宿主 `src/types.ts` 已声明)。
- **构建**:`tsdown.config.mjs` 已含客户端 bundle 配置(入口
  `src/client/index.ts` → `lib/client.js`,loader 契约
  `window.__ModuleLoader__.load({ id: 'dsh-exploration-panel', factory })`,
  CSS Modules 经 lightningcss 编译注入)。
- **宿主行**:`cordis.patch.yml` 已含 `ui-exploration` 行(name
  `dsh-exploration-panel`),`package.json` 已含 `dsh.client` manifest 与
  `./client` 导出。前端无需改动这些。

## 投影 schema(后端折叠产物)

```ts
interface ExplorationProjection {
  version: 1
  counts: { files: number; modified: number; searches: number; web: number; shell: number; offPlan: number }
  files: Array<{ path: string; ranges: Array<{ start: number; end?: number }>; firstSeq: number; lastSeq: number; status: 'running'|'done'|'failed' }>
  modified: Array<{ path: string; seq: number; status: 'running'|'done'|'failed' }>
  searches: Array<{ tool: 'grep'|'glob'; pattern: string; seq: number; status: 'running'|'done'|'failed' }>
  web: Array<{ url: string; seq: number; status: 'running'|'done'|'failed' }>
  shell: Array<{ seq: number; status: 'running'|'done'|'failed' }>
  declaration: null | { seq: number; note?: string; items: Array<{ target: string; purpose?: string; status: 'pending'|'done'|'failed'; readSeqs: number[] }> }
  history: Array<{ seq: number; status: 'superseded'|'completed'; items: Array<{ target: string; purpose?: string; status: 'pending'|'done'|'failed'; readSeqs: number[] }> }>
  offPlan: Array<{ path: string; seq: number }>
  lastSeq: number
}
```

## 硬性约束

1. **值导入只允许 `react` 与 CSS Modules**;所有 `@deepseek-ai/*` 必须是
   `import type`(构建纯度门拒绝任何 @deepseek-ai 值导入)。
2. **CSS 只引用宿主 token**(`var(--dsw-*)`,设计文档 §3 token 表),禁止字面色值;
   字号/圆角/动效按 §3.4/§3.5/§7。
3. **零纠偏 UI**:无纠正/暂停/写回按钮;行点击仅导航(弹层显示事件 seq 或
   title 提示)。
4. **dock 不切换 conversation view tab**(chat store 从 dock 槽不可达,已确认
   偏差):点击切换自身展开的迷你面板。
5. **NEW 追踪**:localStorage key `dsh-exploration:lastseen:<sessionId>`;
   面板获得焦点/挂载时推进 last-seen,NEW 消退;筛选逻辑抽成
   `new-increment.ts` 纯函数。
6. **排序稳定、数字优先、双通道状态编码**(字形 ◐✓✕!○ + 颜色,灰度可辨)。
7. 中文产品文案、英文代码注释;严格 TS(strict),无 `any`。
8. 组件 props 形态照抄参考实现:
   - tab 注册:`packages/client/ui-trajectory/src/client/index.ts`
   - dock 注册:`packages/client/ui-goal/src/client/index.ts`
   - props 模式:`packages/client/ui-plan/src/client/PlanModeControl.tsx` +
     `packages/client/ui-trajectory/src/client/TrajectoryView.tsx`(确认是否含
     `PropsStore<ChatStore>`)
   - locale 字典:`packages/client/ui-plan/src/client/locales.ts`
   - 客户端纪律:`packages/client/AGENTS.md`
9. 组件测试:首行 `// @vitest-environment jsdom`,直接喂 props(stub
   useProjection/useSession),断言可见行为。
