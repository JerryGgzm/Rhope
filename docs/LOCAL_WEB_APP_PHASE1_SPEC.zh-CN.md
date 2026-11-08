# TradingAgents 本地 Web 工作台：第一阶段开发文档

版本：1.0 · 日期：2026-11-08 · 状态：供开发 agent 实施

## 1. 任务与交付边界

将现有 TradingAgents 的终端操作和输出完整迁移到运行在本机的 Web 界面。先建立统一、具有辨识度的前端设计，再立即连接现有 Python 分析引擎，交付真正可用的完整产品。

**交付不能停留在静态页面、mock 数据或孤立的前端。** 用户在页面完成配置、输入持仓、运行分析、查看进度、读取报告、执行回测和检查错误，不需要回到终端完成日常操作。首次安装及启动命令可保留；提供单一启动入口并自动打开浏览器。

本阶段允许新增支撑 Web 所必需的 API、后台任务、配置持久化、运行历史索引、持仓快照存储和错误事件。复用已有金融分析逻辑，不重写策略，不改变评分含义；保留 CLI 的兼容性。

本文件基于当前仓库源码审核，不意味着所有外部服务已经通过实网验证。文中的 API 路径、Web 存储结构和视觉 token 是**本阶段需要新增的设计**，不是已经存在的接口。视觉方向已经明确，但尚未产生用户确认的页面效果图；实现 agent 应先做可审阅的主页面视觉方案，再按同一套设计完成全部页面和真实联调。

### 1.1 本阶段必须实现

- 单只股票／支持的加密资产分析，现有全部分析师及完整决策过程。
- 模型与数据源配置、全部应用配置及相关环境变量的图形化管理。
- ChatGPT 订阅登录／退出、API Key 设置、本地模型和自定义端点设置。
- 持仓快照的录入、导入、编辑、保存、选择、导出及传入分析。
- 实时运行状态、工具调用、统计、部分报告、最终评级与完整报告。
- 历史运行、报告导出、断点恢复、清理断点。
- 现有回测、继续回测、结果统计、待结算／失败项展示。
- 决策记忆及结果复盘浏览，并封装已有结算能力。
- 任何来自后端的错误、降级、不可用数据和保存失败均有对应前端表达。

### 1.2 明确留到下一阶段

| 后续需求 | 第一阶段边界 |
|---|---|
| 输入行业并推荐 Top 20 | 不新增行业股票池、筛选、横向排名；当前分析仍以 ticker 为输入 |
| 输入每笔交易自动更新成本 | 只编辑当前持仓快照，不记录成交账本，不自动计算交易后的平均成本 |
| 财报发布后一键总结并建议交易 | 保留现有基本面分析；不新增全文上传、财报监听、电话会转录分析 |
| 未来 X 时间的定期买入／卖出计划 | 展示已有 time_horizon 和建议文本，不生成或执行定期计划 |
| 其他推荐功能 | 暂不设计实现细节，留给后续功能拓展文档 |

不要把这些未来功能做成可点击但无效果的按钮，不用虚构数据填充页面。代码结构可留模块扩展点，主导航只显示本期实际能使用的功能。

## 2. 源码事实与功能对应

实施开始前检查最新源码和适用的 AGENTS.md；以下路径相对仓库根目录，若代码已变化，以实际实现为准并更新对应关系。

| 能力 | 当前入口／事实 | Web 要求 |
|---|---|---|
| 单次分析 | `TradingAgentsGraph.propagate()`；`graph/trading_graph.py` | 返回异步 run ID，页面读取结果；不是把同步 HTTP 请求挂到结束 |
| 过程流 | `TradingAgentsGraph.stream_run()`；`cli/run.py` | 复用图事件、工具回调和阶段状态，不解析 Rich／ANSI 终端画面 |
| 四种分析师 | market、social、news、fundamentals；`agents/analysts/` | 页面显示“技术、情绪、新闻、基本面”；情绪后端 key 保持 `social` |
| 并行阶段 | `graph/analyst_execution.py`、图 setup | 分析师可并行，不能用假的串行进度条表示；记忆处理也可能并行 |
| 决策 | `agents/schemas.py`、`agents/rating.py` | 保留五档最终评级、三档交易动作和 REVIEW，区分各自来源 |
| 资产与代码 | `cli/prompts.py`、`dataflows/symbols.py` | 沿用解析、规范化及 crypto 分析师约束，展示原始输入与规范代码 |
| 持仓 | `portfolio.py` | `cash`、`currency`、`positions[ticker, quantity, average_price]` |
| 配置 | `default_config.py`、`dataflows/config.py` | 动态 schema、来源和有效值；全部配置可从页面编辑 |
| 模型 | `llm_clients/factory.py`、`model_catalog.py`、`capabilities.py` | provider、quick/deep 两层、自定义 model ID、模型能力条件表单 |
| 认证 | `api_key_env.py`、`chatgpt_auth.py` | 密钥与订阅登录独立；不能强制所有 provider 填 API Key |
| 报告 | `reporting.py`、`report_html.py` | Markdown、完整 HTML、分章节报告和运行 JSON |
| 回测 | `backtest.py`、`cli/main.py::backtest` | ticker × 日期网格，继续 run_id，命中率、mean alpha 等原有统计 |
| 断点 | `graph/checkpointer.py`、graph checkpoint scope | 原始配置和持仓相容时恢复；完整运行后按现有机制清理 |
| 记忆／结算 | `memory/log.py`、`settlement.py`、`reflection.py` | 历史建议、pending／resolved、收益、alpha、复盘文本 |
| 运行统计 | `cli/stats_handler.py`、`cli/display.py` | 耗时、LLM／工具调用数、可获得的 token 数；不虚构费用 |
| 最近偏好 | `cli/prefs.py` | 页面记住上次选择；不在浏览器保存密钥 |
| 更新提示 | `cli/updates.py` | 设置里保留禁用检查；关于页显示版本及允许获取的更新消息 |

