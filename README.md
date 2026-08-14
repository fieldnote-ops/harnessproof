# HarnessProof

An independent, evidence-producing GitHub Action for plugins built for DeepSeek Harness. It installs one plugin through the official `dsh plugin` command in a temporary profile, confirms the plugin bundle is present in the composed configuration, boots the Web profile on loopback, and requires an HTTP 200 response.

```yaml
- uses: fieldnote-ops/harnessproof@main
  with:
    plugin_path: .
    dsh_version: 0.1.0-rc.6
```

`main` is shown only for the initial developer preview. For a durable workflow, replace it with a reviewed full commit SHA.

The action emits `dsh-compat-report.json`. Version 0.1 is deliberately narrow:

- Linux/macOS-style runners and the `web` profile only;
- one exact DSH version per job, so `latest`/`next` belong in a workflow matrix;
- no API keys, model calls, remote plugin calls, PR comments, badges, SARIF, or automatic publishing;
- proves install, configuration composition, process boot, and local HTTP health—not tool correctness.

For release workflows, pin this action by a full commit SHA. DeepSeek Harness is in Developer Preview, so a green result must always record the consumed DSH version.

## Local check

```sh
npm test
```

The runtime has no package dependencies. It installs DSH and pnpm only inside an isolated temporary consumer directory and deletes that directory after the report is written.

## Project status

FIELD NOTE built HarnessProof as an AI-assisted, human-reviewed interoperability experiment. The current evidence is limited to local isolated-consumer tests: there is no independent-user adoption, Marketplace acceptance, purchase validation, or income evidence yet. The synthetic fixture under `test/fixture-plugin` exists only to exercise the loader and boot path.

MIT licensed. HarnessProof is independent and is not affiliated with, sponsored by, or endorsed by DeepSeek or GitHub. DeepSeek, DeepSeek Harness, GitHub, and GitHub Actions are used only to identify compatibility with their respective products and services.
