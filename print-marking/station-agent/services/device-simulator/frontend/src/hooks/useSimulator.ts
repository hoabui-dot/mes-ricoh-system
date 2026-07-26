import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import type {
  SimulatorStatus, TimelineEvent, GatewayEvent,
  PrinterJob, LaserCommand, VisionResult, PlcRegister, ConnectionStatus
} from '../types'

export function useSimulator() {
  const [status, setStatus] = useState<SimulatorStatus | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [connected, setConnected] = useState(false)
  const hubRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setStatus)
    fetch('/api/timeline?limit=50').then(r => r.json()).then((data: TimelineEvent[]) =>
      setTimeline(data))
  }, [])

  useEffect(() => {
    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/simulator')
      .withAutomaticReconnect()
      .build()

    hub.on('SimulatorStatusUpdated', (s: SimulatorStatus) => setStatus(s))

    hub.on('TimelineEventAdded', (evt: TimelineEvent) =>
      setTimeline(prev => [evt, ...prev].slice(0, 200)))

    hub.onclose(() => setConnected(false))
    hub.onreconnected(() => setConnected(true))

    hub.start().then(() => setConnected(true)).catch(console.error)
    hubRef.current = hub
    return () => { hub.stop() }
  }, [])

  return { status, timeline, connected }
}

export function usePrinterJobs() {
  return []
}

export function useLaserCommands() {
  const [cmds, setCmds] = useState<LaserCommand[]>([])
  const hubRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    fetch('/api/laser/commands').then(r => r.json()).then(setCmds)

    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/simulator').withAutomaticReconnect().build()
    hub.on('LaserCommandExecuted', (cmd: LaserCommand) =>
      setCmds(prev => [cmd, ...prev].slice(0, 100)))
    hub.start().catch(console.error)
    hubRef.current = hub
    return () => { hub.stop() }
  }, [])

  return cmds
}

export function useVisionResults() {
  const [results, setResults] = useState<VisionResult[]>([])
  const hubRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    fetch('/api/vision/results').then(r => r.json()).then(setResults)

    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/simulator').withAutomaticReconnect().build()
    hub.on('VisionVerified', (r: VisionResult) =>
      setResults(prev => [r, ...prev].slice(0, 100)))
    hub.start().catch(console.error)
    hubRef.current = hub
    return () => { hub.stop() }
  }, [])

  return results
}

export function usePlcState() {
  const [events, setEvents] = useState<PlcRegister[]>([])
  const hubRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    fetch('/api/plc/events').then(r => r.json()).then(setEvents)

    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/simulator').withAutomaticReconnect().build()
    hub.on('PlcRegisterChanged', (r: PlcRegister) =>
      setEvents(prev => [r, ...prev].slice(0, 200)))
    hub.start().catch(console.error)
    hubRef.current = hub
    return () => { hub.stop() }
  }, [])

  return events
}

export function useGatewayEvents() {
  const [events, setEvents] = useState<GatewayEvent[]>([])
  const hubRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    fetch('/api/gateway/events').then(r => r.json()).then(setEvents)

    const hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/simulator').withAutomaticReconnect().build()
    hub.on('GatewayEventOccurred', (e: GatewayEvent) =>
      setEvents(prev => [e, ...prev].slice(0, 100)))
    hub.start().catch(console.error)
    hubRef.current = hub
    return () => { hub.stop() }
  }, [])

  return events
}

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  useEffect(() => {
    fetch('/api/connections').then(r => r.json()).then(setConnections)
    const interval = setInterval(() =>
      fetch('/api/connections').then(r => r.json()).then(setConnections), 15000)
    return () => clearInterval(interval)
  }, [])
  return connections
}
