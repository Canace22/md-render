---
name: md-render-tauri-migration
description: 在 md-render 把 Electron 能力分阶段迁到 Tauri 2、维护双壳、接 Rust command、处理 WebView 数据隔离或构建安装包时使用。触发场景包括“换成 Tauri”“迁移 Electron”“Tauri 数据没了”“接系统 WebView”“Tauri 打包”“迁移文件/数据库/更新器”。略主动。
---

# md-render Tauri 迁移

把 Tauri 当成新的系统壳，复用现有 Renderer，但逐项迁移系统能力。Tauri 已是正式发布壳；Electron 只保留一个稳定发布周期的手动回退链路，避免切换初期的数据、功能或发布回归。

## 为什么这样做

Tauri 不携带 Node 运行时，但现有文件、SQLite、Agent、MCP 和更新能力依赖 Electron 主进程。页面能在 WebView 打开，只能证明 UI 可加载，不能证明桌面能力已经迁移。

Tauri WebView 还有独立浏览器 profile。首次打开看不到 Electron 的 `localStorage` 或工作区，不代表原数据被删除；任何迁移都必须从副本和白名单开始，不能直接覆盖正式数据。

## 步骤

1. 定向搜索当前能力的完整调用链：React → store/service → `window.electronAPI` → preload → main service。
2. 先写清参数、返回值、错误语义和数据位置，再决定 Rust command、Tauri plugin 或自定义协议的落点。
3. 保持 `desktopBridge.js` 只做运行时识别和跨壳公共能力；不要伪造 `window.electronAPI`，也不要让未迁移能力误报可用。
4. 预览初期使用独立应用名、bundle identifier、开发端口和数据目录，并明确标注“隔离数据，非正式版”。一旦 identifier 已承载用户数据，正式切换时必须冻结；显示名称和可执行文件可以改，不能只因 identifier 含 `preview` 字样就改掉数据身份。
5. capability 从空权限开始，只增加当前功能必需项。页面仍有外部 CDN 时不要开放文件、进程或 shell 等高风险能力；先本地化资源并启用严格 CSP。
6. 应用版本从 `apps/editor/package.json` 读取；Rust 运行时通过 `AppHandle.package_info()` 返回版本，不再另写一份用户可见版本。
7. 一次只迁移一个能力。先在副本上验证读，再验证写、监听、取消和错误路径；通过后才替换对应 Electron 路径。
8. 每个独立功能验证通过后立即提交。正式 tag 只发布 Tauri；Electron 回退包保持可独立构建、可启动，但不挂到正式 Release，稳定一个发布周期后再决定是否删除。

### 本机 Agent 迁移

- 本机 Agent 是一组能力，不是一个下拉项：同时检查 `detect / models / run / cancel / event` 是否有 Tauri 通道。只改 `hasLocalAgentDetection` 会把不能运行的来源伪装成可用。
- Renderer 通过独立 service 在 Electron preload 和 Tauri command 之间选路；不伪造 `window.electronAPI`，不把 Rust 进程管理写进组件。
- Tauri 运行 Agent 时，前端只传当前窗口的 mount id，Rust 从 `LocalProjectRegistry` 解析真实目录；禁止因为 Agent 需要 cwd 就把绝对路径重新暴露给 Renderer。
- CLI 检测与运行都要合并 login shell 环境和常见安装目录；macOS 从 Finder 启动时不能依赖父进程 PATH。
- 不要默认 Tauri 已继承 Electron 的 MCP 注入。Electron 用自身 Node 运行 `mcp-bridge`；Tauri 没有 Node 时必须另行迁移，迁移前要在结果里明确说明降级，不能宣称 md-render 内部工具可用。

### 正式切换与发布门禁