### 2.1 必须保留的业务语义

1. 这是研究建议系统，不是券商订单系统；“开始分析”不能写成“买入／卖出执行”。
2. 最终评级为 `Buy / Overweight / Hold / Underweight / Sell`；`REVIEW` 表示无法取得有效评级，不能渲染成 Hold。
3. Trader 的 Buy/Hold/Sell 和 Portfolio Manager 最终评级可能不同，页面分别标明，不能相互覆盖。
4. 没有提供持仓、提供空持仓、提供非空持仓是三种状态。默认不能把“未知”变成“空仓”。
5. `average_price` 是当前平均成本，不是新增买入成交价；负 quantity 表示空头，不能取绝对值。
6. 多市场及币种不能直接求和；现金币种只是标签，当前引擎没有组合外汇折算服务。
7. 历史分析沿用点时数据约束，不把当前 PE 或新闻填进过去。数据被 withheld 应直观显示。
8. SEC 当前提供部分 XBRL 数值，不等于阅读全文；其 24 小时缓存不支持“发布即发现”。
9. `holding_period_days` 是复盘／回测计分窗口，不是定投频率，也不等于 AI 提出的 `time_horizon`。
10. 同 ticker、同日期的记忆记录当前去重；Web 可保留多次运行，但不能假设每次都增加一条记忆，不能悄悄重写此规则。

## 3. 视觉方向：深色玻璃研究工作台

### 3.1 设计主张

以“深夜金融研究桌”为出发点：深石墨底色、冷青色的细微环境光、半透明磨砂导航和工具栏、稳定清晰的正文阅读面。流动感来自页面层级和状态转场，而不是整屏不断移动的光效。

这是高质量的研究工具，不是营销 landing page。没有大幅 hero、无意义行情跑马灯、虚构收益卡片或一排夸张渐变 KPI。首页即进入分析工作台，明确当前任务和一个主操作。

三个具有辨识度的视觉母题：

- **悬浮导航轨道**：窄而完整的磨砂侧栏，选中项为柔和内发光，不使用大面积霓虹色块。
- **连续研究轨迹**：分析过程显示为细线连接的阶段轨道，活跃节点有轻微呼吸感；并行分析师并列展开。
- **安静的报告画布**：正文区域接近不透明，细边线和充足留白，像阅读研究备忘录；评级和证据比装饰更突出。

### 3.2 初始设计 token

以下为实施起点；效果图定稿后统一微调，不能各页面自行配色。

| Token | 初始值／规范 |
|---|---|
| 页面背景 | `#080D13` |
| 主阅读面 | `#101821`，必要时接近不透明 |
| 磨砂面 | `rgba(22, 34, 46, 0.72)`，blur 16–24px |
| 抬升面 | `#182532` |
| 细边框 | `rgba(210, 230, 245, 0.10)` |
| 主文字／次文字 | `#EAF0F6` / `#A7B5C6` |
| 主强调色 | 冰青 `#7DDDD3`，用于主操作、focus、选中 |
| 次强调色 | 雾蓝 `#91ACDF`，少量用于图表与结构 |
| 正向／负向／警告 | `#70D6A6` / `#F18B96` / `#E8BD75`；必须同时带文字／图标 |
| 圆角 | 输入 10px，面板 16px，抽屉 20px；避免所有元素胶囊化 |
| 间距 | 4、8、12、16、24、32、48px；主要页面外边距 32px |
| 字体 | Inter 或系统 sans；中文 PingFang SC / Microsoft YaHei / system fallback；数值 tabular-nums |
| 字号 | 页面标题 28–32；段落 15–16；控件 14；辅助说明 12–13px |
| 正文行高 | 中文／报告 1.7–1.8，表格 1.4 |
| 动效 | hover 120–160ms；抽屉／页签 180–240ms；状态转换不闪烁 |

正文必须达到可读对比度；玻璃只用于导航、工具栏和少量浮层。表格、输入区和长报告不叠多层透明背景。背景环境光只占边缘，不能从文字后面高亮穿过。

禁用大面积昂贵滤镜和持续飘动粒子。遵从 `prefers-reduced-motion`，低性能／无 backdrop-filter 时用不透明降级。不要用图片作为可交互界面。

### 3.3 布局与交互

- 桌面参考 1440×900；同时检查 1280×800、1920×1080、768px 和 390px 宽度。
- 侧栏约 216px，可折叠；顶栏约 64px，主内容自适应，不把长报告限制成狭窄卡片。
- 分析页桌面左侧参数区约 320px，右侧运行与报告；报告专注模式可收起参数区。
- 运行详情桌面右侧可打开诊断抽屉；手机改为全屏抽屉，不压缩正文为三列。
- 表格横向滚动仅发生在表格容器，首列／表头按需要固定；页面本身不水平溢出。
- 键盘可操作，清晰 focus ring，控件有 label；抽屉支持 Esc 和焦点回归。
- 加载／空／错误／部分成功／完成各自设计，不用同一个 spinner 代替全部状态。
- 新日志默认跟随底部；用户向上阅读后停止自动滚动，显示“有新消息”。
- UI 默认简体中文；报告语言独立设置。机器枚举不翻译后回传，例如显示“减仓 · Underweight”。

## 4. 信息架构与页面规格

