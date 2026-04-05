# FUCK CANCER - MVP Design Document

> 一个开源的长期病程管理系统，帮助患者和家属在漫长的治疗过程中管理、理解和利用医疗信息。

## 1. 项目背景

肿瘤等重大疾病的治疗是一个漫长而复杂的过程。患者和家属面临：

- 每次就诊产生大量报告、处方、影像资料，难以整理
- 跨多个科室、多位医生，信息分散
- 治疗周期长（数月到数年），历史信息容易遗失
- 面对复杂医学信息，理解困难，决策焦虑

现有工具（如 NotebookLM）是通用文档问答，不理解医疗场景。本项目要做的是一个**懂病程的 AI 助手**。

## 2. MVP 范围

MVP 只做两件事，验证核心价值：

### 2.1 资料上传与管理

用户通过应用拍照/选文件，自动上传到用户自己的 Google Drive。

**支持的资料类型：**

| 类型 | 来源 | 处理方式 |
|------|------|----------|
| 检查报告（纸质） | 手机拍照 | OCR 提取文字 + 原图存档 |
| 检查报告（电子） | PDF/图片上传 | 直接解析 |
| 处方/用药单 | 拍照/截图 | OCR + 药品识别 |
| 就诊录音文本 | 粘贴/截图 | 用户自行通过 Gemini Web 解析录音，将结果粘贴或截图上传 |
| 医院 App 截图 | 相册选取 | OCR 提取 |

**上传流程：**

```
用户拍照/选文件 → 应用上传到 Google Drive 指定文件夹 → 后端记录文件索引 → 触发 AI 预处理
```

### 2.2 AI 病情分析与问答

基于用户上传的全部资料，提供：

- **自动摘要**：每次上传新资料后，AI 自动提取关键信息（诊断、指标、用药）
- **问答对话**：用户可以自然语言提问，AI 基于所有历史资料回答
  - "最近三次的 CEA 指标变化趋势？"
  - "医生上次说的方案和这次有什么变化？"
  - "这个药的常见副作用是什么？"

### 2.3 MVP 不做的事

以下功能在 MVP 中**明确不做**，后续迭代：

- [ ] 病程时间线可视化
- [ ] 指标趋势图表
- [ ] 复查/用药提醒
- [ ] 多人协作（家属共享）
- [ ] 就诊准备清单自动生成
- [ ] 多语言支持

## 3. 系统架构

```
┌─────────────────────────────────────────────────┐
│                   用户浏览器                      │
│              React + TailwindCSS                 │
└──────────────────┬──────────────────────────────┘
                   │
                   │ HTTP API
                   │
┌──────────────────▼──────────────────────────────┐
│                 后端服务                           │
│              Node.js + Fastify                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Auth     │  │ File     │  │ AI Analysis   │  │
│  │ Module   │  │ Manager  │  │ Engine        │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
└───────┼──────────────┼────────────────┼──────────┘
        │              │                │
   ┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
   │ Postgres │   │  Google   │   │ LLM API   │
   │          │   │  Drive    │   │ (用户BYOK) │
   └──────────┘   └───────────┘   └───────────┘
```

### 3.1 私有化部署

```bash
git clone https://github.com/xxx/fuck-cancer.git
cd fuck-cancer
cp .env.example .env  # 填入 Google OAuth 凭据和 LLM API Key
docker compose up
```

用户只需要：
1. 一个 Google 账号（用于登录 + Drive 存储）
2. 一台能跑 Docker 的机器（本地电脑、NAS、云服务器均可）
3. （可选）一个 LLM API Key — 不配置也能正常使用资料管理功能，AI 分析和问答需要配置后解锁

## 4. 技术选型

| 层 | 技术 | 理由 |
|----|------|------|
| 前端 | React 18 + TailwindCSS | 生态成熟，AI 辅助开发友好 |
| 后端 | Node.js + Fastify | 高性能，TypeScript 全栈统一 |
| 数据库 | PostgreSQL 16 | 可靠，JSON 支持好，适合存储结构化+半结构化数据 |
| 文件存储 | Google Drive API v3 | 零成本，用户数据自主权 |
| AI 集成 | LLM 抽象层（支持多厂商） | BYOK 模式，用户自选模型 |
| OCR | 直接用 LLM Vision 能力 | Gemini/Claude 都支持图片识别，省掉独立 OCR 依赖 |
| 录音解析 | 用户自行使用 Gemini Web | 多角色录音识别目前只有 Gemini 做得好，MVP 不自建 |
| 容器化 | Docker + Docker Compose | 一键部署 |

## 5. 数据模型

### 5.1 本地数据库（PostgreSQL）

