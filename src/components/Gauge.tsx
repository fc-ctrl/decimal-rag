interface GaugeProps {
  value: number
  min: number
  max: number
  idealMin: number
  idealMax: number
  label: string
  unit: string
  size?: number
}

export default function Gauge({ value, min, max, idealMin, idealMax, label, unit, size = 140 }: GaugeProps) {
  const range = max - min
  const pct = Math.max(0, Math.min(1, (value - min) / range))
  const angle = -120 + pct * 240 // from -120° to +120°
  const r = size / 2 - 10
  const cx = size / 2
  const cy = size / 2 + 5

  // Arc path helper
  const arc = (startDeg: number, endDeg: number) => {
    const s = (startDeg - 90) * Math.PI / 180
    const e = (endDeg - 90) * Math.PI / 180
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  // Zone angles
  const idealStartPct = (idealMin - min) / range
  const idealEndPct = (idealMax - min) / range
  const idealStartAngle = -120 + idealStartPct * 240
  const idealEndAngle = -120 + idealEndPct * 240

  // Needle endpoint
  const needleAngle = (angle - 90) * Math.PI / 180
  const needleLen = r - 12
  const nx = cx + needleLen * Math.cos(needleAngle)
  const ny = cy + needleLen * Math.sin(needleAngle)

  // Color based on value
  const isOk = value >= idealMin && value <= idealMax
  const isWarn = !isOk && value >= idealMin * 0.7 && value <= idealMax * 1.3
  const color = isOk ? '#22c55e' : isWarn ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.75}`}>
        {/* Background arc */}
        <path d={arc(-120, 120)} fill="none" stroke="#e5e7eb" strokeWidth={8} strokeLinecap="round" />
        {/* Red zone left */}
        <path d={arc(-120, idealStartAngle)} fill="none" stroke="#fecaca" strokeWidth={8} strokeLinecap="round" />
        {/* Green zone */}
        <path d={arc(idealStartAngle, idealEndAngle)} fill="none" stroke="#bbf7d0" strokeWidth={8} strokeLinecap="round" />
        {/* Red zone right */}
        <path d={arc(idealEndAngle, 120)} fill="none" stroke="#fecaca" strokeWidth={8} strokeLinecap="round" />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill={color} />
        {/* Value */}
        <text x={cx} y={cy + 20} textAnchor="middle" className="text-sm font-bold" fill={color}>{value} {unit}</text>
        {/* Min/Max labels */}
        <text x={12} y={cy + 10} textAnchor="start" className="text-[8px]" fill="#9ca3af">{min}</text>
        <text x={size - 12} y={cy + 10} textAnchor="end" className="text-[8px]" fill="#9ca3af">{max}</text>
      </svg>
      <div className="text-xs font-medium text-gray-600 -mt-1">{label}</div>
    </div>
  )
}
