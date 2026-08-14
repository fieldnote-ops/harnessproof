import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ACTION_ROOT = dirname(fileURLToPath(import.meta.url))
const PROFILE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/
const VERSION_PATTERN = /^(?:latest|next|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/

function actionInput(name, fallback = '', env = process.env) {
  const normalized = name.toUpperCase()
  const value = env[`INPUT_${normalized}`] ?? env[`INPUT_${normalized.replaceAll('-', '_')}`]
  return value?.trim() || fallback
}

function safeWorkspacePath(value, workspace, label) {
  const path = resolve(workspace, value)
  const relativePath = relative(workspace, path)
  const outside = relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
  if (outside) throw new Error(`${label} must stay inside the workspace`)
  return path
}

function validatedRegistryUrl(value) {
  const registry = new URL(value)
  if (registry.protocol !== 'https:') throw new Error('registry_url must use HTTPS')
  if (registry.username || registry.password) throw new Error('registry_url must not contain credentials')
  if (registry.search || registry.hash) throw new Error('registry_url must not contain a query or fragment')
  return registry.href.replace(/\/$/, '')
}

function run(command, args, options = {}) {
  const startedAt = Date.now()
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 180_000,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${basename(command)} exited ${result.status}${detail ? `: ${detail}` : ''}`)
  }
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), elapsedMs: Date.now() - startedAt }
}

function executableExists(command, env) {
  const probe = spawnSync(command, ['--version'], { env, encoding: 'utf8', shell: false })
  return !probe.error && probe.status === 0
}

function appendOutput(name, value) {
  const destination = process.env.GITHUB_OUTPUT
  if (destination) appendFileSync(destination, `${name}=${String(value).replaceAll('\n', '%0A')}\n`, 'utf8')
}

function appendSummary(report) {
  const destination = process.env.GITHUB_STEP_SUMMARY
  if (!destination) return
  if (report.decision === 'fail') {
    appendFileSync(destination, [
      '## HarnessProof',
      '',
      '- Decision: **fail**',
      `- Stage: \`${report.error.stage}\``,
      `- Error: ${report.error.message.replaceAll('\n', ' ')}`,
      `- Report: \`${report.reportPath}\``,
      '',
    ].join('\n'), 'utf8')
    return
  }
  appendFileSync(destination, [
    '## HarnessProof',
    '',
    `- Decision: **${report.decision}**`,
    `- Plugin: \`${report.plugin.name}@${report.plugin.version}\``,
    `- DSH: \`${report.consumer.dshVersion}\``,
    `- Profile: \`${report.consumer.profile}\``,
    `- Config layer: ${report.checks.configLayer ? 'present' : 'missing'}`,
    `- Web boot / HTTP: ${report.checks.booted ? 'pass' : 'fail'} / ${report.checks.httpStatus}`,
    `- Consumer install / total: ${report.timings.installMs} ms / ${report.timings.totalBeforeCleanupMs} ms`,
    '',
  ].join('\n'), 'utf8')
}

function waitForHealthyWeb(child, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    let output = ''
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) rejectPromise(error)
      else resolvePromise(result)
    }
    const checkUrl = (url) => {
      const request = get(url, { timeout: Math.min(timeoutMs, 5_000) }, (response) => {
        response.resume()
        if (response.statusCode === 200) finish(null, { url, status: 200, output: output.trim() })
        else finish(new Error(`DSH Web returned HTTP ${response.statusCode}`))
      })
      request.on('timeout', () => request.destroy(new Error('DSH Web HTTP probe timed out')))
      request.on('error', (error) => finish(error))
    }
    const consume = (chunk) => {
      output += chunk.toString()
      const match = output.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/)
      if (match) checkUrl(match[1])
    }
    child.stdout.on('data', consume)
    child.stderr.on('data', consume)
    child.once('error', (error) => finish(error))
    child.once('exit', (code, signal) => {
      if (!settled) {
        const detail = output.trim().slice(-4_000)
        finish(new Error(`DSH Web exited before health check: code=${code} signal=${signal}${detail ? `: ${detail}` : ''}`))
      }
    })
    const timer = setTimeout(() => finish(new Error(`DSH Web did not become healthy within ${timeoutMs}ms`)), timeoutMs)
  })
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolvePromise()
    }, 2_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolvePromise()
    })
  })
}