主导航：**分析工作台 / 运行历史 / 持仓 / 回测 / 决策复盘**；底部：**设置**。版本、连接状态放侧栏底部或设置页，不占据首页主视觉。

### 4.1 分析工作台 `/analysis`

输入区：

- 股票代码，支持交易所后缀；附真实格式示例 AAPL、0700.HK、600519.SS、BTC-USD，不假设只支持美股。
- 资产类型检测和确认。crypto 根据现有逻辑隐藏／禁用不适用分析师，解释原因。
- 分析日期；今天／历史日期切换，使用后端现有日期校验与规范化，不仅依赖浏览器。
- 分析师多选：技术、情绪、新闻、基本面；明确哪些未选。
- 研究深度：轻量 1／标准 3／深入 5 轮，另有高级分别编辑研究／风险讨论轮数；预设不覆盖用户手动高级值。
- 报告语言；显示当前 quick/deep provider 和 model，可进入本次覆盖设置。
- 持仓上下文：不提供／明确空仓／选取已保存快照。展示现金、目标股票数量、成本和快照时间。
- 历史分析如果使用今天的持仓，显著提示“此快照未必代表分析日期的持仓”，让用户选择适当快照；不自动编造历史仓位。
- 断点恢复开关和匹配状态；保存报告、生成 HTML 设置；Web 运行元数据和事件始终保留，报告导出选项与之分开。

启动前展示精简的有效配置摘要和校验错误；缺少必需凭证时提供“前往设置”，保留全部表单内容。FRED 等可选数据源缺失只提示，不一律阻断。

点击“开始分析”创建任务并进入 `/runs/:id`。重复点击不创建两次任务。导航或刷新不停止后台任务。

### 4.2 运行详情 `/runs/:id`

顶部显示 ticker／公司名（能解析时）、分析日期、资产类型、运行状态、耗时。区分“分析日期”和“实际运行时间”。

研究轨道：分析师 → 多空研究 → 交易方案 → 风险讨论 → 最终决策；并行分析师单独状态。当前阶段的耗时和轮次可展示，但无可靠总量时不用虚构百分比或预计完成时间。

默认页签：

1. **结论**：最终评级、摘要、投资论点、目标价、时间范围；Trader 入场／止损／仓位建议放独立区块，标明来自交易员。
2. **分析报告**：四类分析师报告；未选／尚未生成／失败／无数据分别表达。
3. **研究与风控**：多空论证、研究经理方案、风险辩论及最终决策，按角色／轮次展开。
4. **运行记录**：工具名称、脱敏参数、开始／完成／失败、来源、耗时；可过滤 severity、agent、tool。
5. **本次输入**：配置快照、模型分层、持仓快照、数据源和版本。明确参数在启动时固定。

运行中已经完成的报告可读；失败后保留部分报告。无目标价／止损／时间范围时写“本次未提供”，绝不显示 0。缺少结构化字段时显示原始 Markdown，不通过宽松正则制造数值。

提供复制结论、下载 Markdown／HTML／JSON／全部报告 ZIP、重新运行同样输入、返回编辑参数。重新运行创建新 run，不覆盖原记录。历史 HTML 若内嵌预览使用隔离 iframe；Markdown 必须清洗潜在脚本和危险链接。

可展示的“过程”仅来自现有代理消息、工具事件和报告，不声称展示模型内部隐藏推理。

连接中断显示“与服务连接断开，后台状态待确认”，恢复后补齐事件；不能把网络断开直接当作分析失败。

### 4.3 运行历史 `/runs`

真实列表列：ticker、分析日期、开始时间、状态、最终评级、模型、持仓快照版本。支持按 ticker／状态／日期筛选、分页和进入详情。初始空状态提示开始第一次分析，不显示样例收益。

首次启动提供导入／索引已有结果目录的入口，读取现有 JSON 状态日志、报告目录；不修改旧文件。旧记录缺少 run ID 或持仓输入时标为“旧版记录／未记录”，不可假称可以精确重跑。

同日同 ticker 的 Web 多次运行必须独立存储。现有部分日志路径按 ticker/date 命名，会被重跑覆盖；适配层必须解决，详见第 6 节。

### 4.4 持仓 `/portfolio`

页面标题“持仓”，副标题清楚注明“当前为手动持仓快照”。独立表格列：ticker、数量、平均每单位成本、币种说明、更新时间、操作。现金单独编辑。

支持新增／修改／删除行、保存快照、导入现有 portfolio JSON、导出相同结构 JSON。输入缺少平均成本保持 null。所有数值拒绝 NaN／Infinity，数量支持负值。不要仅凭 quantity=0 推断现金为 0。

快照元数据可新增 `id/version/name/as_of/created_at`，传入引擎时只投影为 `PortfolioContext`。保存新版本不更改历史 run 关联的版本。

重复／别名归一后的 ticker 给出清晰提示，不擅自合并成本；现有模型允许多行，导入不能静默丢失。编辑器可引导用户确认修正。

每行“分析这只股票”带入 ticker 和选中快照；不会自动分析整个组合。页面不显示缺乏数据支撑的市值、实时 P&L、收益曲线或行业敞口。可显示数量和用户提供成本；不同币种不合并计算。

第一阶段的按钮必须叫“编辑持仓”，不能叫“记录买入”并暗示已实现交易账本。

### 4.5 回测 `/backtests`、`/backtests/:id`

表单包含 ticker 列表、起止日期、日期间隔 `every`、资产类型、分析师、模型／分析配置、可选持仓快照、已有 run_id。先按当前 `iter_grid` 规则预览实际日期和任务数；间隔是日历日，不是交易日。未来日期按现有规则裁到今天并显示实际范围。

