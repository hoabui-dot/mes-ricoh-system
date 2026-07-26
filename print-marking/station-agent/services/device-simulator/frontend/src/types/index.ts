export interface PrinterState {
  online: boolean
  jobCount: number
  lastZplPreview: string | null
  lastResult: string | null
  lastJobAt: string | null
  port: number
}

export interface LaserState {
  online: boolean
  commandCount: number
  lastCommand: string | null
  lastResult: string | null
  lastCommandAt: string | null
  port: number
}

export interface VisionState {
  online: boolean
  requestCount: number
  passRate: number
  failureRate: number
  lastResult: string | null
  lastRequestAt: string | null
}

export interface PlcState {
  online: boolean
  registers: Record<string, boolean>
  eventCount: number
  lastEventAt: string | null
  port: number
}

export interface GatewayState {
  connected: boolean
  brokerHost: string | null
  brokerPort: number
  publishCount: number
  receiveCount: number
  lastEventAt: string | null
  lastTopic: string | null
}

export interface SimulatorStatus {
  printer: PrinterState
  laser: LaserState
  vision: VisionState
  plc: PlcState
  gateway: GatewayState
}

export interface PrinterJob {
  id: string
  status: string
  zplPreview: string | null
  durationMs: number
  receivedAt: string
}

export interface LaserCommand {
  id: string
  rawCommand: string
  status: string
  durationMs: number
  executedAt: string
}

export interface VisionResult {
  id: string
  jobId: string
  result: string
  defectCode: string | null
  confidence: number | null
  ocrText: string | null
  durationMs: number
  verifiedAt: string
}

export interface PlcRegister {
  name: string
  value: boolean
  source: string
  occurredAt: string
}

export interface GatewayEvent {
  id: string
  direction: string
  topic: string
  payloadJson: string
  occurredAt: string
}

export interface TimelineEvent {
  id: string
  stage: string
  status: string
  detail: string
  occurredAt: string
}

export interface ConnectionStatus {
  connectionName: string
  status: string
  detail: string | null
  checkedAt: string
}

export interface ConfigValue {
  id: string
  key: string
  value: string
  description: string | null
  isEditable: boolean
}
