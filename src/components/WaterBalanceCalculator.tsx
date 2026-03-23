import { useState, useCallback } from 'react'
import { Droplets, Thermometer, AlertTriangle, CheckCircle, Download, MessageSquare } from 'lucide-react'

interface WaterParams {
  temperature: number
  ph: number
  tac: number
  th: number
  chlore: number
  stabilisant: number
  sel: number
  volume: number
}

interface Recommendation {
  status: 'ok' | 'warning' | 'danger'
  message: string
  dosage?: string
}

const DEFAULT_PARAMS: WaterParams = {
  temperature: 26, ph: 7.2, tac: 100, th: 200, chlore: 1.0, stabilisant: 30, sel: 4.0, volume: 50,
}

function calculateLSI(p: WaterParams): number {
  const A = 0.1
  const B = -13.12 * Math.log10(p.temperature + 273) + 34.55
  const C = Math.log10(Math.max(p.th, 1)) - 0.4
  const D = Math.log10(Math.max(p.tac, 1))
  const pHs = (9.3 + A + B) - (C + D)
  return Math.round((p.ph - pHs) * 100) / 100
}

function getRecommendation(param: string, p: WaterParams): Recommendation {
  switch (param) {
    case 'ph':
      if (p.ph < 7.0) return { status: 'danger', message: 'Le pH de votre bassin doit être compris entre 7.0 et 7.4. Corrigez d\'abord le TAC si celui-ci n\'est pas optimal.', dosage: `Ajouter ${Math.round((7.0 - p.ph) * 150 * p.volume)} g de pH+ en poudre, répartir en 3 doses toutes les 4h` }
      if (p.ph > 7.4) return { status: 'warning', message: 'Le pH est trop haut, la désinfection perd en efficacité. Corrigez d\'abord le TAC si celui-ci n\'est pas optimal.', dosage: `Ajouter ${Math.round((p.ph - 7.2) * 150 * p.volume)} g de pH- en poudre, répartir en 3 doses toutes les 4h` }
      return { status: 'ok', message: 'Le pH est dans la plage optimale (7.0 - 7.4)' }
    case 'tac':
      if (p.tac < 80) return { status: 'danger', message: 'Le TAC (alcalinité) doit être supérieur à 100 mg/l pour stabiliser le pH.', dosage: `Ajouter ${Math.round((100 - p.tac) * 1.5 * p.volume)} g de TAC+ ou Alcaplus, répartir en 3 doses toutes les 4h` }
      if (p.tac > 200) return { status: 'warning', message: 'Le TAC est trop élevé. Ajustez le pH ou envisagez une dilution partielle.' }
      return { status: 'ok', message: 'Le TAC est dans la plage optimale (80 - 200 mg/l)' }
    case 'th':
      if (p.th < 150) return { status: 'warning', message: 'Eau douce — agressive pour les équipements et le liner.', dosage: `Ajouter ${Math.round((200 - p.th) * p.volume / 1000)} kg de chlorure de calcium` }
      if (p.th > 300) return { status: 'warning', message: 'Eau dure — risque de dépôts calcaires sur les parois et équipements.' }
      return { status: 'ok', message: 'Le TH est dans la plage optimale (150 - 300 mg/l)' }
    case 'chlore':
      if (p.chlore < 1.0) return { status: 'danger', message: 'Le niveau de chlore est insuffisant pour assurer la désinfection.', dosage: `Ajouter ${Math.round((1.0 - p.chlore) * 1.5 * p.volume)} g de chlore granulé. Pour un électrolyseur, augmenter le % de production.` }
      if (p.chlore > 1.5 && p.chlore <= 3.0) return { status: 'warning', message: 'ATTENTION — surchloration modérée. Réduisez l\'apport en chlore ou baissez le % de production de l\'électrolyseur.' }
      if (p.chlore > 3.0) return { status: 'danger', message: 'ATTENTION — surchloration forte ! Nous vous conseillons de passer en magasin pour un diagnostic.' }
      return { status: 'ok', message: 'Le niveau de chlore est dans la plage optimale (1.0 - 1.5 mg/l)' }
    case 'stabilisant':
      if (p.stabilisant < 20) return { status: 'warning', message: 'Stabilisant bas — le chlore se dégrade rapidement au soleil.', dosage: `Ajouter ${Math.round((30 - p.stabilisant) * p.volume / 1000)} kg d'acide cyanurique` }
      if (p.stabilisant > 75) return { status: 'danger', message: 'Sur-stabilisation — le chlore devient inefficace même à forte dose. Seule solution : vidange partielle.', dosage: 'Vidange partielle (30%) et remplissage en eau neuve' }
      return { status: 'ok', message: 'Le stabilisant est dans la plage optimale (20 - 75 mg/l)' }
    case 'sel':
      if (p.sel < 3.0) return { status: 'warning', message: 'Le taux de sel est insuffisant pour votre électrolyseur.', dosage: `Ajouter ${Math.round((4.0 - p.sel) * p.volume)} kg de sel spécial piscine` }
      if (p.sel > 6.0) return { status: 'warning', message: 'Le taux de sel est trop élevé. Diluez avec de l\'eau fraîche.' }
      return { status: 'ok', message: 'Le niveau de sel est dans la plage optimale' }
    default: return { status: 'ok', message: '' }
  }
}