页面明确：持仓在网格内固定，回测不是成交模拟，建议不会自动改变现金和持仓；不提供虚构净值、最大回撤或 Sharpe。

显示每个 ticker/date 单元的 pending/running/completed/failed/skipped 状态，独立列出 settlement failures。接入事件时不要把现有“单元开始前的 progress 回调”误当成完成。

结果保留现有指标：resolved、pending、unscored、按评级的 count、hit_rate、mean_alpha、实际持有窗口和 benchmark。Hold 没有方向命中率，展示“不适用”。mean alpha 是原有相对基准指标，不能标为实际账户收益；Sell 的 alpha 符号也不能自行翻转成组合 P&L。

支持继续已有回测，跳过已有单元并结算到期项。保存初始网格与配置；不相容的修改引导创建新回测，避免在同 run_id 内混合不同实验。提供原始日志和统计 JSON 下载。

### 4.6 决策复盘 `/memory`

浏览当前决策日志：ticker、日期、原始评级、待结算／已结算、原始收益、alpha、holding、resolved 日期和反思文本。可以过滤、打开原始决策并下载日志。

提供“更新已到期结果”，调用已有 `settle_all_pending`／`settle_pending`，作为可见后台任务执行。明确此操作可能调用行情和模型；尚未满足持有窗口的条目仍显示待结算，不人为补零。

回测日志和日常分析日志分开；不能把回测结果写入日常记忆。最新分析过程中自动结算产生的 `memory_note` 必须显示。

### 4.7 设置 `/settings`

分组：模型与认证、数据来源、研究参数、输出与存储、网络与高级、关于。保留统一布局，不使用一个巨大原始 JSON textarea 作为唯一设置入口。

每项显示中文说明、机器 key、默认值／继承值／实际生效值、来源、是否敏感、是否立即用于新任务。保存成功要有持久化反馈，重新加载后值一致。

## 5. 配置与环境变量完整规范

### 5.1 Schema 驱动

后端提供配置 schema 和 effective configuration。前端不能复制一份固定 provider／模型／工具列表后永远不更新。schema 包含 `key/type/default/nullable/group/description/enum/secret/source/restart_required`，并可提供适用 provider／model 条件。

覆盖检查以 `build_default_config()` 所有 key、`_ENV_OVERRIDES`、`PROVIDER_API_KEY_ENV`、vendor 配置及 `.env.example/.env.enterprise.example` 为基准。新增未知的应用配置应进入高级字段组，不能无声遗漏。不要把任意进程环境变量全部暴露给浏览器。

### 5.2 全部当前 config 字段

| 组 | 必须支持的 key |
|---|---|
| 主模型 | `llm_provider`, `backend_url`, `quick_think_llm`, `deep_think_llm` |
| 分层 provider | `quick_think_provider`, `deep_think_provider`, `quick_think_backend_url`, `deep_think_backend_url` |
| 推理／生成 | `google_thinking_level`, `openai_reasoning_effort`, `anthropic_effort`, `temperature`, `llm_max_retries`, `max_tokens` |
| 分析流程 | `output_language`, `max_debate_rounds`, `max_risk_discuss_rounds`, `max_recur_limit`, `max_tool_rounds`, `checkpoint_enabled` |
| 新闻 | `news_article_limit`, `global_news_article_limit`, `global_news_lookback_days`, `global_news_queries` |
| 数据源 | `data_vendors`, `tool_vendors` |
| 复盘／回测 | `holding_period_days`, `benchmark_ticker`, `benchmark_map`, `memory_log_max_entries` |
| 存储 | `results_dir`, `data_cache_dir`, `memory_log_path` |

nullable 字段支持“使用默认／继承”，不能把 null 自动变成 0 或空字符串。列表用增删行编辑器，map 用键值表格；高级 JSON 可作为辅助导入／导出和检查工具。日期、数值边界由服务端再次校验。

`tool_vendors` 优先于类别设置。UI 支持排序的 vendor chain，保存为现有逗号串，例如 `sec_edgar,yfinance`；只有用户选择的链会被尝试。可选项按 router 的具体 method 能力过滤：SEC 只提供三张报表；`get_insider_transactions` 当前属于 `news_data`，不是凭直觉放入 fundamental_data。

### 5.3 当前模型 API Key 字段

按 provider registry 动态生成，下列为本次审核到的完整集合：

```text
OPENAI_API_KEY                ANTHROPIC_API_KEY
GOOGLE_API_KEY                AZURE_OPENAI_API_KEY
XAI_API_KEY                   DEEPSEEK_API_KEY
DASHSCOPE_API_KEY             DASHSCOPE_CN_API_KEY
ZHIPU_API_KEY                 ZHIPU_CN_API_KEY
MINIMAX_API_KEY               MINIMAX_CN_API_KEY
OPENROUTER_API_KEY            MISTRAL_API_KEY
MOONSHOT_API_KEY              GROQ_API_KEY
NVIDIA_API_KEY                OPENAI_COMPATIBLE_API_KEY
```

provider 集合还包含 `chatgpt/ollama/bedrock`。中国区／国际区不能共用错误的 key 或端点。支持 catalog 之外的自定义 model ID，使用当前后端验证逻辑，不要求前端硬编码模型白名单。

### 5.4 其他环境变量

