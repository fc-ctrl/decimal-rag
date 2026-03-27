import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ClipboardCheck, Play, Loader, ChevronDown, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

const AUDIT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-audit'

interface AuditReport {
  id: string
  status: string
  total_conversations: number
  sampled_conversations: number
  score_global: number | null
  results: AuditResult[]
  summary: string | null
  prompt_suggestions: string[]
  missing_topics: string[]
  missing_articles: string[]
  created_at: string
  completed_at: string | null
}

interface AuditResult {
  conversation_id: string
  question: string
  answer: string
  source?: string
  score?: number
  scores?: { fidelite: number; liens: number; equipement: number; format: number; cosy: number }
  issues?: string[]
  suggestions?: string[]
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400'
  if (score >= 8) return 'text-green-600'
  if (score >= 5) return 'text-yellow-600'
  return 'text-red-600'
}

function scoreBg(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100'
  if (score >= 8) return 'bg-green-50 border-green-200'
  if (score >= 5) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

function ScoreIcon({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  if (score >= 8) return <CheckCircle size={16} className="text-green-600" />
  if (score >= 5) return <AlertTriangle size={16} className="text-yellow-600" />
  return <XCircle size={16} className="text-red-600" />
}

export default function AuditPage() {
  const [reports, setReports] = useState<AuditReport[]>([])
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedResult, setExpandedResult] = useState<string | null>(null)

  useEffect(() => { loadReports() }, [])

  async function loadReports() {
    const { data } = await supabase
      .from('rag_audit_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setReports(data || [])
    setLoading(false)
  }

  async function launchAudit() {
    setLaunching(true)
    try {
      await fetch(AUDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      })
      // Poll for completion
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000))
        await loadReports()
        const latest = reports[0]
        if (latest?.status === 'completed' || latest?.status === 'error') break
      }
    } catch {
      alert('Erreur lors du lancement de l\'audit')
    }
    setLaunching(false)
    await loadReports()
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardCheck size={24} className="text-primary" />
            <h1 className="text-xl font-semibold">Audit Qualité RAG</h1>
          </div>
          <button
            onClick={launchAudit}
            disabled={launching}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {launching ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {launching ? 'Audit en cours...' : 'Lancer un audit'}
          </button>
        </div>

        <p className="text-sm text-text-muted mb-6">
          Évalue la qualité des réponses du RAG par échantillonnage. Audit automatique chaque lundi à 8h.
        </p>

        {loading ? (
          <div className="text-center py-12"><Loader size={24} className="animate-spin mx-auto text-primary" /></div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <ClipboardCheck size={32} className="mx-auto mb-3 opacity-30" />
            <p>Aucun audit réalisé. Lancez votre premier audit.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map(report => {
              const isExpanded = expandedId === report.id
              return (
                <div key={report.id} className={`bg-white rounded-xl border ${scoreBg(report.score_global)} transition-all`}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <ScoreIcon score={report.score_global} />
                      <div>
                        <div className="text-sm font-medium">
                          Audit du {new Date(report.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-xs text-text-muted">
                          {report.sampled_conversations} conversations évaluées sur {report.total_conversations}
                          {report.status === 'running' && ' — en cours...'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {report.score_global != null && (
                        <span className={`text-2xl font-bold ${scoreColor(report.score_global)}`}>
                          {report.score_global}/10
                        </span>
                      )}
                      {report.status === 'running' && <Loader size={16} className="animate-spin text-primary" />}
                      <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Summary */}
                      {report.summary && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h3 className="text-sm font-semibold mb-2">Résumé</h3>
                          <pre className="text-xs text-text-muted whitespace-pre-wrap">{report.summary}</pre>
                        </div>
                      )}

                      {/* Suggestions */}
                      {report.prompt_suggestions?.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <h3 className="text-sm font-semibold mb-2 text-blue-700">Améliorations proposées</h3>
                          <ul className="text-xs space-y-1">
                            {report.prompt_suggestions.map((s, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-blue-500 mt-0.5">→</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Individual results */}
                      {report.results?.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold mb-2">Détail par conversation</h3>
                          <div className="space-y-2">
                            {report.results.map((r, i) => (
                              <div key={i} className={`border rounded-lg ${scoreBg(r.score)}`}>
                                <button
                                  onClick={() => setExpandedResult(expandedResult === `${report.id}-${i}` ? null : `${report.id}-${i}`)}
                                  className="w-full flex items-center justify-between p-3 text-left"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{r.question?.substring(0, 80)}</div>
                                    {r.source && <span className="text-[10px] text-text-muted">{r.source}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 ml-3">
                                    <ScoreIcon score={r.score} />
                                    <span className={`text-sm font-bold ${scoreColor(r.score)}`}>{r.score}/10</span>
                                  </div>
                                </button>
                                {expandedResult === `${report.id}-${i}` && (
                                  <div className="px-3 pb-3 space-y-2">
                                    {r.scores && (
                                      <div className="flex gap-2 flex-wrap">
                                        {Object.entries(r.scores).map(([k, v]) => (
                                          <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full ${v >= 8 ? 'bg-green-100 text-green-700' : v >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                            {k}: {v}/10
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {r.issues?.length ? (
                                      <div>
                                        <div className="text-[10px] font-semibold text-red-600 mb-1">Problèmes :</div>
                                        {r.issues.map((issue, j) => <div key={j} className="text-[10px] text-red-600">• {issue}</div>)}
                                      </div>
                                    ) : null}
                                    {r.suggestions?.length ? (
                                      <div>
                                        <div className="text-[10px] font-semibold text-blue-600 mb-1">Suggestions :</div>
                                        {r.suggestions.map((sug, j) => <div key={j} className="text-[10px] text-blue-600">→ {sug}</div>)}
                                      </div>
                                    ) : null}
                                    <details className="mt-2">
                                      <summary className="text-[10px] text-text-muted cursor-pointer">Voir la réponse complète</summary>
                                      <pre className="text-[10px] text-text-muted whitespace-pre-wrap mt-1 max-h-40 overflow-auto bg-white p-2 rounded">{r.answer}</pre>
                                    </details>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