- 正式 Release 只由 `v*` tag 触发；tag、根目录版本和 editor 版本必须一致，发布 commit 必须属于 `origin/main`。
- Apple Developer ID / 公证凭证和 Windows Authenticode 凭证齐全时执行正式签名校验；缺少凭证时仍可发布，但文件名保持简洁稳定，Release 固定说明 Gatekeeper / SmartScreen 风险，不把签名状态塞进文件名。
- Release 正文固定保留下载、macOS 安装、Windows 安装和网页版入口，版本差异只由 GitHub 自动追加到 `What's Changed`，不要每版重写整篇说明。
- Electron updater 不能跨壳完成首次升级。首次切换必须写清“手动安装 → 显式导入旧库 → 重新授权本地目录”，且源库保持不变。
- 自定义 Inno 包没有天然接入 Tauri updater。当发布仍允许无签名降级时，先实现可信的“新版本提示 + 跳转 Releases 手动安装”，不生成假的 updater 元数据，不把手动下载说成自动更新。
- Windows 有凭证时同时验证 app、installer、installed app 和 uninstaller 签名；有无凭证都要完成安装、启动、卸载冒烟检查。
- Electron 回退工作流只能手动触发、短期保存 artifact，不能混入 Tauri 正式 Release。

### Tauri 更新提示

- 沿用现有 Renderer 通知条，在独立 service 中选择 Electron preload 或 Tauri command；不伪造 `window.electronAPI`。
- Tauri 由 Rust 请求 GitHub `releases/latest`，只读取最新正式 Release，使用 semver 比较当前包版本，不做字符串大小比较。
- 只在生产包启用，启动后延迟检查，后台间隔要有上限；无更新和网络错误都保持界面安静。
- 发现新版本时显示精确版本号，并打开 API 返回的该版 Release 页；外链仍走现有 `http/https` 白名单校验。
- 要升级成真正的下载/安装，先单独设计 Tauri 更新签名密钥、可验证元数据和 Windows 安装器兼容方案；不要在提示功能里顺手塞一个不可验证的自动安装。

### 本地目录的授权与快照

- 部分能力要单独声明，例如 `canOpen / canRead / canWrite / canUseDefaultWorkspace`；不要因为 Tauri 能读目录，就让原来的“本地项目完整可用”判断返回 true。
- Electron 默认工作区导入后，磁盘节点可能带 `projectRootPath`，却没有 `localProjectRoot`。Tauri 加载持久化工作区时不能只保护显式挂载根；所有仍指向旧路径、又没有当前会话 mount token 的顶层磁盘节点都要先变成只读快照，并提供目录级重新授权入口。重新授权子目录时，匹配路径要先去掉旧的 `Projects/<目录>/` 前缀，再与所选目录内的相对路径比较；不同子目录还要使用不同的稳定 identity，不能共用旧默认工作区根路径。
- 保护目录要区分“Electron 配置/数据库”和“用户内容项目”：普通打开始终拒绝 `Documents/MdRender` 和 Electron user-data；旧快照重授权可让用户一次选择 `Documents/MdRender`，但 Rust 必须只把请求中的 `Projects/<具体项目>` 展开成相互独立的 mount，不能把根目录、数据库、Daily、配置等一并暴露。放行后的扫描、新建、保存、改名和删除必须共用同一边界，否则会出现“能授权但不能编辑”。
- 真实目录由 Rust registry 持有，Renderer 只拿绑定当前窗口的短期不透明 token；后续读取只传 token 与相对路径，不返回或接受任意绝对根路径。
- mount token 只属于当前会话，不得进 SQLite、BlockNote 内容、关系 ID 或封面地址。新挂载使用稳定的 opaque identity，持久化的是“最新内容 + 只读 + 待重授权”快照。
- 重启后保留快照与历史 ID，但不使用其中的旧路径或 token 读写。普通目录重授权只有在扫描完整且目录结构高置信匹配时才复用旧 identity；整库重授权已有受保护根目录和明确的 `Projects/<具体项目>` 映射时，以路径映射为准，不再用内容相似度误伤后来变更过的项目。
- 旧 Markdown 可能残留 Electron 时代的绝对 `local-media://` 引用。它不能阻断当前会话挂载；若因此无法生成可持久化的新快照，就保留授权前的安全快照并让磁盘项目继续可编辑，不能把快照失败升级成授权失败。
- 扫描结果必须单独返回 `complete/authoritative`，不能用 `skippedCount > 0` 代替。文件数/总体积/深度截断、I/O 或 UTF-8 读取失败时为不完整；隐藏、忽略和不支持类型只计跳过。不完整扫描禁止自动刷新、手动 `use-disk` 和重授权覆盖。
- 移除挂载时先排空正文、图片、metadata 和 Rust mutation，成功后才 revoke token 并删节点；任一保存失败都保留挂载。
- `readOnly` 从挂载根递归传给后代，并同时约束 UI、store action、AI/Agent 提案和元数据入口；不能只靠隐藏按钮。
- 读取前再次校验文件类型、相对路径、符号链接、规范化后的目录边界和体积上限。保持 capability 最小化，目录选择器可由 Rust 直接调用，不必给 Renderer 通用 `dialog/fs` 权限。

