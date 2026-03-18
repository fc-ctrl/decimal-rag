import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Document } from '@/types'
import { FileText, Upload, Trash2, Globe, Database, Search, CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react'

const INGEST_URL = 'https://decimal.cosy-groupe.com/webhook/decimal-rag-ingest'

const sourceIcons: Record<string, typeof FileText> = {
  upload: Upload,
  url: Globe,
  google_drive: FileText,
  airtable: Database,
  supabase: Database,
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  ready: { icon: CheckCircle, color: 'text-success', label: 'Prêt' },
  pending: { icon: Clock, color: 'text-warning', label: 'En attente' },
  processing: { icon: Loader, color: 'text-primary', label: 'Traitement...' },
  error: { icon: AlertCircle, color: 'text-danger', label: 'Erreur' },
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  async function loadDocuments() {
    setLoading(true)
    const { data } = await supabase
      .from('rag_documents')
      .select('*')
      .order('created_at', { ascending: false })
    setDocuments(data || [])
    setLoading(false)
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const path = `rag/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('rag-documents')
        .upload(path, file)

      if (uploadErr) {
        alert(`Erreur upload ${file.name}: ${uploadErr.message}`)
        continue
      }

      // Insert document record
      const { data: doc } = await supabase.from('rag_documents').insert({
        org_id: 'default',
        user_id: (await supabase.auth.getUser()).data.user?.id,
        title: file.name,
        source_type: 'upload',
        source_ref: path,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        chunk_count: 0,
        status: 'pending',
        metadata: {},
      }).select().single()

      if (doc) {
        setDocuments(d => [doc, ...d])
        // Trigger ingestion
        triggerIngest(doc.id)
      }
    }

    setUploading(false)
  }

  async function handleUrlIngest() {
    if (!url.trim()) return
    setUploading(true)

    const { data: doc } = await supabase.from('rag_documents').insert({
      org_id: 'default',
      user_id: (await supabase.auth.getUser()).data.user?.id,
      title: url,
      source_type: 'url',
      source_ref: url,
      mime_type: 'text/html',
      file_size: null,
      chunk_count: 0,
      status: 'pending',
      metadata: {},
    }).select().single()

    if (doc) {
      setDocuments(d => [doc, ...d])
      triggerIngest(doc.id)
    }

    setUrl('')
    setShowUrlForm(false)
    setUploading(false)
  }

  async function triggerIngest(documentId: string) {
    try {
      await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      })
      // Poll for status change
      const poll = setInterval(async () => {
        const { data } = await supabase
          .from('rag_documents')
          .select('status, chunk_count')
          .eq('id', documentId)
          .single()
        if (data && data.status !== 'pending' && data.status !== 'processing') {
          clearInterval(poll)
          setDocuments(d => d.map(doc => doc.id === documentId ? { ...doc, ...data } : doc))
        }
      }, 3000)
      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(poll), 120000)
    } catch {
      // Ingestion will be retried
    }
  }

  async function deleteDocument(id: string) {
    if (!confirm('Supprimer ce document et tous ses chunks ?')) return
    const doc = documents.find(d => d.id === id)
    if (doc?.source_type === 'upload' && doc.source_ref) {
      await supabase.storage.from('rag-documents').remove([doc.source_ref])
    }
    await supabase.from('rag_documents').delete().eq('id', id)
    setDocuments(d => d.filter(x => x.id !== id))
  }

  const filtered = documents.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <FileText size={20} />
          Documents ({documents.length})
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUrlForm(!showUrlForm)}
            className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-gray-50"
          >
            <Globe size={14} />
            URL
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover"
          >
            <Upload size={14} />
            {uploading ? 'Upload...' : 'Uploader'}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xls,.xlsx"
            className="hidden"
            onChange={e => handleFileUpload(e.target.files)}
          />
        </div>
      </div>

      {/* URL form */}
      {showUrlForm && (
        <div className="mb-4 flex gap-2">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm"
          />
          <button
            onClick={handleUrlIngest}
            disabled={!url.trim() || uploading}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
          >
            Ingérer
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un document..."
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
        />
      </div>

      {/* Document list */}
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {filtered.map(doc => {
          const SourceIcon = sourceIcons[doc.source_type] || FileText
          const status = statusConfig[doc.status] || statusConfig.pending
          const StatusIcon = status.icon
          return (
            <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-gray-50 group">
              <div className="flex items-center gap-3 min-w-0">
                <SourceIcon size={18} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{doc.title}</div>
                  <div className="text-xs text-text-muted">
                    {doc.chunk_count} chunks
                    {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} Ko` : ''}
                    {' · '}{new Date(doc.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`flex items-center gap-1 text-xs ${status.color}`}>
                  <StatusIcon size={14} className={doc.status === 'processing' ? 'animate-spin' : ''} />
                  {status.label}
                </span>
                <button
                  onClick={() => deleteDocument(doc.id)}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm">
            {documents.length === 0
              ? 'Aucun document. Uploadez vos premiers fichiers ou ajoutez une URL.'
              : 'Aucun document trouvé.'
            }
          </div>
        )}
      </div>
    </div>
  )
}
