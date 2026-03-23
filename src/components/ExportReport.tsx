import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import Gauge from './Gauge'

interface WaterParams {
  temperature: number
  ph: number
  tac: number
  th: number
  chlore: number
  stabilisant: number
  sel: number
  selElectrolyseur: number
  volume: number
}

interface Props {
  params: WaterParams
  lsi: number
  lsiLabel: string
  showSel: boolean
  onClose: () => void
}

const PARAMS_CONFIG = [
  { key: 'ph', label: 'pH', min: 6, max: 8.5, idealMin: 7.0, idealMax: 7.4, unit: '' },
  { key: 'tac', label: 'TAC (alcalinité)', min: 0, max: 300, idealMin: 80, idealMax: 200, unit: 'mg/l' },
  { key: 'th', label: 'TH (dureté)', min: 0, max: 500, idealMin: 150, idealMax: 300, unit: 'mg/l' },
  { key: 'chlore', label: 'Chlore', min: 0, max: 5, idealMin: 1.0, idealMax: 1.5, unit: 'mg/l' },
  { key: 'stabilisant', label: 'Stabilisant', min: 0, max: 150, idealMin: 20, idealMax: 75, unit: 'mg/l' },
  { key: 'sel', label: 'Sel', min: 0, max: 10, idealMin: 3.0, idealMax: 5.0, unit: 'g/l' },
  { key: 'temperature', label: 'Température', min: 5, max: 35, idealMin: 20, idealMax: 30, unit: '°C' },
] as const

function lsiColor(lsi: number): string {
  if (lsi < -0.3 || lsi > 0.3) return '#ef4444'
  if (lsi < -0.1 || lsi > 0.1) return '#f59e0b'
  return '#22c55e'
}