export function readConfiguration(env = process.env) {
  const workspace = resolve(env.GITHUB_WORKSPACE || process.cwd())
  const pluginPath = safeWorkspacePath(actionInput('PLUGIN_PATH', '.', env), workspace, 'plugin_path')
  const reportPath = safeWorkspacePath(actionInput('REPORT_PATH', 'harnessproof-report.json', env), workspace, 'report_path')
  const dshVersion = actionInput('DSH_VERSION', '0.1.0-rc.6', env)
  const profile = actionInput('PROFILE', 'web', env)
  const registryUrl = actionInput('REGISTRY_URL', 'https://registry.npmjs.org', env)
  const timeoutSeconds = Number(actionInput('BOOT_TIMEOUT_SECONDS', '30', env))
  if (!VERSION_PATTERN.test(dshVersion)) throw new Error('dsh_version must be latest, next, or an exact semver')
  if (!PROFILE_PATTERN.test(profile) || profile !== 'web') throw new Error('profile must be web in version 0.1')
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 120) throw new Error('boot_timeout_seconds must be an integer from 5 to 120')
  return { workspace, pluginPath, reportPath, dshVersion, profile, registryUrl: validatedRegistryUrl(registryUrl), timeoutMs: timeoutSeconds * 1_000 }
}

export async function execute(config) {
  const executionStartedAt = Date.now()
  let stage = 'package-contract'
  let plugin
  try {
    const pluginManifestPath = join(config.pluginPath, 'package.json')
    plugin = JSON.parse(readFileSync(pluginManifestPath, 'utf8'))
    const patch = plugin.dsh?.bundle?.patch
    if (!plugin.name || !plugin.version || typeof patch !== 'string') throw new Error('plugin package.json must declare name, version, and dsh.bundle.patch')
    const patchPath = safeWorkspacePath(patch, config.pluginPath, 'dsh.bundle.patch')
    if (!readFileSync(patchPath, 'utf8').trim()) throw new Error('declared DSH bundle patch is empty')
  } catch (error) {
    if (error instanceof Error && !error.harnessproofStage) error.harnessproofStage = stage
    throw error
  }

  const runtime = mkdtempSync(join(tmpdir(), 'harnessproof-'))
  let child
  try {
    const inheritedPath = process.env.PATH || ''
    let dsh = process.env.DSH_EXECUTABLE
    let pnpm = process.env.PNPM_EXECUTABLE
    let installMs = 0
    let nativeModuleRebuildMs = 0
    let installedPackageCount = 0
    let consumerLockSha256 = null
    const isolatedConsumerInstall = !dsh
    if (!dsh) {
      stage = 'consumer-install'
      const install = run('npm', [
        'install', '--prefix', runtime, '--no-audit', '--no-fund', '--ignore-scripts',
        `--registry=${config.registryUrl}`, `@deepseek-ai/dsh@${config.dshVersion}`, 'pnpm@11.0.8',
      ], { cwd: runtime, timeoutMs: 300_000 })
      installMs = install.elapsedMs
      const nativeModuleRebuild = run('npm', [
        'rebuild', '--prefix', runtime, '--no-audit', '--no-fund',
        `--registry=${config.registryUrl}`, 'node-pty',
      ], { cwd: runtime, timeoutMs: 180_000 })
      nativeModuleRebuildMs = nativeModuleRebuild.elapsedMs
      installedPackageCount = Number(install.stdout.match(/added\s+(\d+)\s+packages?/)?.[1] || 0)
      consumerLockSha256 = createHash('sha256').update(readFileSync(join(runtime, 'package-lock.json'))).digest('hex')
      dsh = join(runtime, 'node_modules', '.bin', 'dsh')
      pnpm = join(runtime, 'node_modules', '.bin', 'pnpm')
    }
    const binaryDir = dirname(pnpm || dsh)
    const env = {
      ...process.env,
      DSH_HOME: join(runtime, 'dsh-home'),
      PATH: `${binaryDir}${delimiter}${inheritedPath}`,
    }
    if (pnpm && !executableExists(pnpm, env)) throw new Error('pnpm executable is not runnable')
    if (!pnpm && !executableExists('pnpm', env)) throw new Error('pnpm is required for official DSH plugin installation')

    stage = 'version-probe'
    const versionProbe = run(dsh, ['--version'], { cwd: config.pluginPath, env })
    const observedVersion = versionProbe.stdout
    stage = 'plugin-add'
    const pluginAdd = run(dsh, ['plugin', '--profile', config.profile, 'add', `link:${config.pluginPath}`], { cwd: config.pluginPath, env })
    stage = 'config-compose'
    const dumpConfig = run(dsh, ['--profile', config.profile, '--dump-config'], { cwd: config.pluginPath, env })
    const composed = dumpConfig.stdout
    const configLayer = composed.includes(`# == ${plugin.name}`) && composed.includes(`name: ${plugin.name}`)
    if (!configLayer) throw new Error(`composed profile does not contain the ${plugin.name} bundle layer`)

    stage = 'web-boot'
    child = spawn(dsh, ['web', '--host', '127.0.0.1', '--port', '0'], {
      cwd: config.pluginPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    const bootStartedAt = Date.now()
    const health = await waitForHealthyWeb(child, config.timeoutMs)
    const bootMs = Date.now() - bootStartedAt
    const actionManifest = JSON.parse(readFileSync(join(ACTION_ROOT, 'package.json'), 'utf8'))
    const report = {
      schemaVersion: 1,
      decision: 'pass',
      action: {
        name: actionManifest.name,
        version: actionManifest.version,
        runtime: 'node24',
        entrypointSha256: createHash('sha256').update(readFileSync(join(ACTION_ROOT, 'index.js'))).digest('hex'),
        metadataSha256: createHash('sha256').update(readFileSync(join(ACTION_ROOT, 'action.yml'))).digest('hex'),
      },
      plugin: { name: plugin.name, version: plugin.version, path: relative(config.workspace, config.pluginPath) || '.' },
      consumer: { package: '@deepseek-ai/dsh', requestedVersion: config.dshVersion, dshVersion: observedVersion, profile: config.profile },
      checks: { packageContract: true, officialPluginAdd: true, configLayer, booted: true, httpStatus: health.status },
      timings: {
        isolatedConsumerInstall,
        installMs,
        nativeModuleRebuildMs,
        installedPackageCount,
        consumerLockSha256,
        versionProbeMs: versionProbe.elapsedMs,
        pluginAddMs: pluginAdd.elapsedMs,
        dumpConfigMs: dumpConfig.elapsedMs,
        bootToHttpMs: bootMs,
        totalBeforeCleanupMs: Date.now() - executionStartedAt,
      },
      security: { isolatedDshHome: true, credentialsRequired: false, externalServiceCalled: false, shellInterpolation: false, lifecycleScripts: 'node-pty-rebuild-only' },
      evidenceLimit: 'Proves clean-profile install, composition, process boot, and local HTTP health only; it does not execute plugin tools or validate third-party credentials.',
    }
    stage = 'report-write'
    mkdirSync(dirname(config.reportPath), { recursive: true })
    writeFileSync(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return report
  } catch (error) {
    if (error instanceof Error && !error.harnessproofStage) error.harnessproofStage = stage
    throw error
  } finally {
    if (child) await stopChild(child)
    rmSync(runtime, { recursive: true, force: true })
  }
}

async function main() {
  let config
  try {
    config = readConfiguration()
    const report = await execute(config)
    appendOutput('decision', report.decision)
    appendOutput('report_path', relative(config.workspace, config.reportPath))
    appendOutput('dsh_version', report.consumer.dshVersion)
    appendSummary(report)
    process.stdout.write(`HarnessProof passed: ${report.plugin.name}@${report.plugin.version} on ${report.consumer.dshVersion}.\n`)
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(-4_000)
    const stage = error instanceof Error && typeof error.harnessproofStage === 'string' ? error.harnessproofStage : 'configuration'
    if (config) {
      const report = {
        schemaVersion: 1,
        decision: 'fail',
        reportPath: relative(config.workspace, config.reportPath),
        error: { stage, message },
        security: { credentialsRequired: false, shellInterpolation: false, errorMessageLimitBytes: 4_000 },
        evidenceLimit: 'Records the first failed HarnessProof stage and a bounded error only; it does not prove plugin incompatibility without reproducing the failure.',
      }
      mkdirSync(dirname(config.reportPath), { recursive: true })
      writeFileSync(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      appendOutput('decision', 'fail')
      appendOutput('report_path', report.reportPath)
      appendSummary(report)
    }
    process.stderr.write(`HarnessProof failed at ${stage}: ${message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main()
