# dsh-exploration-panel

Agent 探索对齐面板 — 一个可独立安装的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。

它抹平一部分人机信息差:让人的感知与 agent 的信息获取过程对齐 —— **agent 在读什么、声明了接下来要读什么、实际读的和声明的不一致(脱轨)在哪里**。人据此判断方向对不对,并自行在对话中打断纠正。**面板是纯感知面:零模型调用、零纠偏交互。**

## 安装

```sh
# 本地 checkout
dsh plugin --profile <name> add ./dsh-exploration-panel

# 或从 git(需要 pnpm ≥10 的 allowBuilds,见 deepseek-harness 文档 publish.md)
dsh plugin --profile demo add github:you/dsh-exploration-panel

# 或从 npm(发布后)
dsh plugin --profile demo add dsh-exploration-panel
```

安装后 `dsh plugin` 自动把本包追加到 profile 的 `dsh.profile.bundles`,启动 profile 即生效:

```sh
dsh --profile web        # 浏览器打开 Web GUI
```

Web GUI 的对话视图标签环里出现「探索对齐 / Exploration」tab,输入框上方出现状态条。

## 它做什么

| 面板区域 | 内容 | 数据来源 |
|---|---|---|
| 方向锚 | 当前活跃声明的说明(如有) | 会话日志折叠 |
| 执行流 | 正在读 → 待读(声明项)→ 已完成 → 脱轨 | 会话日志折叠 |
| 证据桶 | Files(合并行区间)/ Modified / Search / Web / Shell | 会话日志折叠 |
| NEW 增量 | 上次查看后的变化分组 | 浏览器本地 last-seen |
| dock 条 | 一行摘要 + 进行中呼吸点 + NEW 脉冲 | 同一投影 |

**机制**:模型通过 `exploration` 工具批量声明接下来 2–5 个读取目标及原因;声明先于执行,人为纠偏窗口由此产生。声明就是一次普通工具调用(`tool/call`+`tool/result` 进日志,满足"模型可见 ⟺ 已记日志"),不需要自定义事件。面板全部数据由纯函数从会话日志折叠(`src/fold.ts`),**每次刷新零模型调用**。

## 关键设计

- **单一事实源**:`src/fold.ts` 是唯一折叠实现,声明工具(变更门控)与投影单元共用,模型侧与面板侧不可能分叉。
- **脱轨是"当时"判定**:读取完成时不在活跃声明里、且从未读过 → 脱轨;之后的声明不会翻案历史。
- **声明生命周期**:新声明取代旧声明(进历史);全部完成折叠为"已完成";声明了却没读就一直挂着(未执行本身是信号)。
- **变更门控**:与活跃声明相同的声明调用是 no-op,不刷新面板。
- **纯感知面**:无任何纠正/暂停/写回 UI;打断由人在对话中完成。
- **KV 缓存友好**:引导提示词段是静态文本;工具 schema 静态;声明结果小且 append-only。

## 项目结构

```
src/
  fold.ts         纯折叠:会话事件 → 投影状态(唯一事实源)
  tool.ts         exploration 声明工具 + 引导提示词段
  projection.ts   投影单元(host 平面,`exploration` 键)
  invariant.ts    一致性配套(引用完整性断言)
  types.ts        投影 schema 类型 + SessionProjectionMap 合并
  client/         浏览器半部分:主面板 tab + dock 条 + locales
tests/            折叠/工具/投影单元/客户端组件测试
cordis.patch.yml  bundle 补丁:四行(工具/投影/invariant/客户端)
```

## 构建与测试

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm test            # vitest run
pnpm run build       # tsc 声明 + tsdown(宿主 lib/*.js + 浏览器 lib/client.js)
```

客户端 bundle(`lib/client.js`)按 dsh 客户端加载器契约生成:`window.__ModuleLoader__.load({ id, factory })`,
平台模块走冻结模块表(与宿主 `packages/client/web/src/platform.ts` 一致),其余依赖内联,CSS Modules 经 lightningcss 编译注入。

## 与设计文档的偏差(有意为之)

- **dock 点击不切换 conversation view tab**:chat store 从 `conversation.input.dock` 槽不可达(公开 API 不暴露 `setView`),改为 dock 自身展开迷你面板。完整面板从标签环打开。
- **Search 桶不显示命中数**:grep/glob 的命中数需要解析工具结果文本,属脆弱解析,V1 只显示 pattern。
- **工具注册在进程级**:所有会话(含 minimal 预设)都能看到 `exploration` 工具;minimal 的 `complete: true` persona 会抑制引导段。不需要的部署可在 profile `cordis.patch.yml` 里禁用 `exploration-tool` 行。
- 设计契约的完整背景见 `scratch-exploration-panel/` 目录(需求/数据契约/验收/UI 设计文档)。

## 许可

MIT
