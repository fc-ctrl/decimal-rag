import { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

interface TipData { title: string; content: string }
interface SituationData { slug: string; label: string; guide_url: string | null }

interface Props {
  params: WaterParams
  lsi: number
  lsiLabel: string
  showSel: boolean
  situation: string
  onClose: () => void
}

// Ordered: TAC first, then pH (depends on TAC), etc.
const PARAMS_CONFIG = [
  { key: 'tac', label: 'TAC (alcalinité)', min: 0, max: 300, idealMin: 80, idealMax: 200, unit: 'mg/l' },
  { key: 'ph', label: 'pH', min: 6, max: 8.5, idealMin: 7.0, idealMax: 7.4, unit: '' },
  { key: 'th', label: 'TH (dureté)', min: 0, max: 500, idealMin: 150, idealMax: 300, unit: 'mg/l' },
  { key: 'chlore', label: 'Chlore', min: 0, max: 5, idealMin: 1.0, idealMax: 1.5, unit: 'mg/l' },
  { key: 'stabilisant', label: 'Stabilisant', min: 0, max: 150, idealMin: 20, idealMax: 75, unit: 'mg/l' },
  { key: 'sel', label: 'Sel', min: 0, max: 10, idealMin: 3.0, idealMax: 5.0, unit: 'g/l' },
] as const

function fmt(g: number) { return g < 1000 ? `${Math.round(g)} g` : `${(g / 1000).toFixed(2)} kg` }
function fmtDose(g: number) { const d = g / 3; return d < 1000 ? `${Math.round(d)} g` : `${(d / 1000).toFixed(3)} kg` }

function getAdvice(key: string, p: WaterParams): { status: string; text: string; color: string } {
  switch (key) {
    case 'tac':
      if (p.tac < 80) { const a = (100 - p.tac) * 1.5 * p.volume; return { status: 'À corriger', color: '#ef4444', text: `TAC trop bas. Ajouter ${fmt(a)} de TAC+ en 3 doses de ${fmtDose(a)} toutes les 4h.` } }
      if (p.tac > 200) return { status: 'Attention', color: '#f59e0b', text: 'TAC trop élevé. Ajustez le pH ou diluez.' }
      return { status: 'OK', color: '#22c55e', text: 'TAC dans la plage optimale.' }
    case 'ph':
      if (p.ph < 7.0) {
        const a = (7.0 - p.ph) * 150 * p.volume
        if (p.tac < 80) return { status: 'À corriger', color: '#ef4444', text: `pH trop bas. Corrigez d'abord le TAC. Sinon: ${fmt(a)} de pH+ en 3 doses de ${fmtDose(a)} toutes les 4h.` }
        return { status: 'À corriger', color: '#ef4444', text: `pH trop bas. Ajouter ${fmt(a)} de pH+ en 3 doses de ${fmtDose(a)} toutes les 4h.` }
      }
      if (p.ph > 7.4) { const a = (p.ph - 7.2) * 150 * p.volume; return { status: 'Attention', color: '#f59e0b', text: `pH trop haut. Ajouter ${fmt(a)} de pH- en 3 doses de ${fmtDose(a)} toutes les 4h.` } }
      return { status: 'OK', color: '#22c55e', text: 'pH dans la plage optimale.' }
    case 'th':
      if (p.th < 150) return { status: 'Attention', color: '#f59e0b', text: `Eau douce, agressive. Ajouter ${fmt((200 - p.th) * p.volume)} de chlorure de calcium.` }
      if (p.th > 300) return { status: 'Attention', color: '#f59e0b', text: 'Eau dure, risque de tartre.' }
      return { status: 'OK', color: '#22c55e', text: 'TH dans la plage optimale.' }
    case 'chlore':
      if (p.chlore < 1.0) return { status: 'À corriger', color: '#ef4444', text: `Chlore insuffisant. Ajouter ${fmt((1.0 - p.chlore) * 1.5 * p.volume)} de chlore granulé ou augmenter l'électrolyseur.` }
      if (p.chlore > 3.0) return { status: 'URGENT', color: '#ef4444', text: `Surchloration forte. Passer en magasin pour séquestrant.` }
      if (p.chlore > 1.5) return { status: 'Attention', color: '#f59e0b', text: 'Surchloration modérée. Réduire la production.' }
      return { status: 'OK', color: '#22c55e', text: 'Chlore dans la plage optimale.' }
    case 'stabilisant':
      if (p.stabilisant < 20) return { status: 'Attention', color: '#f59e0b', text: `Stabilisant bas. Ajouter ${fmt((30 - p.stabilisant) * p.volume)} d'acide cyanurique.` }
      if (p.stabilisant > 75) return { status: 'URGENT', color: '#ef4444', text: 'Sur-stabilisation. Vidange partielle (30%) nécessaire.' }
      return { status: 'OK', color: '#22c55e', text: 'Stabilisant dans la plage optimale.' }
    case 'sel':
      if (p.sel < p.selElectrolyseur) return { status: 'Attention', color: '#f59e0b', text: `Sel insuffisant. Ajouter ${fmt((p.selElectrolyseur - p.sel) * p.volume * 1000)} de sel piscine.` }
      if (p.sel > p.selElectrolyseur + 2) return { status: 'Attention', color: '#f59e0b', text: 'Sel trop élevé. Diluer.' }
      return { status: 'OK', color: '#22c55e', text: 'Sel dans la plage optimale.' }
    default: return { status: 'OK', color: '#22c55e', text: '' }
  }
}

function lsiColor(lsi: number) { return lsi < -1.0 || lsi > 0.4 ? '#ef4444' : lsi < -0.3 ? '#f59e0b' : '#22c55e' }

export default function ExportReport({ params, lsi, lsiLabel, showSel, situation, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['tac', 'ph', 'th', 'chlore', 'stabilisant', ...(showSel ? ['sel'] : [])]))
  const [tips, setTips] = useState<TipData[]>([])
  const [sitData, setSitData] = useState<SituationData | null>(null)

  useEffect(() => {
    const query = situation === 'analyse_courante'
      ? supabase.from('rag_tips').select('title, content').eq('active', true).order('sort_order')
      : supabase.from('rag_tips').select('title, content').eq('active', true).eq('linked_situation', situation).order('sort_order')
    query.then(r => setTips(r.data || []))
    if (situation !== 'analyse_courante') {
      supabase.from('rag_water_situations').select('slug, label, guide_url').eq('slug', situation).single().then(r => setSitData(r.data))
    }
  }, [situation])

  const toggle = (key: string) => { const s = new Set(selected); if (s.has(key)) s.delete(key); else s.add(key); setSelected(s) }

  const printReport = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const paramsHtml = PARAMS_CONFIG
      .filter(p => selected.has(p.key))
      .filter(p => p.key !== 'sel' || showSel)
      .map(p => {
        const value = params[p.key as keyof WaterParams] as number
        const pct = Math.max(0, Math.min(100, ((value - p.min) / (p.max - p.min)) * 100))
        const advice = getAdvice(p.key, params)
        const isOk = advice.color === '#22c55e'
        const statusIcon = isOk ? '✓' : '⚠'
        const bgTint = isOk ? '#f0fdf4' : advice.color === '#f59e0b' ? '#fffbeb' : '#fef2f2'

        return `<div style="margin-bottom:16px;page-break-inside:avoid">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600;color:#334155">${p.label}</span>
            <span style="font-size:14px;font-weight:700;color:${advice.color}">${value} ${p.unit}</span>
          </div>
          <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;position:relative">
            <div style="position:absolute;left:${(p.idealMin - p.min) / (p.max - p.min) * 100}%;width:${(p.idealMax - p.idealMin) / (p.max - p.min) * 100}%;height:100%;background:#bbf7d0;opacity:0.5"></div>
            <div style="height:100%;width:${pct}%;background:${advice.color};border-radius:4px;transition:width 0.3s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;margin-top:2px">
            <span>${p.min}</span><span style="color:#22c55e">idéal: ${p.idealMin}-${p.idealMax}</span><span>${p.max}</span>
          </div>
          <div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:${bgTint};border-left:3px solid ${advice.color}">
            <div style="font-size:10px;font-weight:700;color:${advice.color}">${statusIcon} ${advice.status}</div>
            <div style="font-size:10px;color:#475569;margin-top:2px">${advice.text}</div>
          </div>
        </div>`
      }).join('')

    const lsiPct = Math.max(2, Math.min(98, 50 + lsi * 40))
    const lsiStatusColor = lsiColor(lsi)
    const lsiCategory = lsi < -1.0 ? 'Eau corrosive' : lsi < -0.3 ? 'À surveiller' : lsi > 0.4 ? 'Eau entartrante' : 'Pas de risque'

    // Actions recommandées (tips)
    const actionsHtml = tips.length > 0 ? `
      <div style="margin-top:20px;page-break-inside:avoid">
        <div style="font-size:13px;font-weight:700;color:#001f3f;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e2e8f0">Actions recommandées</div>
        ${tips.map(t => `<div style="display:flex;gap:8px;margin-bottom:8px;padding:8px;background:#f0f9ff;border-radius:8px;border-left:3px solid #00d4ff">
          <span style="font-size:12px">💡</span>
          <div><div style="font-size:10px;font-weight:700;color:#0369a1">${t.title}</div><div style="font-size:10px;color:#475569;margin-top:2px">${t.content}</div></div>
        </div>`).join('')}
      </div>` : ''

    // Guide link
    const guideHtml = sitData?.guide_url ? `
      <div style="margin-top:15px;text-align:center;padding:10px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">
        <a href="${sitData.guide_url}" style="font-size:11px;color:#0369a1;text-decoration:none;font-weight:600">📖 Guide Cosy Piscine : ${sitData.label}</a>
      </div>` : ''

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Analyse Eau — Cosy Piscine</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 0; }
        @media print { body { padding: 0; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      </style>
    </head><body>
      <div style="max-width:720px;margin:0 auto">
        <!-- Header -->
        <div style="background:#001f3f;color:white;padding:20px 25px;border-radius:0 0 16px 16px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:45px;height:45px;background:rgba(255,255,255,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800">C</div>
            <div>
              <div style="font-size:16px;font-weight:700">Analyse Équilibre Eau</div>
              <div style="font-size:11px;opacity:0.7">Cosy Piscine — Assistance Piscine</div>
            </div>
          </div>
          <div style="display:flex;gap:20px;margin-top:12px;font-size:11px;opacity:0.8">
            <span>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>Volume : ${params.volume} m³</span>
            <span>Température : ${params.temperature}°C</span>
            ${situation !== 'analyse_courante' ? `<span style="background:#00d4ff;color:#001f3f;padding:2px 8px;border-radius:10px;font-weight:600">${sitData?.label || situation}</span>` : ''}
          </div>
        </div>

        <!-- Parameters -->
        <div style="padding:20px 25px">
          ${paramsHtml}
        </div>

        <!-- LSI -->
        <div style="margin:0 25px 20px;padding:20px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;text-align:center">
          <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:12px">Indice de Langelier (LSI)</div>
          <div style="height:30px;border-radius:15px;background:linear-gradient(to right,#ef4444,#f59e0b,#22c55e,#f59e0b,#ef4444);position:relative;margin-bottom:12px">
            <div style="position:absolute;top:0;left:${lsiPct}%;width:4px;height:100%;background:white;border:2px solid #1e293b;border-radius:3px;transform:translateX(-50%)"></div>
          </div>
          <div>
            <span style="font-size:28px;font-weight:800;color:${lsiStatusColor}">${lsi > 0 ? '+' : ''}${lsi}</span>
            <span style="display:inline-block;margin-left:10px;padding:4px 14px;border-radius:20px;font-size:12px;background:${lsiStatusColor};color:#fff;font-weight:600">${lsiCategory}</span>
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:6px">${lsiLabel}</div>
        </div>

        <!-- Actions recommandées -->
        <div style="padding:0 25px">
          ${actionsHtml}
          ${guideHtml}
        </div>

        <!-- Footer -->
        <div style="margin-top:25px;padding:12px 25px;border-top:1px solid #e2e8f0;text-align:center;font-size:9px;color:#94a3b8">
          © ${new Date().getFullYear()} Cosy Piscine — service.cosy-piscine.com
        </div>
      </div>
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

        <p className="text-xs text-gray-500 mb-3">Paramètres à inclure :</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {PARAMS_CONFIG.filter(p => p.key !== 'sel' || showSel).map(p => {
            const value = params[p.key as keyof WaterParams] as number
            const advice = getAdvice(p.key, params)
            return (
              <label key={p.key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selected.has(p.key) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} className="accent-blue-500" />
                <span className="text-xs flex-1">{p.label}</span>
                <span className="text-xs font-semibold" style={{ color: advice.color }}>{value} {p.unit}</span>
              </label>
            )
          })}
        </div>

        {tips.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3 mb-4">
            <div className="text-[10px] font-semibold text-blue-700 mb-1">Actions recommandées ({tips.length})</div>
            <div className="text-[10px] text-blue-600">{tips.map(t => t.title).join(' • ')}</div>
          </div>
        )}

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
