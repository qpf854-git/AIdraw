# QMind · AI 智能绘图

用自然语言描述，AI 自动生成可编辑的流程图 / 架构图 / 思维导图。

在 [draw.io](https://github.com/jgraph/drawio) 编辑器组件基础上增加 AI Agent 面板，支持多轮连续对话修改图表并实时预览。

## 特性

- **自然语言生成图表** — 输入一句话，AI 生成 draw.io 兼容的 `mxGraphModel` XML 并直接渲染
- **多轮连续修改** — 每次对话自动携带当前画布 XML，AI 在此基础上增量修改（改颜色、加节点、调整结构）
- **完整 draw.io 编辑能力** — 基于官方 draw.io 嵌入模式，AI 生成后仍可拖拽、连线、改样式、导出 PNG/SVG
- **三种图类型预设** — 流程图 / 思维导图 / 架构图 / ER 图，一键填充示例提示
- **深色科技风 UI** — 玻璃态面板、生成状态指示、轮次计数

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express |
| AI | DeepSeek（OpenAI 兼容接口，模型 `deepseek-chat`） |
| 前端 | 原生 HTML/CSS/JS，无构建步骤 |
| 编辑器 | draw.io embed 模式（iframe + `postMessage` JSON 协议） |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 DeepSeek API Key（https://platform.deepseek.com/api_keys）

# 3. 启动
npm start
```

打开 http://localhost:3000 即可使用。

> 未配置 API Key 时服务自动进入 **MOCK 模式**，返回示例图表，便于离线验证前后端链路。

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 无（进入 mock 模式） |
| `DEEPSEEK_BASE_URL` | API 地址（OpenAI 兼容） | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 模型 ID | `deepseek-chat` |
| `PORT` | 服务端口 | `3000` |

## 使用方式

1. 等待右侧 draw.io 画布加载完成（右上角状态变绿「就绪」）
2. 在左侧 AI Agent 面板描述需求，或点击预设按钮
3. 点击「生成」，图表实时渲染到画布
4. 继续输入修改指令（如「把所有方框改成红色」「再增加一个支付步骤」），AI 会基于当前图表修改
5. 可在画布中直接编辑，并通过工具栏导出 PNG / 缩放 / 清空

## 项目结构

```
qmind/
├── server.js           # Express 后端：/api/chat 调用 DeepSeek，强制输出 draw.io XML
├── package.json
├── .env.example        # 环境变量模板（.env 已被 git 忽略）
└── public/
    ├── index.html      # 页面布局：左 AI 面板 + 右 draw.io 画布
    ├── styles.css      # 深色科技风样式
    └── app.js          # 对话逻辑 + draw.io iframe postMessage 通信
```

## 工作原理

```
用户输入 ──▶ /api/chat ──▶ DeepSeek（系统提示词约束输出 mxGraphModel XML）
                              │
                              ▼
              前端提取 XML ──▶ postMessage({action:'load', xml})
                              │
                              ▼
                   draw.io iframe 渲染（可继续人工编辑）
                              │
              下一轮：export 当前 XML 作为上下文回传 AI
```
