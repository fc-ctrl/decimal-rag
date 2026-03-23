import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, TrendingUp, Calendar, Droplets } from 'lucide-react'
import WaterBalanceCalculator from '@/components/WaterBalanceCalculator'

interface WaterAnalysis {
  id: string
  temperature: number
  ph: number
  tac: number
  th: number
  chlore: number
  stabilisant: number
  sel: number
  sel_electrolyseur: number
  volume: number
  lsi: number
  situation: string | null
  notes: string | null
  created_at: string
}

interface PoolSettings {
  volume: number
  has_electrolyser: boolean
  sel_electrolyseur: number
}

interface Props {
  contactId: string
  onOpenChat?: (message: string) => void
  onBack: () => void
}

// Mini sparkline chart
function Sparkline({ data, color, label, unit }: { data: number[]; color: string; label: string; unit: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data) * 0.95
  const max = Math.max(...data) * 1.05
  const range = max - min || 1
  const w = 200, h = 50
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  const last = data[data.length - 1]
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{last} {unit}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8">
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {data.map((v, i) => (
          <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - ((v - min) / range) * h} r={2.5} fill={color} />
        ))}
      </svg>
    </div>
  )
}

export default function ClientCalculator({ contactId, onOpenChat, onBack }: Props) {
  const [poolSettings, setPoolSettings] = useState<PoolSettings | null>(null)
  const [analyses, setAnalyses] = useState<WaterAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAnalysis, setSelectedAnalysis] = useState<WaterAnalysis | null>(null)

  useEffect(() => {
    loadData()
  }, [contactId])

  async function loadData() {
    // Load pool settings
    const { data: settings } = await supabase
      .from('client_pool_settings')
      .select('volume, has_electrolyser, sel_electrolyseur')
      .eq('client_id', contactId)
      .single()
    if (settings) setPoolSettings(settings)

    // Load last 10 analyses
    const { data: ana } = await supabase
      .from('water_analyses')
      .select('*')
      .eq('client_id', contactId)
      .order('created_at', { ascending: false })
      .limit(10)
    setAnalyses(ana || [])
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" /></div>

  // Chart data (reversed for chronological order)
  const chartData = [...analyses].reverse()
  const phData = chartData.map(a => a.ph)
  const tacData = chartData.map(a => a.tac)
  const chloreData = chartData.map(a => a.chlore)
  const lsiData = chartData.map(a => a.lsi)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-sky-200 hover:text-white"><ArrowLeft size={20} /></button>
        <Droplets size={20} />
        <div>
          <div className="text-sm font-medium">Analyse eau</div>
          <div className="text-xs text-sky-200">Calculatrice & historique mesures</div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Calculator */}
        <WaterBalanceCalculator
          onOpenChat={onOpenChat}
          defaultVolume={poolSettings?.volume}
          defaultElectrolyser={poolSettings?.has_electrolyser}
          defaultSelElectrolyseur={poolSettings?.sel_electrolyseur}
        />

        {/* Evolution graphs */}
        {analyses.length >= 2 && (
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><TrendingUp size={16} className="text-sky-500" /> Évolution des paramètres</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Sparkline data={phData} color="#8b5cf6" label="pH" unit="" />
              <Sparkline data={tacData} color="#3b82f6" label="TAC" unit="mg/l" />
              <Sparkline data={chloreData} color="#f59e0b" label="Chlore" unit="mg/l" />
              <Sparkline data={lsiData} color="#22c55e" label="LSI" unit="" />
            </div>
          </div>
        )}

        {/* Analyses history */}
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Calendar size={16} className="text-sky-500" /> Mesures en magasin ({analyses.length})</h2>
          {analyses.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-xs text-gray-400">
              Aucune mesure en magasin pour le moment. Passez en magasin Cosy Piscine pour une analyse d'eau gratuite.
            </div>
          ) : (
            <div className="space-y-2">
              {analyses.map(a => {
                const lsiColor = a.lsi < -1.0 || a.lsi > 0.4 ? '#ef4444' : a.lsi < -0.3 ? '#f59e0b' : '#22c55e'
                const isSelected = selectedAnalysis?.id === a.id
                return (
                  <div key={a.id}
                    onClick={() => setSelectedAnalysis(isSelected ? null : a)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${isSelected ? 'border-sky-400 shadow-md' : 'border-gray-200 hover:border-sky-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('fr-FR')}</span>
                        <div className="flex gap-3 text-xs">
                          <span>pH <b>{a.ph}</b></span>
                          <span>TAC <b>{a.tac}</b></span>
                          <span>Cl <b>{a.chlore}</b></span>
                          <span>TH <b>{a.th}</b></span>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: lsiColor, background: lsiColor + '15' }}>
                        LSI {a.lsi > 0 ? '+' : ''}{a.lsi}
                      </span>
                    </div>
                    {a.situation && a.situation !== 'analyse_courante' && (
                      <span className="inline-block mt-1 text-[9px] px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full">{a.situation}</span>
                    )}
                    {a.notes && <p className="text-[10px] text-gray-400 mt-1">{a.notes}</p>}
                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="grid grid-cols-4 gap-2 text-[10px]">
                          <div className="bg-gray-50 rounded p-2"><span className="text-gray-400">Temp.</span><div className="font-bold">{a.temperature}°C</div></div>
                          <div className="bg-gray-50 rounded p-2"><span className="text-gray-400">Stabilisant</span><div className="font-bold">{a.stabilisant} mg/l</div></div>
                          <div className="bg-gray-50 rounded p-2"><span className="text-gray-400">Sel</span><div className="font-bold">{a.sel} g/l</div></div>
                          <div className="bg-gray-50 rounded p-2"><span className="text-gray-400">Volume</span><div className="font-bold">{a.volume} m³</div></div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