function RecoBox({ r }: { r: Recommendation }) {
  const colors = r.status === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : r.status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
  const Icon = r.status === 'ok' ? CheckCircle : AlertTriangle
  return (
    <div className={`rounded-lg border px-3 py-2 mt-2 ${colors}`}>
      <div className="flex items-center gap-1.5 text-xs">
        <Icon size={13} />
        <span>{r.message}</span>
      </div>
      {r.dosage && <p className="text-xs mt-1 ml-5 font-medium">→ {r.dosage}</p>}
    </div>
  )
}

function lsiColor(lsi: number): string {
  if (lsi < -0.3 || lsi > 0.3) return '#ef4444'
  if (lsi < -0.1 || lsi > 0.1) return '#f59e0b'
  return '#22c55e'
}

interface Props {
  showHistory?: boolean
  onOpenChat?: (message: string) => void
}

export default function WaterBalanceCalculator({ showHistory = false, onOpenChat }: Props) {
  const [params, setParams] = useState<WaterParams>(DEFAULT_PARAMS)
  const [showSel, setShowSel] = useState(false)
  const [history, setHistory] = useState<{ date: string; params: WaterParams; lsi: number }[]>([])

  const lsi = calculateLSI(params)
  const lsiStatus = lsi < -0.3 ? 'Eau corrosive — risque de dégradation des équipements' : lsi > 0.3 ? 'Eau entartrante — risque de dépôts calcaires' : 'Eau équilibrée'

  const update = useCallback((key: keyof WaterParams, value: number) => {
    setParams(p => ({ ...p, [key]: value }))
  }, [])

  const saveToHistory = useCallback(() => {
    setHistory(h => [{ date: new Date().toISOString(), params: { ...params }, lsi }, ...h].slice(0, 20))
  }, [params, lsi])

  const exportAnalysis = useCallback(() => {
    const recs = ['ph', 'tac', 'th', 'chlore', 'stabilisant', ...(showSel ? ['sel'] : [])].map(k => getRecommendation(k, params))
    const text = [
      '═══════════════════════════════════════════',
      '  ANALYSE ÉQUILIBRE EAU — COSY PISCINE',
      '═══════════════════════════════════════════',
      `  Date : ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}`,
      `  Volume : ${params.volume} m³`,
      '',
      `  Température : ${params.temperature}°C`,
      `  pH : ${params.ph}`,
      `  TAC : ${params.tac} mg/l`,
      `  TH : ${params.th} mg/l`,
      `  Chlore : ${params.chlore} mg/l`,
      `  Stabilisant : ${params.stabilisant} mg/l`,
      showSel ? `  Sel : ${params.sel} g/l` : '',
      '',
      `  INDICE DE LANGELIER : ${lsi > 0 ? '+' : ''}${lsi}`,
      `  ${lsiStatus}`,
      '',
      '  RECOMMANDATIONS',
      '  ───────────────',
      ...recs.map(r => `  ${r.status === 'ok' ? '✓' : '⚠'} ${r.message}${r.dosage ? '\n    → ' + r.dosage : ''}`),
      '',
      '  © Cosy Piscine — service.cosy-piscine.com',
    ].filter(Boolean).join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `analyse-eau-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
  }, [params, lsi, lsiStatus, showSel])

  const chatMsg = `Analyse eau : pH=${params.ph}, TAC=${params.tac}, TH=${params.th}, chlore=${params.chlore}, stabilisant=${params.stabilisant}${showSel ? `, sel=${params.sel}` : ''}, temp=${params.temperature}°C, vol=${params.volume}m³. LSI=${lsi}. Conseils ?`

  function Slider({ label, icon, value, min, max, step, unit, idealMin, idealMax, paramKey }: {
    label: string; icon?: React.ReactNode; value: number; min: number; max: number; step: number; unit: string; idealMin: number; idealMax: number; paramKey: keyof WaterParams
  }) {
    const [editing, setEditing] = useState(false)
    const [editVal, setEditVal] = useState('')
    const isOk = value >= idealMin && value <= idealMax
    const isWarn = !isOk && value >= idealMin * 0.7 && value <= idealMax * 1.3
    const valueColor = isOk ? 'text-green-600' : isWarn ? 'text-amber-600' : 'text-red-600'
    const rec = getRecommendation(paramKey as string, params)
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 flex items-center gap-1">{icon}{label}</label>
          {editing ? (
            <input autoFocus type="number" value={editVal} min={min} max={max} step={step}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => { const v = parseFloat(editVal); if (!isNaN(v)) update(paramKey, Math.min(max, Math.max(min, v))); setEditing(false) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className={`w-20 text-right text-sm font-semibold border border-blue-400 rounded px-1 py-0.5 outline-none ${valueColor}`}
            />
          ) : (
            <button onClick={() => { setEditVal(String(value)); setEditing(true) }} className={`text-sm font-semibold ${valueColor} hover:underline cursor-text`} title="Cliquer pour saisir une valeur">
              {value} {unit}
            </button>
          )}
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => update(paramKey, +e.target.value)} className="w-full" style={{ accentColor: isOk ? '#22c55e' : isWarn ? '#f59e0b' : '#ef4444' }} />
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>{min} {unit}</span>
          <span className="text-green-600 font-medium">{idealMin}-{idealMax}</span>
          <span>{max} {unit}</span>
        </div>
        <RecoBox r={rec} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
          <Droplets size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Calculatrice équilibre eau</h1>
          <p className="text-xs text-gray-400">Analysez et corrigez les paramètres de votre piscine</p>
        </div>
      </div>

      {/* Volume + Temperature row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500 flex items-center gap-1"><Droplets size={12} /> Volume</label>
            <span className="text-sm font-semibold text-blue-600">{params.volume} m³</span>
          </div>
          <input type="range" min={10} max={150} step={5} value={params.volume} onChange={e => update('volume', +e.target.value)} className="w-full" style={{ accentColor: '#3b82f6' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>10 m³</span><span>150 m³</span></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500 flex items-center gap-1"><Thermometer size={12} /> Température</label>
            <span className="text-sm font-semibold text-orange-600">{params.temperature}°C</span>
          </div>
          <input type="range" min={5} max={35} step={1} value={params.temperature} onChange={e => update('temperature', +e.target.value)} className="w-full" style={{ accentColor: '#f97316' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>5°C</span><span>35°C</span></div>
        </div>
      </div>

      {/* Main parameters grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Slider label="pH" value={params.ph} min={6.0} max={8.5} step={0.05} unit="" idealMin={7.0} idealMax={7.4} paramKey="ph" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Slider label="TAC (alcalinité)" value={params.tac} min={0} max={300} step={5} unit="mg/l" idealMin={80} idealMax={200} paramKey="tac" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Slider label="TH (dureté calcique)" value={params.th} min={0} max={500} step={5} unit="mg/l" idealMin={150} idealMax={300} paramKey="th" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Slider label="Chlore libre" value={params.chlore} min={0} max={5} step={0.1} unit="mg/l" idealMin={1.0} idealMax={1.5} paramKey="chlore" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <Slider label="Stabilisant (acide cyanurique)" value={params.stabilisant} min={0} max={150} step={5} unit="mg/l" idealMin={20} idealMax={75} paramKey="stabilisant" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={showSel} onChange={e => setShowSel(e.target.checked)} className="accent-blue-500 w-4 h-4" />
            <span className="text-xs text-gray-500">J'ai un électrolyseur au sel</span>
          </label>
          {showSel ? (
            <Slider label="Sel" value={params.sel} min={0} max={8} step={0.5} unit="g/l" idealMin={3.0} idealMax={5.0} paramKey="sel" />
          ) : (
            <div className="text-center text-xs text-gray-300 py-4">Cochez si vous avez un électrolyseur</div>
          )}
        </div>
      </div>

      {/* LSI Conclusion */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-semibold mb-4 text-center">Conclusion — Indice de Langelier (LSI)</h2>
        <div className="relative h-10 bg-gradient-to-r from-red-400 via-amber-300 via-green-400 via-amber-300 to-red-400 rounded-full overflow-hidden mb-3">
          <div className="absolute inset-0 flex items-center justify-around">
            <span className="text-[10px] text-white font-medium drop-shadow">Corrosive</span>
            <span className="text-[10px] text-white font-medium drop-shadow">Équilibrée</span>
            <span className="text-[10px] text-white font-medium drop-shadow">Entartrante</span>
          </div>
          <div
            className="absolute top-0 w-1.5 h-full bg-white border-2 border-gray-800 rounded-full shadow-lg transition-all duration-300"
            style={{ left: `${Math.max(2, Math.min(98, 50 + lsi * 40))}%`, transform: 'translateX(-50%)' }}
          />
        </div>
        <div className="text-center">
          <span className="text-3xl font-bold" style={{ color: lsiColor(lsi) }}>
            {lsi > 0 ? '+' : ''}{lsi}
          </span>
          <p className={`text-sm mt-1 font-medium ${lsi >= -0.3 && lsi <= 0.3 ? 'text-green-600' : 'text-red-600'}`}>
            {lsiStatus}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={exportAnalysis} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">
          <Download size={16} /> Exporter l'analyse
        </button>
        {showHistory && (
          <button onClick={saveToHistory} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            <CheckCircle size={16} /> Sauvegarder
          </button>
        )}
        {onOpenChat && (
          <button onClick={() => onOpenChat(chatMsg)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600 transition-colors">
            <MessageSquare size={16} /> Demander conseil
          </button>
        )}
      </div>

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold mb-3">Historique</h2>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-gray-100 pb-2 last:border-0">
                <span className="text-gray-400">{new Date(h.date).toLocaleDateString('fr-FR')} {new Date(h.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="flex items-center gap-3">
                  <span>pH {h.params.ph}</span>
                  <span>TAC {h.params.tac}</span>
                  <span>Cl {h.params.chlore}</span>
                  <span className="font-semibold" style={{ color: lsiColor(h.lsi) }}>LSI {h.lsi > 0 ? '+' : ''}{h.lsi}</span>
                </div>
                <button onClick={() => setParams(h.params)} className="text-blue-500 hover:underline">Recharger</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
