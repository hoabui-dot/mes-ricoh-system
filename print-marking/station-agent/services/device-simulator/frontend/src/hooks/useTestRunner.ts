import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import type { TestDefinition, TestStep } from '../testDefinitions'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StepTrace {
  stepIndex: number
  description: string
  descriptionVi: string
  action: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  method?: string
  url?: string
  requestPayload?: unknown
  responsePayload?: unknown
  statusCode?: number
  result: 'running' | 'pass' | 'fail' | 'skip'
  error?: string
}

export interface TestRun {
  testId: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'idle' | 'running' | 'passed' | 'failed' | 'skipped'
  steps: StepTrace[]
  signalREventsReceived: number
  apiCallsExecuted: number
  error?: string
}

export type TestRunMap = Record<string, TestRun>

export interface TestMetrics {
  total: number
  passed: number
  failed: number
  running: number
  idle: number
  skipped: number
  successRate: number
  avgDurationMs: number
  totalSignalREvents: number
  totalApiCalls: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function apiCall(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
  token?: string | null
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {}
  if (body) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(url, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    if (part.startsWith('[') && part.endsWith(']')) {
      const idx = parseInt(part.slice(1, -1), 10)
      cur = (cur as unknown[])[idx]
    } else {
      cur = (cur as Record<string, unknown>)[part]
    }
  }
  return cur
}

// Poll for a job to reach a target status, returning the latest job or null on timeout
async function pollJobStatus(
  targetStatus: string,
  timeoutMs: number,
  latestJobIdRef: MutableRefObject<string | null>
): Promise<{ status: string; jobId: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(1500)
    try {
      const res = await fetch('/api/jobs')
      if (!res.ok) continue
      const jobs = (await res.json()) as { jobId: string; status: string }[]
      if (!jobs || jobs.length === 0) continue

      const latest = jobs[0]
      latestJobIdRef.current = latest.jobId

      if (latest.status.toUpperCase() === targetStatus.toUpperCase()) {
        return latest
      }
      // If we're waiting for COMPLETED but job is FAILED — exit early
      if (targetStatus === 'COMPLETED' && latest.status.toUpperCase() === 'FAILED') {
        return latest
      }
      // If waiting for FAILED but job is COMPLETED — exit early  
      if (targetStatus === 'FAILED' && latest.status.toUpperCase() === 'COMPLETED') {
        return latest
      }
    } catch {
      // continue polling
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useTestRunner(signalRConnected: boolean, signalREventCount: number) {
  const [runs, setRuns] = useState<TestRunMap>({})
  const [runningAll, setRunningAll] = useState(false)
  const latestJobIdRef = useRef<string | null>(null)

  const updateRun = useCallback((testId: string, updater: (prev: TestRun) => TestRun) => {
    setRuns((prev) => ({
      ...prev,
      [testId]: updater(
        prev[testId] ?? {
          testId,
          startedAt: new Date().toISOString(),
          status: 'idle',
          steps: [],
          signalREventsReceived: 0,
          apiCallsExecuted: 0,
        }
      ),
    }))
  }, [])

  const updateStep = useCallback(
    (testId: string, stepIndex: number, updater: (prev: StepTrace) => StepTrace) => {
      setRuns((prev) => {
        const run = prev[testId]
        if (!run) return prev
        const newSteps = [...run.steps]
        newSteps[stepIndex] = updater(newSteps[stepIndex])
        return { ...prev, [testId]: { ...run, steps: newSteps } }
      })
    },
    []
  )

  const executeStep = useCallback(
    async (
      testId: string,
      step: TestStep,
      stepIndex: number,
      run: TestRun,
      customParams?: Record<string, string>,
      context?: { authToken: string | null; createdUserId: string | null }
    ): Promise<boolean> => {
      const currentParams: Record<string, string> = {
        ...customParams,
        createdUserId: context?.createdUserId ?? '',
      }

      const interpolate = (str: string) => {
        if (!str || !currentParams) return str
        return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
          return currentParams[key] !== undefined ? currentParams[key] : match
        })
      }

      const interpolateObj = (obj: unknown): unknown => {
        if (!obj || typeof obj !== 'object' || !currentParams) return obj
        if (Array.isArray(obj)) {
          return obj.map(item => interpolateObj(item))
        }
        const result: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (typeof v === 'string') {
            result[k] = interpolate(v)
          } else if (v && typeof v === 'object') {
            result[k] = interpolateObj(v)
          } else {
            result[k] = v
          }
        }
        return result
      }

      const stepUrl = step.url ? interpolate(step.url) : undefined
      const stepBody = step.body ? interpolateObj(step.body) as Record<string, string> : undefined
      const stepDescription = step.description ? interpolate(step.description) : ''
      const stepDescriptionVi = step.descriptionVi ? interpolate(step.descriptionVi) : ''
      const stepScenario = step.scenario ? interpolate(step.scenario) : undefined

      const trace: StepTrace = {
        stepIndex,
        description: stepDescription,
        descriptionVi: stepDescriptionVi,
        action: step.action,
        startedAt: new Date().toISOString(),
        result: 'running',
      }

      setRuns((prev) => {
        const r = prev[testId]
        if (!r) return prev
        const newSteps = [...r.steps]
        newSteps[stepIndex] = trace
        return { ...prev, [testId]: { ...r, steps: newSteps } }
      })

      const start = Date.now()
      let pass = true
      let error: string | undefined

      try {
        switch (step.action) {
          // ── Device State ──────────────────────────────────────────────────

          case 'DisablePrinter': {
            const { status } = await apiCall('/api/printer/disconnect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/printer/disconnect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'EnablePrinter': {
            const { status } = await apiCall('/api/printer/connect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/printer/connect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'DisableLaser': {
            const { status } = await apiCall('/api/laser/disconnect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/laser/disconnect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'EnableLaser': {
            const { status } = await apiCall('/api/laser/connect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/laser/connect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'DisableVision': {
            const { status } = await apiCall('/api/vision/disconnect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/vision/disconnect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'EnableVision': {
            const { status } = await apiCall('/api/vision/connect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/vision/connect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'DisablePLC': {
            const { status } = await apiCall('/api/plc/disconnect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/plc/disconnect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'EnablePLC': {
            const { status } = await apiCall('/api/plc/connect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/plc/connect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'DisableGateway': {
            const { status } = await apiCall('/api/gateway/disconnect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/gateway/disconnect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'EnableGateway': {
            const { status } = await apiCall('/api/gateway/connect', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/gateway/connect'
            trace.method = 'POST'
            trace.statusCode = status
            break
          }

          case 'ResetDevices': {
            const { status, data } = await apiCall('/api/test/reset', 'POST')
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/test/reset'
            trace.method = 'POST'
            trace.statusCode = status
            trace.responsePayload = data
            break
          }

          // ── Job Triggers ──────────────────────────────────────────────────

          case 'TriggerPrintJob': {
            const body = stepScenario ? { scenario: stepScenario } : {}
            const { status, data } = await apiCall('/api/gateway/send-print-job', 'POST', body)
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/gateway/send-print-job'
            trace.method = 'POST'
            trace.requestPayload = body
            trace.responsePayload = data
            trace.statusCode = status
            break
          }

          case 'TriggerMarkJob': {
            const body = { scenario: stepScenario ?? 'success' }
            const { status, data } = await apiCall('/api/gateway/send-mark-job', 'POST', body)
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/gateway/send-mark-job'
            trace.method = 'POST'
            trace.requestPayload = body
            trace.responsePayload = data
            trace.statusCode = status
            break
          }

          case 'TriggerPrintMarkJob': {
            const body = { scenario: stepScenario ?? 'success' }
            const { status, data } = await apiCall('/api/gateway/send-print-mark-job', 'POST', body)
            pass = status < 400
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = '/api/gateway/send-print-mark-job'
            trace.method = 'POST'
            trace.requestPayload = body
            trace.responsePayload = data
            trace.statusCode = status
            break
          }

          // ── Job Wait ──────────────────────────────────────────────────────

          case 'WaitForJobCompleted': {
            const timeout = step.durationMs ?? 10000
            const result = await pollJobStatus('COMPLETED', timeout, latestJobIdRef)
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            if (!result) {
              pass = false
              error = `Job did not reach COMPLETED within ${timeout}ms`
            } else if (result.status.toUpperCase() !== 'COMPLETED') {
              pass = false
              error = `Expected COMPLETED, got ${result.status}`
            }
            trace.responsePayload = result
            break
          }

          case 'WaitForJobFailed': {
            const timeout = step.durationMs ?? 12000
            const result = await pollJobStatus('FAILED', timeout, latestJobIdRef)
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            if (!result) {
              pass = false
              error = `Job did not reach FAILED within ${timeout}ms`
            } else if (result.status.toUpperCase() !== 'FAILED') {
              pass = false
              error = `Expected FAILED, got ${result.status}`
            }
            trace.responsePayload = result
            break
          }

          // ── Verification ──────────────────────────────────────────────────

          case 'VerifyJobExists': {
            const { status, data } = await apiCall('/api/jobs', 'GET')
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            const jobs = data as { jobId: string }[]
            pass = status < 400 && Array.isArray(jobs) && jobs.length > 0
            if (!pass) error = 'No jobs found'
            trace.url = '/api/jobs'
            trace.statusCode = status
            trace.responsePayload = data
            break
          }

          case 'VerifyJobStatus': {
            const { status, data } = await apiCall('/api/jobs', 'GET')
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            const jobs = data as { status: string }[]
            const latest = Array.isArray(jobs) ? jobs[0] : null
            const expected = step.jobStatusExpected?.toUpperCase()
            const actual = latest?.status?.toUpperCase()
            pass = status < 400 && !!latest && actual === expected
            if (!pass) error = `Expected ${expected}, got ${actual ?? 'no job'}`
            trace.url = '/api/jobs'
            trace.statusCode = status
            trace.responsePayload = latest
            break
          }

          case 'VerifyDeviceStatus': {
            const { status, data } = await apiCall('/api/status', 'GET')
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            const state = data as Record<string, Record<string, unknown>>
            const device = step.device
            const expectedOnline = step.deviceOnline
            if (device && expectedOnline !== undefined && state?.[device]) {
              const key = device === 'gateway' ? 'connected' : 'online'
              const actual = state[device][key]
              pass = status < 400 && actual === expectedOnline
              if (!pass) error = `Device ${device}: expected ${key}=${expectedOnline}, got ${actual}`
            }
            trace.url = '/api/status'
            trace.statusCode = status
            trace.responsePayload = state
            break
          }

          // ── SignalR ───────────────────────────────────────────────────────

          case 'CheckSignalRConnected': {
            pass = signalRConnected
            if (!pass) error = 'SignalR hub is not connected'
            break
          }

          case 'CheckSignalREvent': {
            // Check if we've received at least one SignalR event since test started
            pass = signalREventCount > (run.signalREventsReceived ?? 0)
            if (!pass) error = 'No SignalR events received during test execution'
            break
          }

          // ── Generic HTTP ──────────────────────────────────────────────────

          case 'HttpGet':
          case 'HttpPost':
          case 'HttpDelete': {
            const url = stepUrl ?? '/api/status'
            const method = step.method ?? (step.action === 'HttpGet' ? 'GET' : step.action === 'HttpDelete' ? 'DELETE' : 'POST')
            const body = stepBody
            const { status, data } = await apiCall(url, method as any, body as any, context?.authToken)
            updateRun(testId, (r) => ({ ...r, apiCallsExecuted: r.apiCallsExecuted + 1 }))
            trace.url = url
            trace.method = method
            trace.requestPayload = body
            trace.responsePayload = data
            trace.statusCode = status

            // Capture tokens or created user IDs if successful
            if (status >= 200 && status < 300 && data && typeof data === 'object' && context) {
              const resData = data as Record<string, unknown>
              if (resData.token && typeof resData.token === 'string') {
                context.authToken = resData.token
              }
              if (resData.id && typeof resData.id === 'string') {
                context.createdUserId = resData.id
              }
            }

            if (step.expectedStatus !== undefined) {
              pass = status === step.expectedStatus
              if (!pass) error = `Expected HTTP ${step.expectedStatus}, got ${status}`
            } else {
              pass = status < 400
            }

            if (pass && step.assertPath && step.assertValue !== undefined) {
              const actual = getNestedValue(data, step.assertPath)
              pass = String(actual) === String(step.assertValue)
              if (!pass) error = `Assert failed: ${step.assertPath} expected "${step.assertValue}", got "${actual}"`
            }
            break
          }

          // ── Sleep ─────────────────────────────────────────────────────────

          case 'Sleep': {
            await sleep(step.durationMs ?? 1000)
            pass = true
            break
          }

          default:
            pass = false
            error = `Unknown step action: ${step.action}`
        }
      } catch (err: unknown) {
        pass = false
        error = err instanceof Error ? err.message : String(err)
      }

      const durationMs = Date.now() - start
      const finishedAt = new Date().toISOString()

      const finishedTrace: StepTrace = {
        ...trace,
        finishedAt,
        durationMs,
        result: pass ? 'pass' : 'fail',
        error,
      }

      setRuns((prev) => {
        const r = prev[testId]
        if (!r) return prev
        const newSteps = [...r.steps]
        newSteps[stepIndex] = finishedTrace
        return { ...prev, [testId]: { ...r, steps: newSteps } }
      })

      return pass
    },
    [signalRConnected, signalREventCount, updateRun]
  )

  const runTest = useCallback(
    async (test: TestDefinition, customParams?: Record<string, string>) => {
      const startedAt = new Date().toISOString()
      const initialSignalRCount = signalREventCount

      const context = {
        authToken: null as string | null,
        createdUserId: null as string | null,
      }

      const mergedParams = {
        ...test.parameters?.reduce((acc, p) => ({ ...acc, [p.key]: p.defaultValue }), {}),
        ...customParams,
      } as Record<string, string>

      updateRun(test.id, () => ({
        testId: test.id,
        startedAt,
        status: 'running',
        steps: [],
        signalREventsReceived: 0,
        apiCallsExecuted: 0,
      }))

      let allPassed = true

      for (let i = 0; i < test.steps.length; i++) {
        const step = test.steps[i]
        const currentRun = await new Promise<TestRun>((resolve) => {
          setRuns((prev) => {
            resolve(prev[test.id] ?? { steps: [], signalREventsReceived: 0, apiCallsExecuted: 0 } as unknown as TestRun)
            return prev
          })
        })

        const passed = await executeStep(test.id, step, i, currentRun, mergedParams, context)
        if (!passed) {
          allPassed = false
          break
        }
      }

      const finishedAt = new Date().toISOString()

      setRuns((prev) => {
        const r = prev[test.id]
        if (!r) return prev
        return {
          ...prev,
          [test.id]: {
            ...r,
            finishedAt,
            durationMs: new Date(finishedAt).getTime() - new Date(r.startedAt).getTime(),
            status: test.isManual ? 'skipped' : allPassed ? 'passed' : 'failed',
            signalREventsReceived: signalREventCount - initialSignalRCount,
          },
        }
      })
    },
    [executeStep, signalREventCount, updateRun]
  )

  const runAllTests = useCallback(
    async (tests: TestDefinition[], allParams?: Record<string, Record<string, string>>) => {
      setRunningAll(true)
      for (const test of tests) {
        const customParams = allParams?.[test.id]
        await runTest(test, customParams)
        await sleep(500) // Brief pause between tests
      }
      setRunningAll(false)
    },
    [runTest]
  )

  const resetTest = useCallback((testId: string) => {
    setRuns((prev) => {
      const next = { ...prev }
      delete next[testId]
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setRuns({})
  }, [])

  const computeMetrics = useCallback(
    (tests: TestDefinition[]): TestMetrics => {
      let passed = 0, failed = 0, running = 0, idle = 0, skipped = 0
      let totalDuration = 0, countWithDuration = 0
      let totalSignalR = 0, totalApi = 0

      for (const t of tests) {
        const run = runs[t.id]
        if (!run) { idle++; continue }
        if (run.status === 'passed') passed++
        else if (run.status === 'failed') failed++
        else if (run.status === 'running') running++
        else if (run.status === 'skipped') skipped++
        else idle++

        if (run.durationMs) { totalDuration += run.durationMs; countWithDuration++ }
        totalSignalR += run.signalREventsReceived ?? 0
        totalApi += run.apiCallsExecuted ?? 0
      }

      const total = tests.length
      const executed = passed + failed
      return {
        total,
        passed,
        failed,
        running,
        idle,
        skipped,
        successRate: executed > 0 ? Math.round((passed / executed) * 1000) / 10 : 0,
        avgDurationMs: countWithDuration > 0 ? Math.round(totalDuration / countWithDuration) : 0,
        totalSignalREvents: totalSignalR,
        totalApiCalls: totalApi,
      }
    },
    [runs]
  )

  const exportReport = useCallback(
    (tests: TestDefinition[], format: 'json' | 'markdown' | 'html') => {
      const metrics = computeMetrics(tests)
      const date = new Date().toISOString().split('T')[0]

      const testResults = tests.map((t) => ({
        id: t.id,
        name: t.name,
        nameVi: t.nameVi,
        category: t.category,
        status: runs[t.id]?.status ?? 'idle',
        durationMs: runs[t.id]?.durationMs,
        steps: runs[t.id]?.steps ?? [],
        error: runs[t.id]?.steps.find((s) => s.result === 'fail')?.error,
      }))

      let content = ''
      let mime = 'application/json'
      let filename = `test-report-${date}.json`

      if (format === 'json') {
        content = JSON.stringify({ date, metrics, tests: testResults }, null, 2)
      } else if (format === 'markdown') {
        mime = 'text/markdown'
        filename = `test-report-${date}.md`
        content = `# Test Run — ${date}\n\n`
        content += `## Summary\n\n`
        content += `| Metric | Value |\n|---|---|\n`
        content += `| Total | ${metrics.total} |\n`
        content += `| Passed | ${metrics.passed} |\n`
        content += `| Failed | ${metrics.failed} |\n`
        content += `| Skipped | ${metrics.skipped} |\n`
        content += `| Success Rate | ${metrics.successRate}% |\n`
        content += `| Avg Duration | ${metrics.avgDurationMs}ms |\n\n`
        content += `## Test Results\n\n`
        for (const t of testResults) {
          const icon = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'skipped' ? '⏭️' : '⬜'
          content += `### ${icon} ${t.name} (${t.nameVi})\n\n`
          content += `- **Category**: ${t.category}\n`
          content += `- **Status**: ${t.status.toUpperCase()}\n`
          if (t.durationMs) content += `- **Duration**: ${t.durationMs}ms\n`
          if (t.error) content += `- **Error**: ${t.error}\n`
          content += `\n`
        }
      } else if (format === 'html') {
        mime = 'text/html'
        filename = `test-report-${date}.html`
        const rows = testResults.map((t) => {
          const color = t.status === 'passed' ? '#22c55e' : t.status === 'failed' ? '#ef4444' : '#6b7280'
          return `<tr>
            <td>${t.name}</td>
            <td>${t.nameVi}</td>
            <td>${t.category}</td>
            <td style="color:${color};font-weight:bold">${t.status.toUpperCase()}</td>
            <td>${t.durationMs ? t.durationMs + 'ms' : '—'}</td>
            <td style="color:#ef4444">${t.error ?? ''}</td>
          </tr>`
        }).join('')
        content = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Test Report ${date}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}
h1{color:#fff}table{width:100%;border-collapse:collapse;margin-top:1rem}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #334155}
th{background:#1e293b;font-weight:600}.summary{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.card{background:#1e293b;border-radius:8px;padding:1rem;min-width:120px}
.card .num{font-size:2rem;font-weight:700}.card .label{color:#94a3b8;font-size:.8rem}</style>
</head>
<body>
<h1>🧪 Test Report — ${date}</h1>
<div class="summary">
  <div class="card"><div class="num">${metrics.total}</div><div class="label">Total</div></div>
  <div class="card"><div class="num" style="color:#22c55e">${metrics.passed}</div><div class="label">Passed</div></div>
  <div class="card"><div class="num" style="color:#ef4444">${metrics.failed}</div><div class="label">Failed</div></div>
  <div class="card"><div class="num" style="color:#6b7280">${metrics.skipped}</div><div class="label">Skipped</div></div>
  <div class="card"><div class="num" style="color:#3b82f6">${metrics.successRate}%</div><div class="label">Success Rate</div></div>
</div>
<table>
<thead><tr><th>Test Name</th><th>Vietnamese</th><th>Category</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`
      }

      const blob = new Blob([content], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    [runs, computeMetrics]
  )

  return {
    runs,
    runningAll,
    runTest,
    runAllTests,
    resetTest,
    resetAll,
    computeMetrics,
    exportReport,
    updateStep,
  }
}
