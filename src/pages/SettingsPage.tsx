import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Settings, Database, RefreshCw } from 'lucide-react'

interface SourceConfig {
  id: string
  source_type: string
  label: string
  config: Record<string, string>
  is_active: boolean
}

export default function SettingsPage() {
  const [sources, setSources] = useState<SourceConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ documents: 0, chunks: 0, conversations: 0 })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: src }, { count: docCount }, { count: chunkCount }, { count: convCount }] = await Promise.all([
      supabase.from('rag_source_configs').select('*').order('created_at'),
      supabase.from('rag_documents').select('*', { count: 'exact', head: true }),
      supabase.from('rag_chunks').select('*', { count: 'exact', head: true }),
      supabase.from('rag_conversations').select('*', { count: 'exact', head: true }),
    ])
    setSources(src || [])
    setStats({ documents: docCount || 0, chunks: chunkCount || 0, conversations: convCount || 0 })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold flex items-center gap-2 mb-6">
        <Settings size={20} />
        Paramètres
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-4 text-center">
          <div className="text-2xl font-bold text-primary">{stats.documents}</div>
          <div className="text-xs text-text-muted">Documents</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4 text-center">
          <div className="text-2xl font-bold text-primary">{stats.chunks}</div>
          <div className="text-xs text-text-muted">Chunks</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4 text-center">
          <div className="text-2xl font-bold text-primary">{stats.conversations}</div>
          <div className="text-xs text-text-muted">Conversations</div>
        </div>
      </div>

      {/* Sources de données */}
      <div className="mb-8">
        <h2 className="text-base font-medium mb-4 flex items-center gap-2">
          <Database size={16} />
          Sources de données connectées
        </h2>
        <div className="bg-white rounded-xl border border-border divide-y divide-border">
          {sources.map(src => (
            <div key={src.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">{src.label}</div>
                <div className="text-xs text-text-muted">{src.source_type}</div>
              </div>
              <span className={`text-xs ${src.is_active ? 'text-success' : 'text-text-muted'}`}>
                {src.is_active ? 'Actif' : 'Inactif'}
              </span>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="p-6 text-center text-text-muted text-sm">
              Aucune source configurée. Les sources (Airtable, Supabase, Google Drive) seront ajoutées via les workflows n8n.
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-purple-50 rounded-xl p-4 text-sm text-purple-800">
        <p className="font-medium mb-2 flex items-center gap-1"><RefreshCw size={14} /> Comment ça marche ?</p>
        <ul className="list-disc ml-4 space-y-1 text-xs">
          <li>Uploadez des documents (PDF, Word, Excel, CSV, TXT) ou ajoutez des URLs</li>
          <li>Les documents sont découpés en chunks et vectorisés (OpenAI embeddings)</li>
          <li>Connectez vos bases Airtable et Supabase via les workflows n8n</li>
          <li>Posez des questions en langage naturel dans le Chat</li>
          <li>Le RAG retrouve les passages pertinents et génère une réponse sourcée</li>
        </ul>
      </div>
    </div>
  )
}
