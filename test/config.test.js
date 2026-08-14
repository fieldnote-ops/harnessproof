import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { configLayerPresent, readConfiguration } from '../index.js'

function withInputs(values, callback) {
  const prior = { ...process.env }
  Object.assign(process.env, values)
  try {
    return callback()
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key]
    Object.assign(process.env, prior)
  }
}

test('accepts an exact local and HTTPS configuration', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-action-config-'))
  const config = withInputs({
    GITHUB_WORKSPACE: workspace,
    INPUT_PLUGIN_PATH: '.',
    INPUT_REPORT_PATH: 'artifacts/result.json',
    INPUT_DSH_VERSION: '0.1.0-rc.6',
    INPUT_PROFILE: 'web',
    INPUT_BOOT_TIMEOUT_SECONDS: '15',
    INPUT_REGISTRY_URL: 'https://registry.npmjs.org',
  }, () => readConfiguration())
  assert.equal(config.workspace, workspace)
  assert.equal(config.profile, 'web')
  assert.equal(config.preparePluginDependencies, 'locked')
  assert.equal(config.timeoutMs, 15_000)
  assert.equal(config.reportPath, join(workspace, 'artifacts/result.json'))
})

test('recognizes exact quoted scoped package layers without substring matches', () => {
  const scoped = [
    '# == @fieldnote/dingtalk-stream-core',
    '- id: bridge',
    "  name: '@fieldnote/dingtalk-stream-core'",
    '',
  ].join('\n')
  assert.equal(configLayerPresent(scoped, '@fieldnote/dingtalk-stream-core'), true)
  assert.equal(configLayerPresent(scoped, '@fieldnote/dingtalk-stream'), false)
  assert.equal(configLayerPresent(scoped.replace("'@fieldnote/dingtalk-stream-core'", "'@attacker/other'"), '@fieldnote/dingtalk-stream-core'), false)
  assert.equal(configLayerPresent('# == plain-plugin\n- id: x\n  name: plain-plugin\n', 'plain-plugin'), true)
})

test('rejects report traversal', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-action-config-'))
  assert.throws(() => withInputs({
    GITHUB_WORKSPACE: workspace,
    INPUT_REPORT_PATH: '../outside.json',
  }, () => readConfiguration()), /stay inside the workspace/)
})

test('rejects unsupported profiles and insecure registries', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-action-config-'))
  const exampleRegistry = new URL(['https:', '', ['registry', 'example'].join('.')].join('/'))
  const registryWithUserinfo = new URL(exampleRegistry)
  registryWithUserinfo.username = 'user'
  const registryWithQuery = new URL(exampleRegistry)
  registryWithQuery.searchParams.set('example', 'value')
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_PROFILE: 'headless' }, () => readConfiguration()), /profile must be web/)
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_PREPARE_PLUGIN_DEPENDENCIES: 'install' }, () => readConfiguration()), /must be locked or none/)
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_REGISTRY_URL: 'ftp://registry.example' }, () => readConfiguration()), /must use HTTPS/)
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_REGISTRY_URL: registryWithUserinfo.href }, () => readConfiguration()), /must not contain credentials/)
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_REGISTRY_URL: registryWithQuery.href }, () => readConfiguration()), /must not contain a query or fragment/)
})

test('fails before consumer installation when locked plugin dependencies have no lockfile', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-action-unlocked-'))
  const plugin = join(workspace, 'unlocked-plugin')
  mkdirSync(plugin)
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({
    name: 'unlocked-plugin',
    version: '0.0.0',
    dependencies: { example: '1.0.0' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(plugin, 'cordis.patch.yml'), '- insert: []\n')
  const reportPath = join(workspace, 'reports', 'failure.json')
  const entrypoint = fileURLToPath(new URL('../index.js', import.meta.url))
  const run = spawnSync(process.execPath, [entrypoint], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: workspace,
      INPUT_PLUGIN_PATH: 'unlocked-plugin',
      INPUT_REPORT_PATH: 'reports/failure.json',
    },
    encoding: 'utf8',
  })
  assert.notEqual(run.status, 0)
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.equal(report.error.stage, 'plugin-dependency-prepare')
  assert.match(report.error.message, /requires package-lock\.json/)
})

test('writes a bounded structured failure report after configuration succeeds', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-action-failure-'))
  const plugin = join(workspace, 'broken-plugin')
  mkdirSync(plugin)
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'broken-plugin', version: '0.0.0' }))
  const reportPath = join(workspace, 'reports', 'failure.json')
  const entrypoint = fileURLToPath(new URL('../index.js', import.meta.url))
  const run = spawnSync(process.execPath, [entrypoint], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: workspace,
      INPUT_PLUGIN_PATH: 'broken-plugin',
      INPUT_REPORT_PATH: 'reports/failure.json',
    },
    encoding: 'utf8',
  })
  assert.notEqual(run.status, 0)
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.equal(report.decision, 'fail')
  assert.equal(report.error.stage, 'package-contract')
  assert.match(report.error.message, /dsh\.bundle\.patch/)
  assert.ok(Buffer.byteLength(report.error.message) <= 4_000)
})