| 用途 | 字段和行为 |
|---|---|
| 数据源 | `ALPHA_VANTAGE_API_KEY`, `FRED_API_KEY`, `SEC_EDGAR_USER_AGENT` |
| 社交筛选 | `TYPESAFE_API_KEY`, `TYPESAFE_DEFAULT_MODEL`, `TYPESAFE_BASE_URL` |
| 本地模型 | `OLLAMA_BASE_URL`；自定义 OpenAI-compatible 地址通过 backend_url，key 可选 |
| Azure | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT_NAME`, `OPENAI_API_VERSION` |
| AWS | `AWS_REGION`, `AWS_DEFAULT_REGION`, `AWS_PROFILE`, `AWS_BEARER_TOKEN_BEDROCK`；同时提供 SDK 标准 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` 输入，并保留已有 credential chain |
| 应用覆盖 | 所有 `_ENV_OVERRIDES` 中的 `TRADINGAGENTS_*`，与 5.2 共用一套值，不能成为两份冲突配置 |
| 路径 | `TRADINGAGENTS_RESULTS_DIR`, `TRADINGAGENTS_CACHE_DIR`, `TRADINGAGENTS_MEMORY_LOG_PATH`，与对应 config 共用 |
| 更新 | `TRADINGAGENTS_NO_UPDATE_CHECK` |
| 代理 | `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` 及已有小写形式的来源诊断；属于客户端／SDK 环境能力，连接测试必须报告实际支持情况，不保证所有 provider 一致 |
| Docker | `TRADINGAGENTS_DATA_DIR` 是 compose 的宿主机挂载配置；可在部署设置编辑并生成应用配置，但改变现有挂载需重建容器，不能声称保存后立即生效 |

`TRADINGAGENTS_IN_DOCKER`、`CI`、SSH 等运行环境事实仅作为诊断，不当作用户业务设置。不得提供可任意修改 PATH、HOME、执行 shell 或任意环境变量的通用入口。

### 5.5 配置优先级与生效

Web 明确定义：**本次显式覆盖 > Web 已保存设置 > 启动时导入的已有 env/.env > 内置默认值**。CLI 保持原行为。若 env 与 UI 保存值不同，页面显示来源和覆盖结果，不能保存成功后仍悄悄使用旧值。

- 未编辑字段保留继承语义；“恢复默认”与“清空密钥”是不同操作。
- 保存设置生成 revision，下一次任务使用该 revision 的不可变快照。
- 正在运行的任务不受中途修改影响；提示“已保存，用于新任务”。
- 凭证更新不可改变正在运行进程的 key；需在任务启动时解析并隔离环境。
- `DEFAULT_CONFIG` 在导入时读取环境，不能仅在 API 进程修改 `os.environ` 后假设全系统已更新。
- 改路径只改变新运行目的地，不自动搬移／删除旧文件；历史索引保留旧 artifact 引用。
- URL 可能包含凭证，日志、快照及导出都需脱敏。

### 5.6 凭证与登录体验

密钥设置默认仅返回“已配置／未配置＋来源”，不能由 GET API 回传完整 key。输入留空表示不修改，清除需要显式动作。不得写入 frontend `.env`、`VITE_*`、localStorage、前端 bundle 或报告。

服务端使用 OS keychain 或权限 0600 的本地独立凭证文件，排除 Git；原子保存。配置导出默认不含密钥，导入时不执行任何内容。表单提交后清理内存里的明文值。

ChatGPT 页包含当前账号、登录、取消登录、退出。将现有 `sign_in(say, read_line, ...)` 封装为后台登录会话：展示合法授权 URL、打开外部浏览器、等待回调、手动粘贴回调地址的备用输入、超时／取消／失败说明。不得让 Web worker 等待 terminal `input()`；可注入队列式 read_line 或抽取可复用 OAuth 服务。保留 state／nonce／PKCE 校验，不记录回调 code、token。

OpenAI／其他 key 在用户选择的 provider 设置中填写。quick/deep 使用不同 provider 时各自检查；无 key 的本地 provider 不强制认证。根据能力禁用不支持参数，例如现有 ChatGPT 路径不接受 temperature/max_tokens；显示原因而不是提交后才静默丢弃。

“测试连接”分别测试配置完整性、认证、端点、必要的数据访问；明确测试是否调用模型及可能消耗 token。没有实际测试只能显示“已配置”，不能显示“已连接”。缺少 Bedrock 可选依赖要在页面说明并提供明确安装步骤，交付的标准安装方案应包含用户所需 extra。

## 6. 技术架构与数据生命周期

### 6.1 建议实现

- 前端：React + TypeScript + Vite，路由、查询缓存、schema 表单、共享设计 token；组件按 feature 拆分。
- 后端：新增 Python HTTP API（建议 FastAPI），调用现有 TradingAgents 引擎。技术栈是实施建议，不要求升级现有 LLM 依赖。
- 流式通信：SSE＋普通 REST；SSE 用于进度和报告事件，提交／设置走 REST。
- 本地数据库：SQLite 存 Web 配置 revision、快照版本、任务、事件及 artifact 索引；不以它替换现有 checkpoint SQLite 和 Markdown 决策日志。
- 本地开发 Vite 代理 `/api` 到 Python；生产构建由本地服务托管前端，日常启动一条命令。
- 默认只绑定 loopback。页面本地运行不代表数据和模型都离线；设置页清楚区分外部 provider 与本地模型。

建议结构：

```text
web/                         # 前端
  src/app/                   # shell、routes、providers
  src/features/              # analysis/runs/portfolio/backtests/memory/settings
  src/components/            # 共享控件、报告、诊断、状态组件
  src/lib/api/               # 生成／共享接口类型、REST、SSE
  src/styles/                # tokens、基础样式、motion
tradingagents/web/           # Python API、schema、服务、worker、存储
tests/web/                   # Python API 和任务行为测试
web/tests/                   # 组件／浏览器关键路径测试
```

