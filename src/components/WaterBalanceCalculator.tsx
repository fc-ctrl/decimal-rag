import { useState, useCallback } from 'react'
import { Droplets, Thermometer, FlaskConical, AlertTriangle, CheckCircle, Download, MessageSquare } from 'lucide-react'

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

interface AnalysisResult {
  lsi: number
  lsiStatus: 'corrosive' | 'equilibre' | 'entartrant'
  lsiLabel: string
  recommendations: Recommendation[]
}

interface Recommendation {
  param: string
  status: 'ok' | 'warning' | 'danger'
  message: string
  dosage?: string
}

const DEFAULT_PARAMS: WaterParams = {
  temperature: 26,
  ph: 7.2,
  tac: 100,
  th: 200,
  chlore: 1.0,
  stabilisant: 30,
  sel: 4.0,
  volume: 50,
}

// Langelier Saturation Index calculation
function calculateLSI(params: WaterParams): number {
  const { temperature, ph, tac, th } = params
  // pHs = (9.3 + A + B) - (C + D)
  // A = (log10(TDS) - 1) / 10 ≈ 0.1 for pools
  // B = -13.12 * log10(temp°C + 273) + 34.55
  // C = log10(Ca hardness as CaCO3) - 0.4
  // D = log10(alkalinity as CaCO3)
  const A = 0.1 // approximate for pool water TDS
  const B = -13.12 * Math.log10(temperature + 273) + 34.55
  const C = Math.log10(Math.max(th, 1)) - 0.4
  const D = Math.log10(Math.max(tac, 1))
  const pHs = (9.3 + A + B) - (C + D)
  return Math.round((ph - pHs) * 100) / 100
}

function analyzeWater(params: WaterParams): AnalysisResult {
  const lsi = calculateLSI(params)
  let lsiStatus: AnalysisResult['lsiStatus'] = 'equilibre'
  let lsiLabel = 'Eau équilibrée'
  if (lsi < -0.3) { lsiStatus = 'corrosive'; lsiLabel = 'Eau corrosive — risque de dégradation des équipements' }
  else if (lsi > 0.3) { lsiStatus = 'entartrant'; lsiLabel = 'Eau entartrante — risque de dépôts calcaires' }

  const recommendations: Recommendation[] = []

  // pH
  if (params.ph < 7.0) recommendations.push({ param: 'pH', status: 'danger', message: 'pH trop bas — eau agressive', dosage: `Ajouter ${Math.round((7.2 - params.ph) * 10 * params.volume)} g de pH+ (carbonate de soude)` })
  else if (params.ph > 7.6) recommendations.push({ param: 'pH', status: 'danger', message: 'pH trop haut — désinfection inefficace', dosage: `Ajouter ${Math.round((params.ph - 7.2) * 15 * params.volume)} g de pH- (bisulfate de sodium)` })
  else if (params.ph < 7.2 || params.ph > 7.4) recommendations.push({ param: 'pH', status: 'warning', message: `pH à ${params.ph} — idéal entre 7.2 et 7.4` })
  else recommendations.push({ param: 'pH', status: 'ok', message: `pH à ${params.ph} — parfait` })

  // TAC
  if (params.tac < 80) recommendations.push({ param: 'TAC', status: 'danger', message: 'TAC trop bas — eau instable', dosage: `Ajouter ${Math.round((100 - params.tac) * 1.5 * params.volume / 1000)} kg de bicarbonate de soude` })
  else if (params.tac > 150) recommendations.push({ param: 'TAC', status: 'warning', message: 'TAC élevé — risque de tartre', dosage: 'Abaisser le pH à 7.0 pendant 48h puis remonter progressivement' })
  else recommendations.push({ param: 'TAC', status: 'ok', message: `TAC à ${params.tac} mg/l — correct` })

  // TH
  if (params.th < 150) recommendations.push({ param: 'TH', status: 'warning', message: 'TH bas — eau douce, agressive pour les équipements', dosage: `Ajouter ${Math.round((200 - params.th) * params.volume / 1000)} kg de chlorure de calcium` })
  else if (params.th > 300) recommendations.push({ param: 'TH', status: 'warning', message: 'TH élevé — eau dure, risque de tartre' })
  else recommendations.push({ param: 'TH', status: 'ok', message: `TH à ${params.th} mg/l — correct` })

  // Chlore
  if (params.chlore < 0.5) recommendations.push({ param: 'Chlore', status: 'danger', message: 'Chlore insuffisant — désinfection non assurée', dosage: 'Effectuer une chloration choc puis ajuster la production' })
  else if (params.chlore > 2.0) recommendations.push({ param: 'Chlore', status: 'warning', message: 'Chlore élevé — irritant pour la peau et les yeux', dosage: 'Réduire la production ou laisser le chlore se dissiper naturellement' })
  else recommendations.push({ param: 'Chlore', status: 'ok', message: `Chlore à ${params.chlore} mg/l — correct` })

  // Stabilisant
  if (params.stabilisant < 20) recommendations.push({ param: 'Stabilisant', status: 'warning', message: 'Stabilisant bas — le chlore se dégrade vite au soleil', dosage: `Ajouter ${Math.round((30 - params.stabilisant) * params.volume / 1000)} kg d'acide cyanurique` })
  else if (params.stabilisant > 75) recommendations.push({ param: 'Stabilisant', status: 'danger', message: 'Sur-stabilisation — le chlore devient inefficace', dosage: 'Vidange partielle (30%) et remplissage eau neuve' })
  else recommendations.push({ param: 'Stabilisant', status: 'ok', message: `Stabilisant à ${params.stabilisant} mg/l — correct` })

  // Sel
  if (params.sel < 3.0) recommendations.push({ param: 'Sel', status: 'warning', message: 'Taux de sel bas pour un électrolyseur', dosage: `Ajouter ${Math.round((4.0 - params.sel) * params.volume)} kg de sel piscine` })
  else if (params.sel > 5.0) recommendations.push({ param: 'Sel', status: 'warning', message: 'Taux de sel élevé' })
  else recommendations.push({ param: 'Sel', status: 'ok', message: `Sel à ${params.sel} g/l — correct` })

  return { lsi, lsiStatus, lsiLabel, recommendations }
}