### SQLite 与旧数据导入

- Electron 和 Tauri 使用不同 app identifier 和数据库，禁止双壳共写一库。Tauri 只在用户明确选文件时导入；源库拒绝非空 WAL / journal 后用 immutable + read-only/query-only 打开，导入前后复核主文件未变化。
- Electron 运行时最新数据可能还在 WAL；必须先退出 Electron，不拿带非空边车日志的单独 `.db` 冒充完整备份。零字节 WAL 或孤立 SHM 可能来自正常退出，不要仅凭文件存在就误拒。
- Electron 导入是“备份当前 Tauri 库后整库替换”，不是合并。已有 Tauri 内容和 Electron 内容同时有价值时，先导出用户可读备份并明确提示；成功结果要展示 `knowledge.before-import.<timestamp>.db` 的实际文件名。
- 导入前先锁住交互、排空文件/图片/metadata/SQLite，再冻结新的 store 和 Rust 写入。关窗与导入互斥，导入成功后保持冻结直到 reload，失败才恢复。
- 旧 Electron `documents` 是工作区的派生索引，历史库可能残留孤儿行。源库只要求 workspace ID 全部能在 documents 找到；复制时按 workspace ID 过滤 documents、双端有效的 links 和对应 versions。candidate DB 仍要求 workspace JSON 与文档 ID 精确一致。
- SQLite 的列声明不是运行时强类型：Electron 把 JS `mtimeMs` 写进 `INTEGER` 列时，小数毫秒会实际存成 `REAL`。迁移前用 `typeof()` 检查真实存储类型；时间戳只兼容 `NULL`、`INTEGER` 和有限且范围合法的 `REAL`（截成整数毫秒），文本、二进制和越界值继续报错。`workspace_json` 中的 `createdAt` / `updatedAt` 使用同一规则，避免导入后再次保存时变成 `NULL`。
- 先建 candidate DB，校验 schema 白名单、`quick_check`、过滤后的记录数和 FTS，再备份当前 Tauri DB 并原子切换。切换前失败要清理 candidate 和未使用的 backup；切换失败优先保留可恢复备份。
- Tauri 自有 WAL 库缺少 `-wal/-shm` 时，纯 `READ_ONLY` 可能无法打开。自有库用 `READ_WRITE`（不带 `CREATE`）打开后立即设 `query_only=ON`；不要把这种放宽用于外部旧库。
- 迁移标记不能代替数据验证；启动时同时检查 marker、workspace 和 documents，异常库进只读恢复而不自动覆写。

### 关窗与单实例

- 单实例插件必须最先注册；第二实例只聚焦已有窗口，不能再打开一套 SQLite/挂载会话。
- Tauri `close-requested` 先 `preventDefault`。安全顺序是：界面 inert → 排空图片生命周期、Daily/画布 debounce、正文 timer/queue、metadata 和 Rust mutation → 冻结新的 store/Rust 写入 → 排空 SQLite → `destroy`。
- 任一写入失败必须 latch，后续同一对象保存成功才清除；否则关窗、移除项目、手动同步和导入都要取消。