包目录、脚本入口和 extras 最终随仓库实际惯例确定。不要使用云端数据库／登录服务作为本地工作台的前置依赖。

### 6.2 任务隔离

API 请求不直接运行长时间图分析。主服务持久化任务后返回 202，worker 执行。第一阶段顶层分析、回测和手动结算采用有界串行队列即可，图内部分析师并行保持不变；用户能看到排队状态。

推荐每任务独立 Python 子进程，启动前注入固定 config 和凭证环境，避免并发修改全局 env、CLI `message_buffer`、统计回调或配置上下文。必须使用 Python API／内部 worker 协议，不能拼 shell 命令抓终端文本。

Web 适配层要覆盖初始化、流式迭代、最终记录、报告保存、断点清理与资源关闭。单独调用 `stream_run()` 并不等于完成 CLI／`propagate()` 的全部收尾语义；抽出公共运行服务或完整镜像其生命周期，并测试记录没有遗漏或重复。

所有外部调用、自动结算、最终报告写盘都在任务状态中可见。不要显示“完成”后仍在后台等待不可见的 LLM 复盘。

### 6.3 Run 与结果存储

每个 Web run 使用独立 ID 和目录（例如 results_dir/web_runs/{run_id}），保存 request、脱敏 effective_config、版本、portfolio snapshot、事件、final_state 和 artifact manifest。这解决现有按 ticker/date 命名日志在重跑时覆盖的问题。

日常 memory_log_path 保持共享，data_cache_dir 按配置复用；回测保持其独立记忆路径。以 Web 索引关联旧报告，不全量迁移或覆盖旧文件。

配置快照不包含密钥；worker 所需秘密单独读取、仅留运行内存，不在命令行参数暴露。精确重跑指业务输入相同，不保证外部数据／LLM 输出完全可复现。

应用重启后，先检查 worker 是否仍受管理且存活，再协调状态；无法确定的 running 标为 interrupted，不能永久转圈或谎称完成。浏览器重连仅恢复订阅，不能新建任务。

### 6.4 恢复与取消

任务状态：`queued / running / cancelling / cancelled / completed / completed_with_warnings / failed / interrupted`。HTTP 连接状态独立于任务状态。

已有 checkpoint 按 ticker/date、分析师、配置和持仓 fingerprint 等匹配。Web “继续”必须保留业务参数；不匹配显示差异，提供“以新输入重新运行”，不能错误恢复。实现检查复用原有 signature 逻辑，不前端自行计算。

队列任务可取消；正在执行任务提供“请求停止”，停止调度后续步骤，在安全边界释放资源。不可中断的 SDK 调用期间保持 cancelling，直到退出确认为止；不能提前声称停止计费。子进程强制终止是明确操作，保留已有部分结果与可用 checkpoint。

清理断点只作用于目标记录或现有全量清理能力；展示范围与数量，运行中相关 checkpoint 禁止清理。清理 checkpoint 不删除报告或持仓。

## 7. 新增 API 契约

所有路径以 `/api/v1` 为前缀；下表是必须落地的能力合同，具体路由可合理微调但需同步前端类型和 OpenAPI。

| 方法／路径 | 功能 |
|---|---|
| GET `/health` | 服务版本、worker 状态、存储可用性；无 secrets |
| GET `/capabilities` | providers、models、分析师、资产约束、vendor-method 映射、可用依赖 |
| GET `/settings/schema`、GET `/settings` | 字段 schema、脱敏有效配置和来源 |
| PATCH `/settings` | 校验并保存 revision；支持并发版本检查 |
| POST `/settings/test` | 测试明确指定的 provider／数据源；结构化结果 |
| GET `/auth/chatgpt` | 登录状态 |
| POST `/auth/chatgpt/sessions` | 创建登录会话和授权 URL |
| GET／DELETE `/auth/chatgpt/sessions/{id}` | 查询／取消登录 |
| POST `/auth/chatgpt/sessions/{id}/callback` | 备用回调地址输入 |
| POST `/auth/chatgpt/logout` | 退出，区分远端撤销成功与仅本地移除 |
| GET／POST `/portfolios` | 列出／创建快照 |
| GET／PUT `/portfolios/{id}` | 读取／保存新版本 |
| POST `/portfolios/import`、GET `/portfolios/{id}/export` | 兼容原 portfolio JSON |
| POST `/runs`、GET `/runs` | 新建分析／历史分页 |
| GET `/runs/{id}` | 状态、输入、可用报告、警告和统计 |
| GET `/runs/{id}/events` | 可断线续传 SSE |
| POST `/runs/{id}/cancel`、POST `/runs/{id}/resume` | 停止／检查相容后继续 |
| GET `/runs/{id}/artifacts/{artifact_id}` | 下载或读取注册的产物；不接受任意路径 |
| GET `/checkpoints`、DELETE `/checkpoints/{id}` | 可恢复记录及清理；另设明确全量操作 |
| POST `/backtests/preview`、POST `/backtests` | 预览网格／启动回测 |
| GET `/backtests`、GET `/backtests/{id}` | 历史及结果 |
| POST `/backtests/{id}/resume` | 继续并结算；长任务使用相同事件与状态协议 |
| GET `/memory`、POST `/memory/settle` | 日常决策日志／创建结算任务 |
| POST `/history/import` | 索引设置中的已有结果目录，返回成功／失败文件清单 |

单次分析请求示例（本阶段新增 Web DTO）：