function statusColor(status: string) {
  if (status === 'ok') return 'text-green-600 bg-green-50 border-green-200'
  if (status === 'warning') return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

function statusIcon(status: string) {
  if (status === 'ok') return <CheckCircle size={16} className="text-green-500" />
  if (status === 'warning') return <AlertTriangle size={16} className="text-amber-500" />
  return <AlertTriangle size={16} className="text-red-500" />
}

function lsiGaugeColor(lsi: number): string {
  if (lsi < -0.3) return '#ef4444'
  if (lsi > 0.3) return '#ef4444'
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

  const result = analyzeWater(params)

  const updateParam = useCallback((key: keyof WaterParams, value: number) => {
    setParams(p => ({ ...p, [key]: value }))
  }, [])

  const saveToHistory = useCallback(() => {
    setHistory(h => [{ date: new Date().toISOString(), params: { ...params }, lsi: result.lsi }, ...h].slice(0, 20))
  }, [params, result.lsi])

  const exportPDF = useCallback(() => {
    const text = [
      '═══════════════════════════════════════',
      '  ANALYSE ÉQUILIBRE EAU — COSY PISCINE',
      '═══════════════════════════════════════',
      `  Date : ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}`,
      `  Volume bassin : ${params.volume} m³`,
      '',
      '  PARAMÈTRES MESURÉS',
      '  ─────────────────',
      `  Température : ${params.temperature}°C`,
      `  pH : ${params.ph}`,
      `  TAC : ${params.tac} mg/l`,
      `  TH : ${params.th} mg/l`,
      `  Chlore : ${params.chlore} mg/l`,
      `  Stabilisant : ${params.stabilisant} mg/l`,
      showSel ? `  Sel : ${params.sel} g/l` : '',
      '',
      '  INDICE DE LANGELIER (LSI)',
      '  ─────────────────────────',
      `  LSI = ${result.lsi > 0 ? '+' : ''}${result.lsi}`,
      `  ${result.lsiLabel}`,
      '',
      '  RECOMMANDATIONS',
      '  ───────────────',
      ...result.recommendations.map(r => {
        let line = `  ${r.status === 'ok' ? '✓' : '⚠'} ${r.message}`
        if (r.dosage) line += `\n    → ${r.dosage}`
        return line
      }),
      '',
      '═══════════════════════════════════════',
      '  Cosy Piscine — service.cosy-piscine.com',
      '═══════════════════════════════════════',
    ].filter(Boolean).join('\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analyse-eau-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [params, result, showSel])

  const chatMessage = `Voici mon analyse d'eau : pH=${params.ph}, TAC=${params.tac}, TH=${params.th}, chlore=${params.chlore}, stabilisant=${params.stabilisant}${showSel ? `, sel=${params.sel}` : ''}, température=${params.temperature}°C, volume=${params.volume}m³. LSI=${result.lsi}. Que me conseillez-vous ?`

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
          <Droplets size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Calculatrice équilibre eau</h1>
          <p className="text-xs text-text-muted">Analysez et corrigez les paramètres de votre piscine</p>
        </div>
      </div>

      {/* Volume */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4">
        <label className="flex items-center gap-2 text-sm font-medium mb-3">
          <Droplets size={16} className="text-blue-500" />
          Volume du bassin : <span className="text-primary">{params.volume} m³</span>
        </label>
        <input type="range" min={10} max={150} step={5} value={params.volume} onChange={e => updateParam('volume', +e.target.value)} className="w-full accent-primary" />
        <div className="flex justify-between text-[10px] text-text-muted mt-1"><span>10 m³</span><span>150 m³</span></div>
      </div>

      {/* Parameters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4 space-y-5">
        <h2 className="text-sm font-medium flex items-center gap-2"><FlaskConical size={16} className="text-purple-500" /> Paramètres mesurés</h2>

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted flex items-center gap-1"><Thermometer size={12} /> Température</label>
            <span className="text-sm font-medium">{params.temperature}°C</span>
          </div>
          <input type="range" min={5} max={35} step={1} value={params.temperature} onChange={e => updateParam('temperature', +e.target.value)} className="w-full accent-orange-500" />
          <div className="flex justify-between text-[10px] text-text-muted"><span>5°C</span><span>35°C</span></div>
        </div>

        {/* pH */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">pH</label>
            <span className={`text-sm font-medium ${params.ph < 7.0 || params.ph > 7.6 ? 'text-red-500' : params.ph < 7.2 || params.ph > 7.4 ? 'text-amber-500' : 'text-green-500'}`}>{params.ph}</span>
          </div>
          <input type="range" min={6.0} max={8.5} step={0.1} value={params.ph} onChange={e => updateParam('ph', +e.target.value)} className="w-full accent-green-500" />
          <div className="flex justify-between text-[10px] text-text-muted"><span>6.0</span><span className="text-green-500 font-medium">7.2-7.4</span><span>8.5</span></div>
        </div>

        {/* TAC */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">TAC (alcalinité)</label>
            <span className={`text-sm font-medium ${params.tac < 80 ? 'text-red-500' : params.tac > 150 ? 'text-amber-500' : 'text-green-500'}`}>{params.tac} mg/l</span>
          </div>
          <input type="range" min={0} max={300} step={10} value={params.tac} onChange={e => updateParam('tac', +e.target.value)} className="w-full accent-blue-500" />
          <div className="flex justify-between text-[10px] text-text-muted"><span>0</span><span className="text-green-500 font-medium">80-150</span><span>300</span></div>
        </div>

        {/* TH */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">TH (dureté calcique)</label>
            <span className={`text-sm font-medium ${params.th < 150 ? 'text-amber-500' : params.th > 300 ? 'text-amber-500' : 'text-green-500'}`}>{params.th} mg/l</span>
          </div>
          <input type="range" min={0} max={500} step={10} value={params.th} onChange={e => updateParam('th', +e.target.value)} className="w-full accent-cyan-500" />
          <div className="flex justify-between text-[10px] text-text-muted"><span>0</span><span className="text-green-500 font-medium">150-300</span><span>500</span></div>
        </div>

        {/* Chlore */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">Chlore libre</label>
            <span className={`text-sm font-medium ${params.chlore < 0.5 ? 'text-red-500' : params.chlore > 2.0 ? 'text-amber-500' : 'text-green-500'}`}>{params.chlore} mg/l</span>
          </div>
          <input type="range" min={0} max={5} step={0.1} value={params.chlore} onChange={e => updateParam('chlore', +e.target.value)} className="w-full accent-yellow-500" />
          <div className="flex justify-between text-[10px] text-text-muted"><span>0</span><span className="text-green-500 font-medium">0.5-2.0</span><span>5</span></div>
        </div>

        {/* Stabilisant */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">Stabilisant (acide cyanurique)</label>
            <span className={`text-sm font-medium ${params.stabilisant < 20 ? 'text-amber-500' : params.stabilisant > 75 ? 'text-red-500' : 'text-green-500'}`}>{params.stabilisant} mg/l</span>
          </div>
          <input type="range" min={0} max={150} step={5} value={params.stabilisant} onChange={e => updateParam('stabilisant', +e.target.value)} className="w-full accent-violet-500" />
          <div className="flex justify-between text-[10px] text-text-muted"><span>0</span><span className="text-green-500 font-medium">20-75</span><span>150</span></div>
        </div>

        {/* Sel toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showSel} onChange={e => setShowSel(e.target.checked)} className="accent-primary" />
            <span className="text-xs text-text-muted">J'ai un électrolyseur au sel</span>
          </label>
          {showSel && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-muted">Sel</label>
                <span className={`text-sm font-medium ${params.sel < 3.0 ? 'text-amber-500' : params.sel > 5.0 ? 'text-amber-500' : 'text-green-500'}`}>{params.sel} g/l</span>
              </div>
              <input type="range" min={0} max={8} step={0.5} value={params.sel} onChange={e => updateParam('sel', +e.target.value)} className="w-full accent-teal-500" />
              <div className="flex justify-between text-[10px] text-text-muted"><span>0</span><span className="text-green-500 font-medium">3-5</span><span>8</span></div>
            </div>
          )}
        </div>
      </div>

      {/* LSI Gauge */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4">
        <h2 className="text-sm font-medium mb-3">Indice de Langelier (LSI)</h2>
        <div className="relative h-8 bg-gradient-to-r from-red-400 via-amber-300 via-green-400 via-amber-300 to-red-400 rounded-full overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex text-[9px] text-white font-medium gap-8">
              <span>Corrosive</span>
              <span>Équilibrée</span>
              <span>Entartrante</span>
            </div>
          </div>
          {/* Needle */}
          <div
            className="absolute top-0 w-1 h-full bg-white border border-gray-800 rounded-full shadow-lg transition-all"
            style={{ left: `${Math.max(2, Math.min(98, 50 + result.lsi * 50))}%`, transform: 'translateX(-50%)' }}
          />
        </div>
        <div className="text-center mt-2">
          <span className="text-2xl font-bold" style={{ color: lsiGaugeColor(result.lsi) }}>
            {result.lsi > 0 ? '+' : ''}{result.lsi}
          </span>
          <p className={`text-sm mt-1 ${result.lsiStatus === 'equilibre' ? 'text-green-600' : 'text-red-600'}`}>
            {result.lsiLabel}
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4">
        <h2 className="text-sm font-medium mb-3">Recommandations</h2>
        <div className="space-y-2">
          {result.recommendations.map((r, i) => (
            <div key={i} className={`rounded-lg border p-3 ${statusColor(r.status)}`}>
              <div className="flex items-center gap-2">
                {statusIcon(r.status)}
                <span className="text-sm font-medium">{r.param}</span>
              </div>
              <p className="text-xs mt-1 ml-6">{r.message}</p>
              {r.dosage && <p className="text-xs mt-1 ml-6 font-medium">→ {r.dosage}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-lg text-sm hover:bg-gray-50">
          <Download size={16} /> Exporter l'analyse
        </button>
        {showHistory && (
          <button onClick={saveToHistory} className="flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-lg text-sm hover:bg-gray-50">
            <CheckCircle size={16} /> Sauvegarder
          </button>
        )}
        {onOpenChat && (
          <button onClick={() => onOpenChat(chatMessage)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
            <MessageSquare size={16} /> Demander conseil au bot
          </button>
        )}
      </div>

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium mb-3">Historique des analyses</h2>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-border/50 pb-2 last:border-0">
                <span className="text-text-muted">{new Date(h.date).toLocaleDateString('fr-FR')} {new Date(h.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="flex items-center gap-3">
                  <span>pH {h.params.ph}</span>
                  <span>TAC {h.params.tac}</span>
                  <span>Cl {h.params.chlore}</span>
                  <span className="font-medium" style={{ color: lsiGaugeColor(h.lsi) }}>LSI {h.lsi > 0 ? '+' : ''}{h.lsi}</span>
                </div>
                <button onClick={() => setParams(h.params)} className="text-primary hover:underline">Recharger</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
