import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readConfiguration } from '../index.js'

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
  assert.equal(config.timeoutMs, 15_000)
  assert.equal(config.reportPath, join(workspace, 'artifacts/result.json'))
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
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_PROFILE: 'headless' }, () => readConfiguration()), /profile must be web/)
  assert.throws(() => withInputs({ GITHUB_WORKSPACE: workspace, INPUT_REGISTRY_URL: 'ftp://registry.example' }, () => readConfiguration()), /must use HTTPS/)
})