## 关键约束与易踩坑

- 最终用户不需要 Node、pnpm 或 Rust；这些只属于开发和构建环境。
- macOS 使用 WKWebView，Windows 使用 WebView2；Linux WebKitGTK 不是本阶段发布承诺。
- Rust 多行 SQL 不要在相邻关键字之间用 `\` 续行；它会同时吃掉换行和下一行缩进，把 `versions` + `WHERE` 拼成 `versionsWHERE`。保留真实换行或显式空格，并在修复时扫描同文件的所有同类 SQL。
- 不把“窗口打开”“前端 build 通过”当成数据迁移成功；必须观察真实 command、真实文件副本或真实数据库结果。
- 不直接复制整个 WebView profile。只迁移明确列出的设置，并为每项提供默认值和失败回退。
- 不因 identifier 名字含 `preview` 就迁移、清理或重建已经在用的数据目录。是否正式由产品身份、签名和发布链路决定，不由 identifier 文案决定。
- Electron 与 Tauri 构建模式不能同时启用；专用端口必须避开现有服务占用。
- macOS 安装包要区分当前架构与 universal；对外发布前补齐 Developer ID 签名、显式提交 DMG 公证和 staple/validate。更新策略必须明确，未接 updater 时写明从 Releases 手动更新。CI 上传 `.app` 前用保留包结构的 zip，不直接上传 bundle 目录。
- Windows 安装位置、WebView2 策略、签名和 Inno Setup 要单独验收，不能从 macOS 结果外推。WebView2 bootstrapper 下载后先验 Microsoft 签名，安装失败或非零退出码必须阻止主应用安装。
- `Program Files` 只是应用二进制位置；可变配置、缓存和 SQLite 仍遵循系统用户数据目录。Inno 不能代替代码签名，也不能保证没有 UAC/SmartScreen 提示。

## 验证

默认不主动跑 Vitest、Playwright 或 E2E；用户明确要求时再执行。代码完成后至少列出以下 10 条 case，并按当前改动范围做构建、真实启动或人工验证：

1. Web 模式仍识别为 `web`，不暴露桌面能力。
2. Electron 模式仍识别为 `electron`，原 preload 和 IPC 正常。
3. Tauri 模式识别为 `tauri`，平台名保持 `darwin / win32 / linux` 约定。
4. Rust command 返回真实运行时、平台和应用版本。
5. Electron 与 Tauri 环境变量同时存在时立即失败。
6. 正式 Tauri 沿用并冻结已经承载用户数据的 identifier，升级后原 Tauri 数据与 WebView profile 仍可见。
7. 预览空工作区不会修改 Electron 数据库、WAL 或工作区文件；导入前后源库 hash 一致。
8. 正文、metadata、图片、Daily 或画布 debounce 期间关窗，必须先落盘；注入失败时窗口保留。
9. 扫描不完整、重授权选错目录或移除前保存失败时，旧快照、文档 ID 和版本历史仍保留。
10. 正式 tag 只生成 Tauri 包且发布门禁生效；当 GitHub 出现更高正式版本时 Tauri 显示提示并打开该版 Release，当前 Inno 的下载安装边界仍明确为手动。

执行过构建或测试后，检查并清理 `vite.config.*.timestamp-*.mjs`、`vitest.config.*.timestamp-*.mjs` 等临时产物；`src-tauri/target/` 和生成 schema 保持忽略。

## 完成标准

- 当前功能在真实 Tauri 窗口中有可复核证据。
- Electron 旧数据未被移动、覆盖或重建，已有 Tauri 数据身份保持稳定。
- 权限、数据隔离、签名和未迁移能力在文档中说清楚。
- 有凭证时正式包签名 / 公证通过，没凭证时风险说明保留；tag / main / version 门禁生效，一次性手动迁移和当前手动更新边界已写入文档。
- 相关 Tauri 构建通过；Electron 回退可独立构建，但不参与正式 tag。
- 总结明确区分已完成、尚未迁移和未经证明的性能结论。
