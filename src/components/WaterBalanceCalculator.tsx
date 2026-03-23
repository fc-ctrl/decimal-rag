import { useState, useCallback, useEffect } from 'react'
import { Droplets, Thermometer, AlertTriangle, CheckCircle, FileText, MessageSquare, Lightbulb, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ExportReport from './ExportReport'

interface ProductData { id: string; name: string; description: string | null; category: string; linked_param: string | null; unit: string; price: number | null; active: boolean }
interface TipData { id: string; title: string; content: string; linked_param: string | null; linked_situation: string | null; active: boolean }
interface SituationData { id: string; slug: string; label: string; description: string | null; guide_url: string | null; product_ids: string[]; active: boolean }

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

const DEFAULT_PARAMS: WaterParams = {
  temperature: 26, ph: 7.2, tac: 100, th: 200, chlore: 1.0, stabilisant: 30, sel: 3.0, selElectrolyseur: 3.0, volume: 50,
}

// Langelier Saturation Index
function calculateLSI(p: WaterParams): number {
  const A = 0.1
  const B = -13.12 * Math.log10(p.temperature + 273) + 34.55
  const C = Math.log10(Math.max(p.th, 1)) - 0.4
  const D = Math.log10(Math.max(p.tac, 1))
  const pHs = (9.3 + A + B) - (C + D)
  return Math.round((p.ph - pHs) * 100) / 100
}

// Format g or kg
function fmt(grams: number): string {
  if (grams < 1000) return `${Math.round(grams)} g`
  return `${(grams / 1000).toFixed(2)} kg`
}
function fmtDose(grams: number): string {
  const dose = grams / 3
  if (dose < 1000) return `${Math.round(dose)} g`
  return `${(dose / 1000).toFixed(3)} kg`
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
  const [showDimensions, setShowDimensions] = useState(false)
  const [dims, setDims] = useState({ l: 8, w: 4, d: 1.5 })
  const [history, setHistory] = useState<{ date: string; params: WaterParams; lsi: number }[]>([])
  const [showExport, setShowExport] = useState(false)
  const [situation, setSituation] = useState('analyse_courante')
  const [allProducts, setAllProducts] = useState<ProductData[]>([])
  const [allTips, setAllTips] = useState<TipData[]>([])
  const [allSituations, setAllSituations] = useState<SituationData[]>([])

  useEffect(() => {
    supabase.from('rag_products').select('*').eq('active', true).order('sort_order').then(r => setAllProducts(r.data || []))
    supabase.from('rag_tips').select('*').eq('active', true).order('sort_order').then(r => setAllTips(r.data || []))
    supabase.from('rag_water_situations').select('*').eq('active', true).order('sort_order').then(r => setAllSituations(r.data || []))
  }, [])

  // Get recommended products based on analysis + situation
  const getRecommendedProducts = useCallback(() => {
    const recommended: { product: ProductData; reason: string }[] = []
    const sit = allSituations.find(s => s.slug === situation)
    // Products from situation
    if (sit?.product_ids.length) {
      sit.product_ids.forEach(pid => {
        const p = allProducts.find(pr => pr.id === pid)
        if (p) recommended.push({ product: p, reason: sit.label })
      })
    }
    // Products from analysis
    if (params.tac < 80) { const p = allProducts.find(pr => pr.linked_param === 'tac_plus'); if (p && !recommended.find(r => r.product.id === p.id)) recommended.push({ product: p, reason: 'TAC bas' }) }
    if (params.ph < 7.0) { const p = allProducts.find(pr => pr.linked_param === 'ph_plus'); if (p && !recommended.find(r => r.product.id === p.id)) recommended.push({ product: p, reason: 'pH bas' }) }
    if (params.ph > 7.4) { const p = allProducts.find(pr => pr.linked_param === 'ph_moins'); if (p && !recommended.find(r => r.product.id === p.id)) recommended.push({ product: p, reason: 'pH haut' }) }
    if (params.chlore < 1.0) { const p = allProducts.find(pr => pr.linked_param === 'chlore'); if (p && !recommended.find(r => r.product.id === p.id)) recommended.push({ product: p, reason: 'Chlore bas' }) }
    if (params.chlore > 3.0) { const p = allProducts.find(pr => pr.category === 'complement' && pr.name.toLowerCase().includes('séquestrant')); if (p && !recommended.find(r => r.product.id === p.id)) recommended.push({ product: p, reason: 'Surchloration' }) }
    if (showSel && params.sel < params.selElectrolyseur) { const p = allProducts.find(pr => pr.linked_param === 'sel'); if (p && !recommended.find(r => r.product.id === p.id)) recommended.push({ product: p, reason: 'Sel bas' }) }
    return recommended
  }, [params, situation, allProducts, allSituations, showSel])

  // Get relevant tips
  const getRelevantTips = useCallback(() => {
    return allTips.filter(t => {
      if (t.linked_situation && t.linked_situation !== situation) return false
      if (t.linked_param) {
        if (t.linked_param === 'tac' && params.tac >= 80 && params.tac <= 200) return false
        if (t.linked_param === 'ph' && params.ph >= 7.0 && params.ph <= 7.4) return false
        if (t.linked_param === 'chlore' && params.chlore >= 1.0 && params.chlore <= 1.5) return false
        if (t.linked_param === 'stabilisant' && params.stabilisant >= 20 && params.stabilisant <= 75) return false
      }
      return true
    }).slice(0, 3)
  }, [allTips, params, situation])

  const lsi = calculateLSI(params)
  const lsiLabel = lsi < -0.3 ? 'Eau corrosive — risque de dégradation des équipements' : lsi > 0.3 ? 'Eau entartrante — risque de dépôts calcaires' : 'Eau équilibrée'

  const update = useCallback((key: keyof WaterParams, value: number) => {
    setParams(p => ({ ...p, [key]: value }))
  }, [])

  const calcVolume = () => {
    const v = Math.round(dims.l * dims.w * dims.d)
    update('volume', v)
    setShowDimensions(false)
  }

  // Chloration choc
  const chocChloryte = Math.round(params.volume * 15)
  const chocGranule = Math.round(params.volume * 20)
  const chocPastilles = Math.round(params.volume)

  const saveToHistory = useCallback(() => {
    setHistory(h => [{ date: new Date().toISOString(), params: { ...params }, lsi }, ...h].slice(0, 20))
  }, [params, lsi])


  const chatMsg = `Analyse eau : pH=${params.ph}, TAC=${params.tac}, TH=${params.th}, chlore=${params.chlore}, stabilisant=${params.stabilisant}${showSel ? `, sel=${params.sel}` : ''}, temp=${params.temperature}°C, vol=${params.volume}m³. LSI=${lsi}. Conseils ?`

  // Editable value component
  function Val({ value, onChange, unit, color }: { value: number; onChange: (v: number) => void; unit: string; color: string }) {
    const [editing, setEditing] = useState(false)
    const [editVal, setEditVal] = useState('')
    if (editing) {
      return <input autoFocus type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
        onBlur={() => { const v = parseFloat(editVal); if (!isNaN(v)) onChange(v); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={`w-20 text-right text-sm font-bold border border-blue-400 rounded px-1 py-0.5 outline-none ${color}`} />
    }
    return <button onClick={() => { setEditVal(String(value)); setEditing(true) }} className={`text-sm font-bold ${color} hover:underline cursor-text`}>{value} {unit}</button>
  }

  // Recommendation renderer
  function Reco({ status, children }: { status: 'ok' | 'warning' | 'danger'; children: React.ReactNode }) {
    const cls = status === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
    const Icon = status === 'ok' ? CheckCircle : AlertTriangle
    return <div className={`rounded-lg border px-3 py-2 mt-2 text-xs ${cls}`}><div className="flex gap-1.5 items-start"><Icon size={14} className="shrink-0 mt-0.5" /><div>{children}</div></div></div>
  }

  function valColor(ok: boolean, warn: boolean) {
    return ok ? 'text-green-600' : warn ? 'text-amber-600' : 'text-red-600'
  }

  // ---- TAC recommendation ----
  function TacReco() {
    const { tac, volume } = params
    if (tac < 80) {
      const amount = (100 - tac) * 1.5 * volume
      return <Reco status="danger">
        <p>Le <b>TAC (alcalinité)</b> doit être <b>supérieur à 100 mg/l</b>, le TAC de votre bassin est donc trop bas.</p>
        <p className="mt-1">Pour l'augmenter, ajoutez <b>{fmt(amount)}</b> de TAC+ ou Alcaplus.</p>
        <p><b>Répartissez</b> en <b>3 doses de {fmtDose(amount)}</b> toutes les <b>4 heures minimum</b>.</p>
      </Reco>
    }
    if (tac > 200) return <Reco status="warning"><p>Le TAC est trop élevé. Ajustez le pH ou diluez avec de l'eau.</p></Reco>
    return <Reco status="ok"><p>Le TAC est dans la plage optimale.</p></Reco>
  }

  // ---- pH recommendation (depends on TAC) ----
  function PhReco() {
    const { ph, tac, volume } = params
    if (ph < 7.0) {
      const amount = (7.0 - ph) * 150 * volume
      if (tac < 80) {
        return <Reco status="danger">
          <p>Le pH de votre bassin doit être <b>compris entre 7.0 et 7.4</b>.</p>
          <p className="mt-1"><b>Votre pH est trop bas</b>, cependant il est important de corriger d'abord le <b>niveau de TAC</b> qui n'est <b>pas optimal</b>.</p>
          <p>Nous vous recommandons <b>d'ajuster le TAC avant de modifier le pH</b>.</p>
          <p className="mt-1">Si vous choisissez de ne pas suivre cette préconisation, ajoutez progressivement <b>{fmt(amount)} de TAC+, Alcaplus ou pH+</b>. Divisez en <b>3 doses de {fmtDose(amount)}</b> toutes les <b>4 heures minimum</b>.</p>
          <p>Contrôlez l'évolution du pH avant chaque ajout.</p>
        </Reco>
      }
      return <Reco status="danger">
        <p>Le pH de votre bassin doit être <b>compris entre 7.0 et 7.4</b>. <b>Votre pH est trop bas.</b></p>
        <p className="mt-1">Ajoutez progressivement <b>{fmt(amount)} de TAC+, Alcaplus ou pH+</b>. Divisez en <b>3 doses de {fmtDose(amount)}</b> toutes les <b>4 heures minimum</b>.</p>
        <p>Contrôlez l'évolution du pH avant chaque ajout.</p>
      </Reco>
    }
    if (ph > 7.4) {
      const amount = (ph - 7.2) * 150 * volume
      return <Reco status="warning">
        <p>Le pH de votre bassin est <b>trop élevé</b>.</p>
        <p className="mt-1">Ajoutez progressivement <b>{fmt(amount)} de pH- en poudre</b> dilué dans de l'eau tiède.</p>
        <p>Répartissez en <b>3 doses de {fmtDose(amount)}</b> toutes les <b>4 heures minimum</b>.</p>
        <p>Remesurez le pH avant chaque nouvel apport.</p>
      </Reco>
    }
    return <Reco status="ok"><p>Le pH est dans la plage optimale.</p></Reco>
  }

  // ---- Chlore recommendation ----
  function ChloreReco() {
    const { chlore, volume } = params
    if (chlore < 1.0) {
      const amount = (1.0 - chlore) * 1.5 * volume
      return <Reco status="danger"><p>Le niveau de chlore est trop bas. Ajoutez <b>{fmt(amount)} de chlore granulé</b> pour atteindre 1.0 mg/l, ou augmentez la production de votre électrolyseur.</p></Reco>
    }
    if (chlore > 3.0) {
      const sur = (chlore - 1.0).toFixed(1)
      return <Reco status="danger"><p><span className="text-red-600 font-bold">ATTENTION</span> : surchloration forte de {sur} mg/l avec risque important de <b>dégradation</b>.</p><p className="mt-1">Il est <b>fortement conseillé de passer en magasin</b> pour acquérir un séquestrant de chlore. Retirez votre galet ou arrêtez la production de l'électrolyseur et ouvrez votre bassin.</p></Reco>
    }
    if (chlore > 1.5) {
      const sur = (chlore - 1.0).toFixed(1)
      return <Reco status="warning"><p><span className="text-amber-600 font-bold">ATTENTION</span> : surchloration modérée de {sur} mg/l. Réduisez l'apport de chlore et/ou diminuez la production de votre électrolyseur, et éventuellement ouvrez votre bassin.</p></Reco>
    }
    return <Reco status="ok"><p>Le niveau de chlore est dans la plage optimale.</p></Reco>
  }

  // ---- TH recommendation ----
  function ThReco() {
    if (params.th < 150) return <Reco status="warning"><p>Eau douce — agressive pour les équipements et le liner. Ajoutez <b>{fmt((200 - params.th) * params.volume)} de chlorure de calcium</b>.</p></Reco>
    if (params.th > 300) return <Reco status="warning"><p>Eau dure — risque de dépôts calcaires sur les parois et équipements.</p></Reco>
    return <Reco status="ok"><p>Le TH est dans la plage optimale (150-300 mg/l).</p></Reco>
  }

  // ---- Stabilisant recommendation ----
  function StabilisantReco() {
    if (params.stabilisant < 20) return <Reco status="warning"><p>Stabilisant bas — le chlore se dégrade rapidement au soleil. Ajoutez <b>{fmt((30 - params.stabilisant) * params.volume)} d'acide cyanurique</b>.</p></Reco>
    if (params.stabilisant > 75) return <Reco status="danger"><p>Sur-stabilisation — le chlore devient inefficace même à forte dose. <b>Seule solution : vidange partielle (30%) et remplissage en eau neuve.</b></p></Reco>
    return <Reco status="ok"><p>Le stabilisant est dans la plage optimale (20-75 mg/l).</p></Reco>
  }

  // ---- Sel recommendation (with electrolyzer target) ----
  function SelReco() {
    const { sel, selElectrolyseur, volume } = params
    if (sel < selElectrolyseur) {
      const amount = (selElectrolyseur - sel) * volume
      return <Reco status="warning"><p>Le niveau de sel est trop bas. Ajoutez <b>{fmt(amount * 1000)} de sel</b> pour atteindre {selElectrolyseur} g/l nécessaire au fonctionnement de votre électrolyseur.</p></Reco>
    }
    if (sel > selElectrolyseur + 2) return <Reco status="warning"><p>Le niveau de sel est trop élevé. Diluez avec de l'eau fraîche.</p></Reco>
    return <Reco status="ok"><p>Le niveau de sel est dans la plage optimale.</p></Reco>
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center"><Droplets size={22} className="text-white" /></div>
        <div>
          <h1 className="text-lg font-semibold">Calculatrice équilibre eau</h1>
          <p className="text-xs text-gray-400">Analysez et corrigez les paramètres de votre piscine</p>
        </div>
      </div>

      {/* Situation */}
      {allSituations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <label className="text-xs text-gray-500 mb-2 block">Quel est votre besoin ?</label>
          <div className="flex gap-2 flex-wrap">
            {allSituations.map(s => (
              <button key={s.slug} onClick={() => setSituation(s.slug)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${situation === s.slug ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {(() => { const sit = allSituations.find(s => s.slug === situation); return sit?.description ? <p className="text-xs text-gray-400 mt-2">{sit.description}</p> : null })()}
        </div>
      )}

      {/* Volume */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 flex items-center gap-1"><Droplets size={12} /> Volume du bassin</label>
          <Val value={params.volume} onChange={v => update('volume', v)} unit="m³" color="text-blue-600" />
        </div>
        <input type="range" min={1} max={500} step={1} value={params.volume} onChange={e => update('volume', +e.target.value)} className="w-full" style={{ accentColor: '#3b82f6' }} />
        <div className="flex justify-between text-[10px] text-gray-400"><span>1 m³</span><span>500 m³</span></div>
        <button onClick={() => setShowDimensions(!showDimensions)} className="text-[10px] text-blue-500 hover:underline mt-1">
          {showDimensions ? 'Masquer' : 'Si vous ne connaissez pas le volume, cliquez ici'}
        </button>
        {showDimensions && (
          <div className="mt-2 flex gap-2 items-end">
            <div><label className="text-[10px] text-gray-400">Long. (m)</label><input type="number" value={dims.l} onChange={e => setDims({ ...dims, l: +e.target.value })} className="w-16 px-1 py-0.5 border rounded text-xs" /></div>
            <div><label className="text-[10px] text-gray-400">Larg. (m)</label><input type="number" value={dims.w} onChange={e => setDims({ ...dims, w: +e.target.value })} className="w-16 px-1 py-0.5 border rounded text-xs" /></div>
            <div><label className="text-[10px] text-gray-400">Prof. (m)</label><input type="number" value={dims.d} step={0.1} onChange={e => setDims({ ...dims, d: +e.target.value })} className="w-16 px-1 py-0.5 border rounded text-xs" /></div>
            <button onClick={calcVolume} className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Calculer</button>
          </div>
        )}
      </div>

      {/* Chloration choc */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Chloration choc</h2>
        <p className="text-xs text-gray-500 mb-3">Doses nécessaires pour votre bassin de {params.volume} m³ :</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-blue-600">{fmt(chocChloryte)}</div><div className="text-[10px] text-gray-500">Hypochloryte de calcium</div></div>
          <div className="bg-blue-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-blue-600">{fmt(chocGranule)}</div><div className="text-[10px] text-gray-500">Chlore choc granulé stabilisé</div></div>
          <div className="bg-blue-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-blue-600">{chocPastilles} pastilles</div><div className="text-[10px] text-gray-500">Chlore choc pastilles 20g</div></div>
        </div>
      </div>

      {/* Temperature */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 flex items-center gap-1"><Thermometer size={12} /> Température</label>
          <Val value={params.temperature} onChange={v => update('temperature', v)} unit="°C" color="text-orange-600" />
        </div>
        <input type="range" min={5} max={35} step={1} value={params.temperature} onChange={e => update('temperature', +e.target.value)} className="w-full" style={{ accentColor: '#f97316' }} />
        <div className="flex justify-between text-[10px] text-gray-400"><span>5°C</span><span>35°C</span></div>
      </div>

      {/* Main parameters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* TAC */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">TAC (alcalinité)</label>
            <Val value={params.tac} onChange={v => update('tac', v)} unit="mg/l" color={valColor(params.tac >= 80 && params.tac <= 200, params.tac >= 50 && params.tac <= 250)} />
          </div>
          <input type="range" min={0} max={300} step={1} value={params.tac} onChange={e => update('tac', +e.target.value)} className="w-full" style={{ accentColor: params.tac >= 80 && params.tac <= 200 ? '#22c55e' : '#ef4444' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>0</span><span className="text-green-600 font-medium">80-200</span><span>300</span></div>
          <TacReco />
        </div>

        {/* pH */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">pH</label>
            <Val value={params.ph} onChange={v => update('ph', v)} unit="" color={valColor(params.ph >= 7.0 && params.ph <= 7.4, params.ph >= 6.8 && params.ph <= 7.6)} />
          </div>
          <input type="range" min={6.0} max={8.5} step={0.1} value={params.ph} onChange={e => update('ph', +e.target.value)} className="w-full" style={{ accentColor: params.ph >= 7.0 && params.ph <= 7.4 ? '#22c55e' : '#ef4444' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>6.0</span><span className="text-green-600 font-medium">7.0-7.4</span><span>8.5</span></div>
          <PhReco />
        </div>

        {/* TH */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">TH (dureté calcique)</label>
            <Val value={params.th} onChange={v => update('th', v)} unit="mg/l" color={valColor(params.th >= 150 && params.th <= 300, params.th >= 100 && params.th <= 400)} />
          </div>
          <input type="range" min={0} max={500} step={1} value={params.th} onChange={e => update('th', +e.target.value)} className="w-full" style={{ accentColor: params.th >= 150 && params.th <= 300 ? '#22c55e' : '#f59e0b' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>0</span><span className="text-green-600 font-medium">150-300</span><span>500</span></div>
          <ThReco />
        </div>

        {/* Chlore */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Chlore libre</label>
            <Val value={params.chlore} onChange={v => update('chlore', v)} unit="mg/l" color={valColor(params.chlore >= 1.0 && params.chlore <= 1.5, params.chlore >= 0.5 && params.chlore <= 3.0)} />
          </div>
          <input type="range" min={0} max={5} step={0.1} value={params.chlore} onChange={e => update('chlore', +e.target.value)} className="w-full" style={{ accentColor: params.chlore >= 1.0 && params.chlore <= 1.5 ? '#22c55e' : params.chlore > 3 ? '#ef4444' : '#f59e0b' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>0</span><span className="text-green-600 font-medium">1.0-1.5</span><span>5</span></div>
          <ChloreReco />
        </div>

        {/* Stabilisant */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Stabilisant (acide cyanurique)</label>
            <Val value={params.stabilisant} onChange={v => update('stabilisant', v)} unit="mg/l" color={valColor(params.stabilisant >= 20 && params.stabilisant <= 75, params.stabilisant >= 10 && params.stabilisant <= 100)} />
          </div>
          <input type="range" min={0} max={150} step={1} value={params.stabilisant} onChange={e => update('stabilisant', +e.target.value)} className="w-full" style={{ accentColor: params.stabilisant >= 20 && params.stabilisant <= 75 ? '#22c55e' : params.stabilisant > 75 ? '#ef4444' : '#f59e0b' }} />
          <div className="flex justify-between text-[10px] text-gray-400"><span>0</span><span className="text-green-600 font-medium">20-75</span><span>150</span></div>
          <StabilisantReco />
        </div>

        {/* Sel / Electrolyseur */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={showSel} onChange={e => setShowSel(e.target.checked)} className="accent-blue-500 w-4 h-4" />
            <span className="text-xs text-gray-500 font-medium">J'ai un électrolyseur au sel</span>
          </label>
          {showSel ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500">Sel mesuré</label>
                  <Val value={params.sel} onChange={v => update('sel', v)} unit="g/l" color={valColor(params.sel >= params.selElectrolyseur && params.sel <= params.selElectrolyseur + 2, true)} />
                </div>
                <input type="range" min={0} max={10} step={0.1} value={params.sel} onChange={e => update('sel', +e.target.value)} className="w-full" style={{ accentColor: params.sel >= params.selElectrolyseur ? '#22c55e' : '#f59e0b' }} />
                <div className="flex justify-between text-[10px] text-gray-400"><span>0</span><span>10 g/l</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500">Sel requis par l'électrolyseur</label>
                  <Val value={params.selElectrolyseur} onChange={v => update('selElectrolyseur', v)} unit="g/l" color="text-gray-600" />
                </div>
                <input type="range" min={2} max={5} step={0.1} value={params.selElectrolyseur} onChange={e => update('selElectrolyseur', +e.target.value)} className="w-full" style={{ accentColor: '#6b7280' }} />
                <div className="flex justify-between text-[10px] text-gray-400"><span>2 g/l</span><span>5 g/l</span></div>
              </div>
              <SelReco />
            </div>
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
          <div className="absolute top-0 w-1.5 h-full bg-white border-2 border-gray-800 rounded-full shadow-lg transition-all duration-300"
            style={{ left: `${Math.max(2, Math.min(98, 50 + lsi * 40))}%`, transform: 'translateX(-50%)' }} />
        </div>
        <div className="text-center">
          <span className="text-3xl font-bold" style={{ color: lsiColor(lsi) }}>{lsi > 0 ? '+' : ''}{lsi}</span>
          <p className={`text-sm mt-1 font-medium ${lsi >= -0.3 && lsi <= 0.3 ? 'text-green-600' : 'text-red-600'}`}>{lsiLabel}</p>
        </div>
      </div>

      {/* Recommended Products */}
      {(() => {
        const recs = getRecommendedProducts()
        if (recs.length === 0) return null
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShoppingBag size={16} className="text-blue-500" /> Produits recommandés</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recs.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500 text-xs font-bold">{i + 1}</div>
                  <div className="flex-1">
                    <div className="text-xs font-medium">{r.product.name}</div>
                    <div className="text-[10px] text-gray-400">{r.reason}{r.product.price ? ` — ${r.product.price}€/${r.product.unit}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Tips */}
      {(() => {
        const tips = getRelevantTips()
        if (tips.length === 0) return null
        return (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 mb-4">
            {tips.map((t, i) => (
              <div key={i} className={`flex gap-2 ${i > 0 ? 'mt-3 pt-3 border-t border-amber-200' : ''}`}>
                <Lightbulb size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-700">{t.title}</div>
                  <div className="text-xs text-amber-600 mt-0.5">{t.content}</div>
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Guide link for situation */}
      {(() => {
        const sit = allSituations.find(s => s.slug === situation)
        if (!sit?.guide_url) return null
        return (
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 mb-4 text-center">
            <a href={sit.guide_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline font-medium">
              📖 Consulter le guide Cosy Piscine : {sit.label}
            </a>
          </div>
        )
      })()}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={() => setShowExport(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50"><FileText size={16} /> Rapport PDF</button>
        {showHistory && <button onClick={saveToHistory} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50"><CheckCircle size={16} /> Sauvegarder</button>}
        {onOpenChat && <button onClick={() => onOpenChat(chatMsg)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600"><MessageSquare size={16} /> Demander conseil</button>}
      </div>

      {/* Export modal */}
      {showExport && <ExportReport params={params} lsi={lsi} lsiLabel={lsiLabel} showSel={showSel} onClose={() => setShowExport(false)} />}

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold mb-3">Historique</h2>
          {history.map((h, i) => (
            <div key={i} className="flex items-center justify-between text-xs border-b border-gray-100 pb-2 mb-2 last:border-0">
              <span className="text-gray-400">{new Date(h.date).toLocaleDateString('fr-FR')} {new Date(h.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <div className="flex gap-3"><span>pH {h.params.ph}</span><span>TAC {h.params.tac}</span><span className="font-bold" style={{ color: lsiColor(h.lsi) }}>LSI {h.lsi > 0 ? '+' : ''}{h.lsi}</span></div>
              <button onClick={() => setParams(h.params)} className="text-blue-500 hover:underline">Recharger</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