```sql
-- 用户表
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    name          VARCHAR(255),
    google_token  TEXT,          -- 加密存储的 Google OAuth token
    llm_provider  VARCHAR(50),   -- gemini / claude / openai
    llm_api_key   TEXT,          -- 加密存储的 API Key
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 病例（一个用户可以管理多个病例，比如爸爸和妈妈的）
CREATE TABLE cases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id),
    patient_name  VARCHAR(255) NOT NULL,
    diagnosis     TEXT,          -- 主要诊断
    notes         TEXT,          -- 备注
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 文件索引（实际文件在 Google Drive）
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES cases(id),
    drive_file_id   VARCHAR(255) NOT NULL,  -- Google Drive 文件 ID
    file_name       VARCHAR(255),
    file_type       VARCHAR(50),   -- image / pdf / audio / screenshot
    category        VARCHAR(50),   -- report / prescription / recording / other
    doc_date        DATE,          -- 文件对应的就诊日期
    ocr_text        TEXT,          -- OCR/转录的文本内容
    ai_summary      TEXT,          -- AI 提取的摘要
    ai_metadata     JSONB,         -- AI 提取的结构化数据（指标、药品等）
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 对话历史
CREATE TABLE conversations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id       UUID REFERENCES cases(id),
    role          VARCHAR(20) NOT NULL,  -- user / assistant
    content       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Google Drive 文件夹结构

```
fuck-cancer/
├── 爸爸-肺癌/
│   ├── 2026-03-15-CT报告/
│   │   ├── report.jpg
│   │   └── report.pdf
│   ├── 2026-03-20-血液检查/
│   │   └── blood-test.jpg
│   └── 2026-04-01-门诊记录/
│       └── visit-notes.txt    ← Gemini Web 解析录音后粘贴保存
└── 妈妈-体检/
    └── ...
```

## 6. 核心 API 设计

```
# 认证
POST   /api/auth/google          # Google OAuth 登录
POST   /api/auth/logout          # 登出

# 病例管理
POST   /api/cases                # 创建病例
GET    /api/cases                # 获取所有病例
GET    /api/cases/:id            # 获取单个病例详情

# 文件管理
POST   /api/cases/:id/documents  # 上传文件（→ Google Drive + 创建索引）
GET    /api/cases/:id/documents  # 获取病例下所有文件
DELETE /api/documents/:id        # 删除文件（同步删 Drive）

# AI 分析
POST   /api/documents/:id/analyze    # 触发单个文件的 AI 分析
POST   /api/cases/:id/chat           # 基于病例的 AI 问答
GET    /api/cases/:id/conversations   # 获取对话历史

# 设置
PUT    /api/settings/llm         # 更新 LLM 配置（provider + key）
```

## 7. AI 分析设计

### 7.1 文件分析 Pipeline

```
资料输入
  │
  ├─ 图片 → LLM Vision 识别 ─┐
  ├─ PDF → 文本提取 ──────────┤
  ├─ 粘贴文本（录音转写等）───┤
  │                           │
  │                    ┌──────▼──┐
  │                    │ 原始文本  │
  │                    └──────┬──┘
  │                           │
  │                    ┌────▼──────────┐
  │                    │ LLM 结构化提取 │
  │                    │ - 文件类型识别  │
  │                    │ - 日期提取     │
  │                    │ - 关键指标提取  │
  │                    │ - 摘要生成     │
  │                    └────┬──────────┘
  │                         │
  │                    ┌────▼────┐
  │                    │ 存入数据库│
  │                    └─────────┘
```

### 7.2 问答上下文构建

用户提问时，系统需要构建有效的上下文：

```
System Prompt（医疗助手角色定义）
  +
病例基本信息（诊断、治疗阶段）
  +
所有文件的 AI 摘要和结构化数据（按时间排序）
  +
近期对话历史
  +
用户当前问题
  →
LLM 生成回答
```

### 7.3 多 LLM 支持

```typescript
interface LLMProvider {
    chat(messages: Message[], options?: LLMOptions): Promise<string>;
    supportVision(): boolean;
}

// 支持的 provider
// - GeminiProvider  (推荐，成本最低)
// - ClaudeProvider
// - OpenAIProvider
```

## 8. 前端页面设计

MVP 只需要 4 个页面：

### 8.1 登录页
- Google 一键登录
- 登录后可直接使用资料管理功能，无需配置 API Key
- AI 功能（自动摘要、问答）在用户配置 API Key 后解锁，入口在设置页

### 8.2 病例列表页
- 卡片式展示所有病例
- 创建新病例（患者姓名 + 诊断）

### 8.3 病例详情页（核心页面）
- 顶部：患者基本信息
- 资料区：按时间倒序展示所有上传的文件和 AI 摘要
- 上传按钮：拍照 / 选文件 / 录音
- 底部固定：进入 AI 对话的入口

### 8.4 AI 对话页
- 类 ChatGPT 的对话界面
- 基于当前病例的所有资料进行问答

## 9. 安全与隐私

- 医疗数据（文件原件）**仅存储在用户自己的 Google Drive**，不经过也不存储在后端
- OCR/转录文本和 AI 摘要存在本地 PostgreSQL（私有化部署，数据在用户自己机器上）
- Google OAuth Token 和 LLM API Key **加密存储**
- AI 分析直接从用户浏览器或后端调用 LLM API，不经过中间服务
- 开源代码，用户可以审计

## 10. 开发计划

### Phase 1：项目骨架（Week 1）
- [ ] 初始化前后端项目
- [ ] Docker Compose 配置
- [ ] Google OAuth 登录
- [ ] 基础 UI 框架

### Phase 2：资料管理（Week 2）
- [ ] Google Drive API 集成
- [ ] 文件上传（拍照/选文件）
- [ ] OCR 集成（图片文字提取）
- [ ] 文件列表展示

### Phase 3：AI 分析（Week 3）
- [ ] LLM 抽象层（多 provider 支持）
- [ ] 文件自动分析 pipeline
- [ ] AI 对话功能
- [ ] 上下文构建

### Phase 4：打磨发布（Week 4）
- [ ] 部署文档
- [ ] README + 使用说明
- [ ] 测试 + Bug 修复
- [ ] GitHub 开源发布
