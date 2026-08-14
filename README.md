# HarnessProof

An independent, evidence-producing GitHub Action for plugins built for DeepSeek Harness. It installs one plugin through the official `dsh plugin` command in a temporary profile, confirms the plugin bundle is present in the composed configuration, boots the Web profile on loopback, and requires an HTTP 200 response.

```yaml
- uses: fieldnote-ops/harnessproof@main
  with:
    plugin_path: .
    dsh_version: 0.1.0-rc.6
```

`main` is shown only for the initial developer preview. For a durable workflow, replace it with a reviewed full commit SHA.

The action emits `harnessproof-report.json` by default. A failed run also writes a bounded JSON failure report when the requested report path is valid, so the first failed stage remains inspectable without granting write permissions. Version 0.1 is deliberately narrow:

- Linux/macOS-style runners and the `web` profile only;
- one exact DSH version per job, so `latest`/`next` belong in a workflow matrix;
- no API keys, model calls, remote plugin calls, PR comments, badges, SARIF, or automatic publishing;
- proves install, configuration composition, process boot, and local HTTP health—not tool correctness.

Before linking the plugin, HarnessProof copies it into the disposable consumer and, by default, runs `npm ci --ignore-scripts` when dependencies are declared. This requires a committed `package-lock.json`, keeps generated `node_modules` out of the checkout, records the lock hash and dependency warnings, and prevents lifecycle scripts from running. Set `prepare_plugin_dependencies: none` only when an earlier workflow step deliberately prepared a self-contained plugin.

For release workflows, pin this action by a full commit SHA. DeepSeek Harness is in Developer Preview, so a green result must always record the consumed DSH version.

## Local check

```sh
npm test
```

The runtime has no package dependencies and runs on the GitHub Actions Node 24 runtime. It installs locked plugin dependencies in an isolated copy with lifecycle scripts disabled, installs DSH and pnpm only inside the same temporary consumer directory with lifecycle scripts disabled, then rebuilds only DSH's required `node-pty` native module. The temporary directory is deleted after the report is written. Registry URLs must use HTTPS and cannot embed credentials, query strings, or fragments.

## Project status

FIELD NOTE built HarnessProof as an AI-assisted, human-reviewed interoperability experiment. The current evidence is limited to local isolated-consumer tests: there is no independent-user adoption, Marketplace acceptance, purchase validation, or income evidence yet. The synthetic fixture under `test/fixture-plugin` exists only to exercise the loader and boot path.

MIT licensed. HarnessProof is independent and is not affiliated with, sponsored by, or endorsed by DeepSeek or GitHub. DeepSeek, DeepSeek Harness, GitHub, and GitHub Actions are used only to identify compatibility with their respective products and services.
