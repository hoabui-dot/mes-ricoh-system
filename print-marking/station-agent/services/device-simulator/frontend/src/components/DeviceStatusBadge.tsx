interface Props { online: boolean; label?: string }

export default function DeviceStatusBadge({ online, label }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
      ${online ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-red-400'}`} />
      {label ?? (online ? 'ONLINE' : 'OFFLINE')}
    </span>
  )
}
