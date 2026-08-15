# HarnessProof

这是一个面向 DeepSeek Harness 插件的独立兼容性 GitHub Action：在临时 profile 中通过官方 `dsh plugin` 命令安装插件，确认 bundle 已进入组合配置，随后在回环地址启动 Web profile，并要求首页返回 HTTP 200。

```yaml
- uses: fieldnote-ops/harnessproof@main
  with:
    plugin_path: .
    dsh_version: 0.1.0-rc.6
```

这里的 `main` 只用于最初的开发者预览；长期工作流应替换为经过审阅的完整 commit SHA。

默认报告路径为 `harnessproof-report.json`。当报告路径本身有效时，失败任务还会写出一份有长度上限的 JSON 报告、生成一条防注入的 GitHub 错误 annotation，并把首个失败阶段暴露为 `failure_stage`。这些诊断不需要 PR、Issue 或仓库写权限。v0.1 有意保持窄边界：

- 只支持 Linux/macOS 风格 runner 与 `web` profile；
- 每个 job 只核一个精确 DSH 版本，`latest` / `next` 应放进 workflow matrix；
- 不读取 API key、不调用模型或插件远程服务、不自动评论 PR、不生成徽章或上传 SARIF、不发布；
- 只证明安装、配置组合、进程启动和本地 HTTP 健康，不证明插件工具本身正确。

在链接插件之前，HarnessProof 会把插件复制到一次性 consumer；只要声明了依赖，默认就在副本中运行 `npm ci --ignore-scripts`。因此插件必须提交 `package-lock.json`，生成的 `node_modules` 不会污染 checkout，报告会记录 lock 哈希和依赖警告，生命周期脚本不会运行。只有当更早的工作流步骤已经明确准备好一个自包含插件时，才应设置 `prepare_plugin_dependencies: none`。

Bundle 层检测同时接受普通 npm 包名，以及 YAML 对 `@scope/plugin` 这类 scoped 包名生成的带引号标量；仍必须同时匹配精确的 `# == package` 层标签与精确 `name:` 值。

正式工作流应使用完整 commit SHA 固定本 Action。DeepSeek Harness 仍是 Developer Preview，因此任何绿色结果都必须同时记录实际消费的 DSH 版本。

运行时代码零依赖，使用 GitHub Actions Node 24 运行时；它先在隔离副本中安装锁定的插件依赖并禁用生命周期脚本，再只在同一个临时 consumer 目录中安装 DSH 与 pnpm，并同样关闭生命周期脚本，随后只重建 DSH 必需的 `node-pty` 原生模块。报告写出后删除临时目录。Registry URL 必须使用 HTTPS，且不得嵌入凭据、查询参数或片段。

## 当前状态

HarnessProof 是 FIELD NOTE 的 AI 辅助、人工复核互操作实验。当前证据仅来自本地隔离 consumer：尚无陌生用户采用、Marketplace 接受、购买验证或收入证据。`test/fixture-plugin` 是只用于加载与启动验证的合成 fixture。

项目采用 MIT 许可。HarnessProof 与 DeepSeek、GitHub 无隶属、赞助或背书关系；文中的 DeepSeek、DeepSeek Harness、GitHub 与 GitHub Actions 仅用于说明与相应产品或服务的兼容关系。