```json
{
  "ticker": "AAPL",
  "analysis_date": "2026-11-08",
  "asset_type": "stock",
  "analysts": ["market", "social", "news", "fundamentals"],
  "settings_revision": 3,
  "overrides": {"max_debate_rounds": 1, "output_language": "简体中文"},
  "portfolio": {"mode": "snapshot", "id": "pf_123", "version": 2},
  "checkpoint_enabled": true,
  "report_options": {"save": true, "html": true}
}
```

portfolio mode 支持 `none / flat / snapshot`；flat 需明确投影为空 positions，cash 未知仍为 null。`settings_revision` 失效时返回明确冲突，不用新设置悄悄执行旧请求。请求带幂等键，防止 double-click／重试重复创建。

### 7.1 事件协议

```json
{
  "schema_version": 1,
  "event_id": "run_123:42",
  "run_id": "run_123",
  "sequence": 42,
  "timestamp": "2026-11-08T18:20:00Z",
  "type": "tool.failed",
  "stage": "analysts",
  "agent": "fundamentals",
  "severity": "warning",
  "payload": {
    "tool": "get_balance_sheet",
    "vendor": "sec_edgar",
    "code": "VENDOR_UNAVAILABLE",
    "message": "SEC EDGAR 暂时不可用，正在尝试已配置的 Yahoo 来源。",
    "retryable": true
  }
}
```

类型至少包含 queued、run.started、stage.started/completed、agent.started/completed、message、tool.started/completed/failed、report.updated、stats.updated、warning、run.completed/failed/interrupted/cancelled、artifact.failed。

事件先持久化再发送，按 sequence 去重；SSE 支持 Last-Event-ID／cursor、心跳和重连补发。事件缺口或过期返回重新同步指令，前端拉取 `/runs/{id}`。服务重启不能让前端以为每个旧 event 都是新内容。日志很大时分页／虚拟列表；重连不会重新运行工具。

### 7.2 统一错误

```json
{
  "error": {
    "code": "PROVIDER_AUTH_FAILED",
    "message": "当前模型凭证未通过验证。",
    "details": "上游返回 401；请检查所选 provider 对应的 API Key。",
    "field_errors": [],
    "request_id": "req_123",
    "run_id": "run_123",
    "stage": "analysts",
    "provider": "openai",
    "retryable": false
  }
}
```

JSON 字段不是要求每种错误都填满；未知值允许 null。同步校验用合适 4xx，意外故障用 5xx；任务运行期间通过事件和 run 状态报告，不能返回 HTTP 200 的假成功对象。

## 8. 错误透明性与数据质量

用户需要在前端直接调试后端。**任何失败都不能只存在于 Python console。** 同时不能将未经脱敏的异常、API Key、OAuth code、Authorization header 或含密码的 URL 暴露到页面。

展示三层：就地错误（字段／报告）、持续可见状态横幅、可展开诊断抽屉。toast 只能辅助，不能作为唯一记录。诊断包含发生时间、阶段、工具／provider、代码、脱敏原因、是否可重试、request/run ID，并能复制脱敏详情。

| 情况 | 前端处理 |
|---|---|
| 错误 ticker／未来日期／坏 JSON | 对应字段标错，保留输入，不创建昂贵任务 |
| 缺少必需 key／401／403 | 明确 provider，链接设置；不展示 key |
| 429／超时／网络错误 | 显示重试和等待状态；失败后保留已完成报告 |
| 数据链 fallback | 显示原来源失败及实际接替来源，不把 fallback 隐藏 |
| FRED 无 key 等可选失败 | 标为缺少数据的部分完成，允许核心分析继续 |
| NO_DATA_AVAILABLE | 无可用市场数据，不推断为利空／股价 0 |
| DATA_UNAVAILABLE／withheld／coverage gap | 区分服务不可用、历史限制和覆盖不足 |
| 模型空输出／拒绝／结构化输出回退 | 展示具体情况及已有文本；不生成假字段 |
| REVIEW | 明确“需复核”，不转成 Hold 或可交易建议 |
| checkpoint 不相容 | 展示原因，保留旧结果，允许新运行 |
| 写盘／导出失败 | 分析结果与 artifact 状态独立；结果仍可读，可重试保存 |
| 全部回测单元失败 | 真实失败状态和原因，不显示空表为成功 |
| 浏览器断线／API 不可用 | 服务连接横幅与重试，不清空任务或配置表单 |

部分 vendor 当前返回字符串 sentinel 而非异常。适配层需要从工具结果识别这些已定义 sentinel，或新增不改变既有输出的诊断元数据；仅监听 `on_tool_error` 不够。来源／发布时间／缓存时间仅在真实可获得时显示，否则“未提供”；不要制造逐句引用。

## 9. 本地服务与内容安全的实现要求

这是处理 API Key 和持仓的本地应用，以下要求属于正常实现的一部分：

- loopback 绑定，校验 Host／Origin，CORS 限定开发来源；有副作用接口不能接受任意网页跨域调用。
- 提供同源会话／CSRF 防护；前端不能因为“localhost”就暴露任意无保护写操作。
- 密钥、OAuth 回调和原始私密请求不进入 SSE、浏览器 console、报告或错误下载。
- Markdown 清洗；报告 HTML 隔离展示；不执行新闻／社交帖子中的 HTML 或指令。
- artifact 通过 ID 映射到受控目录，防止 ticker/run_id/import filename 路径穿越；不提供任意本地文件读取 API。
- 文件上传有大小限制和 schema 校验；存储使用原子写；配置版本冲突可恢复，不静默覆盖另一标签页的修改。
- 保存设置不能启动任意 shell。自定义 provider endpoint 保留用户所需能力，但显示目的地址，credentials 不发送给无关服务。