export default function ExportReport({ params, lsi, lsiLabel, showSel, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['ph', 'tac', 'th', 'chlore', 'stabilisant', ...(showSel ? ['sel'] : [])]))

  const toggle = (key: string) => {
    const s = new Set(selected)
    if (s.has(key)) s.delete(key); else s.add(key)
    setSelected(s)
  }

  const printReport = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const gaugesHtml = PARAMS_CONFIG
      .filter(p => selected.has(p.key))
      .filter(p => p.key !== 'sel' || showSel)
      .map(p => {
        const value = params[p.key as keyof WaterParams] as number
        const pct = Math.max(0, Math.min(1, (value - p.min) / (p.max - p.min)))
        const angle = -120 + pct * 240
        const isOk = value >= p.idealMin && value <= p.idealMax
        const isWarn = !isOk && value >= p.idealMin * 0.7 && value <= p.idealMax * 1.3
        const color = isOk ? '#22c55e' : isWarn ? '#f59e0b' : '#ef4444'
        const status = isOk ? '✓ OK' : isWarn ? '⚠ Attention' : '✗ À corriger'

        const r = 55, cx = 70, cy = 70
        const idealStartPct = (p.idealMin - p.min) / (p.max - p.min)
        const idealEndPct = (p.idealMax - p.min) / (p.max - p.min)
        const arc = (s: number, e: number) => {
          const sr = ((-120 + s * 240) - 90) * Math.PI / 180
          const er = ((-120 + e * 240) - 90) * Math.PI / 180
          return `M ${cx + r * Math.cos(sr)} ${cy + r * Math.sin(sr)} A ${r} ${r} 0 ${e - s > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(er)} ${cy + r * Math.sin(er)}`
        }
        const needleAngle = (angle - 90) * Math.PI / 180
        const nx = cx + (r - 10) * Math.cos(needleAngle)
        const ny = cy + (r - 10) * Math.sin(needleAngle)

        return `<div style="text-align:center;page-break-inside:avoid">
          <svg width="140" height="105" viewBox="0 0 140 105">
            <path d="${arc(0, idealStartPct)}" fill="none" stroke="#fecaca" stroke-width="8" stroke-linecap="round"/>
            <path d="${arc(idealStartPct, idealEndPct)}" fill="none" stroke="#bbf7d0" stroke-width="8" stroke-linecap="round"/>
            <path d="${arc(idealEndPct, 1)}" fill="none" stroke="#fecaca" stroke-width="8" stroke-linecap="round"/>
            <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>
            <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}">${value} ${p.unit}</text>
            <text x="10" y="${cy + 10}" font-size="8" fill="#999">${p.min}</text>
            <text x="130" y="${cy + 10}" text-anchor="end" font-size="8" fill="#999">${p.max}</text>
          </svg>
          <div style="font-size:12px;font-weight:600;color:#374151">${p.label}</div>
          <div style="font-size:10px;color:${color};margin-top:2px">${status} (idéal: ${p.idealMin}-${p.idealMax})</div>
        </div>`
      }).join('')

    const lsiPct = Math.max(2, Math.min(98, 50 + lsi * 40))

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Analyse Eau — Cosy Piscine</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 30px; color: #1e293b; }
        .header { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; }
        .logo { width: 40px; height: 40px; background: #3b82f6; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; font-weight: bold; }
        .meta { display: flex; gap: 30px; margin-bottom: 20px; font-size: 12px; color: #64748b; }
        .gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 25px; }
        .lsi-bar { height: 30px; border-radius: 15px; background: linear-gradient(to right, #ef4444, #f59e0b, #22c55e, #f59e0b, #ef4444); position: relative; margin: 10px 0; }
        .lsi-needle { position: absolute; top: 0; width: 4px; height: 100%; background: white; border: 2px solid #1e293b; border-radius: 3px; }
        .lsi-labels { display: flex; justify-content: space-around; font-size: 9px; color: white; position: absolute; inset: 0; align-items: center; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        @media print { body { padding: 15px; } }
      </style>
    </head><body>
      <div class="header">
        <div class="logo">C</div>
        <div><div style="font-size:16px;font-weight:700">Analyse Équilibre Eau</div><div style="font-size:11px;color:#64748b">Cosy Piscine — Assistance Piscine</div></div>
      </div>
      <div class="meta">
        <span>Date : ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}</span>
        <span>Volume : ${params.volume} m³</span>
        <span>Température : ${params.temperature}°C</span>
      </div>
      <div class="gauges">${gaugesHtml}</div>
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;text-align:center;margin-bottom:10px">Indice de Langelier (LSI)</div>
        <div class="lsi-bar">
          <div class="lsi-labels"><span>Corrosive</span><span>Équilibrée</span><span>Entartrante</span></div>
          <div class="lsi-needle" style="left:${lsiPct}%;transform:translateX(-50%)"></div>
        </div>
        <div style="text-align:center;margin-top:10px">
          <span style="font-size:24px;font-weight:bold;color:${lsiColor(lsi)}">${lsi > 0 ? '+' : ''}${lsi}</span>
          <div style="font-size:12px;color:${lsi >= -0.3 && lsi <= 0.3 ? '#22c55e' : '#ef4444'};margin-top:4px">${lsiLabel}</div>
        </div>
      </div>
      <div class="footer">© ${new Date().getFullYear()} Cosy Piscine — service.cosy-piscine.com</div>
    </body></html>`)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Exporter le rapport</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={16} /></button>
        </div>

        <p className="text-xs text-gray-500 mb-3">Sélectionnez les paramètres à inclure dans le rapport :</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {PARAMS_CONFIG.filter(p => p.key !== 'sel' || showSel).map(p => (
            <label key={p.key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selected.has(p.key) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} className="accent-blue-500" />
              <span className="text-xs">{p.label}</span>
              <span className="text-xs text-gray-400 ml-auto">{params[p.key as keyof WaterParams]} {p.unit}</span>
            </label>
          ))}
        </div>

        {/* Preview gauges */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <p className="text-[10px] text-gray-400 mb-2 text-center">Aperçu</p>
          <div className="flex flex-wrap justify-center gap-2">
            {PARAMS_CONFIG.filter(p => selected.has(p.key)).filter(p => p.key !== 'sel' || showSel).map(p => (
              <Gauge key={p.key} value={params[p.key as keyof WaterParams] as number} min={p.min} max={p.max} idealMin={p.idealMin} idealMax={p.idealMax} label={p.label} unit={p.unit} size={100} />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={printReport} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600">
            <Printer size={16} /> Imprimer / PDF
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Annuler</button>
        </div>
      </div>
    </div>
  )
}
