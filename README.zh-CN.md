# HarnessProof

这是一个面向 DeepSeek Harness 插件的独立兼容性 GitHub Action：在临时 profile 中通过官方 `dsh plugin` 命令安装插件，确认 bundle 已进入组合配置，随后在回环地址启动 Web profile，并要求首页返回 HTTP 200。

```yaml
- uses: fieldnote-ops/harnessproof@main
  with:
    plugin_path: .
    dsh_version: 0.1.0-rc.6
```

这里的 `main` 只用于最初的开发者预览；长期工作流应替换为经过审阅的完整 commit SHA。

v0.1 有意保持窄边界：

- 只支持 Linux/macOS 风格 runner 与 `web` profile；
- 每个 job 只核一个精确 DSH 版本，`latest` / `next` 应放进 workflow matrix；
- 不读取 API key、不调用模型或插件远程服务、不自动评论 PR、不生成徽章或 SARIF、不发布；
- 只证明安装、配置组合、进程启动和本地 HTTP 健康，不证明插件工具本身正确。

正式工作流应使用完整 commit SHA 固定本 Action。DeepSeek Harness 仍是 Developer Preview，因此任何绿色结果都必须同时记录实际消费的 DSH 版本。

运行时代码零依赖；DSH 与 pnpm 只安装在隔离临时目录，报告写出后删除。

## 当前状态

HarnessProof 是 FIELD NOTE 的 AI 辅助、人工复核互操作实验。当前证据仅来自本地隔离 consumer：尚无陌生用户采用、Marketplace 接受、购买验证或收入证据。`test/fixture-plugin` 是只用于加载与启动验证的合成 fixture。

项目采用 MIT 许可。HarnessProof 与 DeepSeek、GitHub 无隶属、赞助或背书关系；文中的 DeepSeek、DeepSeek Harness、GitHub 与 GitHub Actions 仅用于说明与相应产品或服务的兼容关系。
