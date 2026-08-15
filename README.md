# HarnessProof

[![Self-test](https://github.com/fieldnote-ops/harnessproof/actions/workflows/self-test.yml/badge.svg?branch=main)](https://github.com/fieldnote-ops/harnessproof/actions/workflows/self-test.yml)

An independent, evidence-producing GitHub Action for plugins built for DeepSeek Harness. It installs one plugin through the official `dsh plugin` command in a temporary profile, confirms the plugin bundle is present in the composed configuration, boots the Web profile on loopback, and requires an HTTP 200 response.

## Runtime evidence, not a static lint score

| Stage | Required evidence |
| --- | --- |
| Consumer | Creates an isolated temporary consumer and installs one exact DSH version. |
| Plugin install | Copies the plugin, prepares its locked dependencies with lifecycle scripts disabled, then invokes the official `dsh plugin` command. |
| Composition | Requires the plugin's exact bundle layer and package name in the composed profile. |
| Boot | Starts the Web profile on loopback and requires HTTP 200 before the timeout. |
| Report | Writes a bounded JSON result with consumed versions, lock hashes, timings, checks, and the first failure stage. |
| Authority | Needs only repository contents read access; it does not read model credentials, comment on PRs, upload SARIF, or write repository state. |
| Limit | A green result does not prove plugin tool correctness, a model call, third-party service behavior, adoption, or Marketplace acceptance. |

```yaml
- uses: fieldnote-ops/harnessproof@2b7a246ab595313366cd9806380c3ff0fd6264c9
  with:
    plugin_path: .
    dsh_version: 0.1.0-rc.6
```

The full commit above is the last publicly verified Action revision. Inspect `main` for ongoing development, but keep durable workflows pinned to a reviewed full commit SHA.

The action emits `harnessproof-report.json` by default. A failed run also writes a bounded JSON failure report, emits one injection-safe GitHub error annotation, and exposes the first stage as `failure_stage` when the requested report path is valid. These diagnostics require no PR, issue, or repository write permission. Version 0.1 is deliberately narrow:

- Linux/macOS-style runners and the `web` profile only;
- one exact DSH version per job, so `latest`/`next` belong in a workflow matrix;
- no API keys, model calls, remote plugin calls, PR comments, badges, SARIF uploads, or automatic publishing;
- proves install, configuration composition, process boot, and local HTTP health—not tool correctness.

Before linking the plugin, HarnessProof copies it into the disposable consumer and, by default, runs `npm ci --ignore-scripts` when dependencies are declared. This requires a committed `package-lock.json`, keeps generated `node_modules` out of the checkout, records the lock hash and dependency warnings, and prevents lifecycle scripts from running. Set `prepare_plugin_dependencies: none` only when an earlier workflow step deliberately prepared a self-contained plugin.

Bundle-layer detection accepts both ordinary npm package names and the quoted YAML scalar emitted for scoped names such as `@scope/plugin`; it still requires the exact `# == package` layer label and exact `name:` value.

For release workflows, pin this action by a full commit SHA. DeepSeek Harness is in Developer Preview, so a green result must always record the consumed DSH version.

## Local check

```sh
npm test
```

The runtime has no package dependencies and runs on the GitHub Actions Node 24 runtime. It installs locked plugin dependencies in an isolated copy with lifecycle scripts disabled, installs DSH and pnpm only inside the same temporary consumer directory with lifecycle scripts disabled, then rebuilds only DSH's required `node-pty` native module. The temporary directory is deleted after the report is written. Registry URLs must use HTTPS and cannot embed credentials, query strings, or fragments.

## Project status

FIELD NOTE built HarnessProof as an AI-assisted, human-reviewed interoperability experiment. The current evidence is limited to local isolated-consumer tests: there is no independent-user adoption, Marketplace acceptance, purchase validation, or income evidence yet. The synthetic fixture under `test/fixture-plugin` exists only to exercise the loader and boot path.

MIT licensed. HarnessProof is independent and is not affiliated with, sponsored by, or endorsed by DeepSeek or GitHub. DeepSeek, DeepSeek Harness, GitHub, and GitHub Actions are used only to identify compatibility with their respective products and services.