## 10. 实施顺序与阶段产物

### A. 现有功能核对与视觉定稿

产物：功能映射清单、路由图、设计 token、至少分析页（空／运行／完成）、报告阅读、持仓、回测、设置、错误抽屉的协调视觉方案。可以用效果图或可运行视觉原型审阅，但所有示例必须标注演示数据，不得留下假业务能力。

先解决用户最关心的美感：深色、磨砂、流动感、清晰阅读和操作层次。不要先堆满功能后才统一样式，也不要把设计审阅当作不接后端的最终交付。

### B. 第一条真实纵向链路

实现配置持久化 → 凭证设置 → 输入 ticker → 创建任务 → 真实 Python 图运行 → SSE 进度 → 最终报告 → HTML/Markdown 下载。完成这条链路后继续全功能覆盖，不停在 mock 演示。

### C. 现有功能覆盖

实现持仓快照、完整模型分层／数据源／高级设置、历史和旧结果索引、断点、登录、回测、决策复盘、运行统计。前端每个按钮都绑定真实行为或明确不适用原因。

### D. 失败路径和生命周期

验证鉴权失败、429、源不可用、历史 withheld、报告写盘失败、断线重连、重启中断、恢复、取消和配置隔离。完成错误诊断，不让用户回终端找 traceback。

### E. 浏览器验收和交付

真实浏览器检查全部关键路径、桌面与窄屏、键盘、长报告、无数据状态。对照定稿视觉截图修复布局／字体／透明度偏差。交付单一启动入口、README、配置存放说明、联调记录、测试结果和确实存在的限制。

## 11. 验收标准

### 11.1 功能验收

- [ ] 页面可配置当前所有 provider 和两层模型；支持不同 provider、地区和自定义 model ID。
- [ ] 第 5 节配置／环境字段有可用 UI；配置保存后刷新／重启仍有效。
- [ ] 缺少 key 时能在页面补充；无 key provider 不被错误阻断。
- [ ] ChatGPT 登录、回调失败、超时和退出状态均在页面完成，不依赖 stdin。
- [ ] 一只股票使用选定分析师真实运行，进度、报告、评级和设置快照正确。
- [ ] crypto 和非美股 ticker 沿用原规范，不能错误替换公司或分析模式。
- [ ] 持仓三种状态正确；历史快照不会被后续编辑改变；不会暗中累加交易或计算新成本。
- [ ] 五档最终评级、Trader 动作、REVIEW、可选空字段正确区分。
- [ ] Markdown／HTML／JSON／分章节导出可打开，与页面同一次运行一致。
- [ ] 相同 ticker/date 多次运行都能找到，各次报告不覆盖；记忆去重仍按原逻辑。
- [ ] 旧结果可索引；缺失信息明确标注。
- [ ] 回测支持日期网格预览、进度、失败单元、继续、pending／unscored 和原有统计。
- [ ] 回测不污染日常记忆；Hold 不显示虚构命中率。
- [ ] 断点相容性检查真实，恢复不重复已完成步骤，完成后清理符合原逻辑。
- [ ] 复盘结算通过后台任务展示，未到期项不错误计分。
- [ ] 关键错误、降级、withheld 和 artifact 保存失败可在前端查看和复制诊断。
- [ ] 浏览器刷新、切页、SSE 断线不会重复启动任务或丢失已有报告。
- [ ] 修改配置不影响正在运行任务，下一任务确实采用新值。
- [ ] 保留 CLI 行为和已有数据格式兼容性。

### 11.2 视觉与体验验收

- [ ] 页面统一使用第 3 节设计系统，无未经设计的原生表单和样式漂移。
- [ ] 玻璃效果没有降低表格／报告可读性，无整页过亮渐变和持续高负载动画。
- [ ] 主要动作明确，日常流程不要求用户输入文件路径或切回终端。
- [ ] 运行／报告／设置／持仓／回测及各自空、错、加载状态均完成。
- [ ] 390px 窄屏可操作，1440×900 首屏清晰，长内容不裁切。
- [ ] 键盘、focus、减少动态效果可用；评级不只依赖红绿区分。
- [ ] 无 mock 冒充真实结果、假连接状态、假进度百分比或假收益。

### 11.3 测试与证据

使用隔离 fixture 验证故障路径，至少覆盖：API schema、配置优先级／隔离、秘密脱敏、持仓版本、任务幂等、SSE 重放、断点恢复、回测事件、报告保存失败、恶意路径和 Markdown。现有相关 Python 测试不得回归。

执行前端类型检查、build、关键浏览器流程测试。使用已配置的真实 provider 做一次最小分析及报告导出；凭证不可用时仍完成全部无凭证开发和 mock 协议测试，准确记录“实网未验证”，不能写成已联调通过。不要为证明 UI 可用而自动批量运行高成本回测。

交付记录说明：测试命令、结果、浏览器与视口、截图位置、实际验证的 provider 和数据源（不含密钥）、已知限制。测试和视觉复核各自提供证据，build 成功不等于前后端链路成功。

## 12. 给实施 agent 的最终约束

**请完成第一阶段完整闭环，不只交付设计稿或前端工程。** 先按本文件确定视觉系统，随后连接现有 Python 引擎，让所有当前功能在本地页面可操作、可观察、可验证。必要的 Web 适配后端属于本阶段工作。

不要提前实现行业 Top 20、交易成本账本、财报全文总结、定期买卖计划或其他策略扩展；不要为丰富视觉而杜撰账户数据、实时行情或性能指标。发现本文件与源码差异时记录差异、修正映射，保留既有业务语义，并把真实错误直接呈现在前端。
