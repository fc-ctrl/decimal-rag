import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Document } from '@/types'
import { FileText, Upload, Trash2, Globe, Database, Search, CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://plbjafwltwpupspmlnip.supabase.co'
const INGEST_URL = `${SUPABASE_URL}/functions/v1/rag-ingest`
const INGEST_TEXT_URL = 'https://n8n.decimal-ia.com/webhook/rag-ingest-text'

async function extractTextFromPDF(
  file: File,
  onProgress?: (step: string, pct: number) => void,
): Promise<string> {
  onProgress?.('Lecture du fichier...', 0)
  const arrayBuffer = await file.arrayBuffer()
  onProgress?.('Ouverture du PDF...', 5)
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  const total = pdf.numPages
  for (let i = 1; i <= total; i++) {
    onProgress?.(`Extraction page ${i}/${total}`, 5 + Math.round((i / total) * 85))
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: unknown) => (item as { str?: string }).str || '').join(' ')
    if (text.trim()) pages.push(text.trim())
  }
  onProgress?.('Extraction terminée', 95)
  return pages.join('\n\n')
}

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
  const [uploadProgress, setUploadProgress] = useState<{ step: string; pct: number } | null>(null)
  const [catalogItems, setCatalogItems] = useState<{ id: string; brand: string; model: string; type: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDocuments()
    loadCatalog()
  }, [])

  async function loadCatalog() {
    const { data } = await supabase.from('rag_equipment_catalog').select('id, brand, model, type').order('brand')
    setCatalogItems(data || [])
  }

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
      // Limite 20 Mo
      if (file.size > 20 * 1024 * 1024) {
        alert(`Le fichier ${file.name} dépasse 20 Mo (${(file.size / 1024 / 1024).toFixed(1)} Mo). Veuillez le compresser.`)
        continue
      }

      const path = `rag/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('rag-documents')
        .upload(path, file)

      if (uploadErr) {
        alert(`Erreur upload ${file.name}: ${uploadErr.message}`)
        continue
      }

      // Insert document record
      const { data: doc, error: docErr } = await supabase.from('rag_documents').insert({
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

      if (docErr || !doc) {
        alert(`Erreur création document ${file.name}: ${docErr?.message || 'inconnu'}`)
        continue
      }

      setDocuments(d => [doc, ...d])

      // For PDFs, extract text client-side and send to rag-ingest-text
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        try {
          const pdfText = await extractTextFromPDF(file, (step, pct) => {
            setUploadProgress({ step, pct })
          })
          if (pdfText.length > 50) {
            setUploadProgress({ step: 'Envoi au serveur...', pct: 97 })
            const res = await fetch(INGEST_TEXT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ document_id: doc.id, text: pdfText, title: file.name }),
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }))
              console.error('rag-ingest-text error:', err)
              // Fallback to server-side extraction
              triggerIngest(doc.id)
            } else {
              // Poll for status like triggerIngest does
              pollDocumentStatus(doc.id)
            }
          } else {
            // Not enough text extracted client-side, use server-side
            triggerIngest(doc.id)
          }
        } catch (e) {
          console.error('PDF extraction error:', e)
          // Fallback to server-side extraction
          triggerIngest(doc.id)
        }
      } else {
        triggerIngest(doc.id)
      }
    }

    // Reset file input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = ''
    setUploadProgress(null)
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

  function pollDocumentStatus(documentId: string) {
    // Update UI to show processing
    setDocuments(d => d.map(doc => doc.id === documentId ? { ...doc, status: 'processing' } : doc))
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('rag_documents')
        .select('status, chunk_count, error_message')
        .eq('id', documentId)
        .single()
      if (data && data.status !== 'pending' && data.status !== 'processing') {
        clearInterval(poll)
        setDocuments(d => d.map(doc => doc.id === documentId ? { ...doc, ...data } : doc))
        if (data.status === 'error') {
          alert(`Erreur d'ingestion : ${data.error_message || 'inconnu'}`)
        }
      }
    }, 3000)
    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(poll), 300000)
  }

  async function triggerIngest(documentId: string) {
    try {
      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        console.error('rag-ingest error:', err)
      }
      pollDocumentStatus(documentId)
    } catch (e) {
      console.error('triggerIngest error:', e)
      alert(`Erreur de connexion au serveur d'ingestion`)
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

  const [filterType, setFilterType] = useState<'all' | 'upload' | 'url' | 'other'>('all')

  const filtered = documents.filter(d => {
    const matchSearch = d.title.toLowerCase().includes(search.toLowerCase())
    if (filterType === 'all') return matchSearch
    if (filterType === 'upload') return matchSearch && d.source_type === 'upload'
    if (filterType === 'url') return matchSearch && d.source_type === 'url'
    return matchSearch && d.source_type !== 'upload' && d.source_type !== 'url'
  })

  const countByType = {
    all: documents.length,
    upload: documents.filter(d => d.source_type === 'upload').length,
    url: documents.filter(d => d.source_type === 'url').length,
    other: documents.filter(d => d.source_type !== 'upload' && d.source_type !== 'url').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
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

      {/* Stats by type */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {([
          { key: 'all' as const, label: 'Tous', color: 'text-primary' },
          { key: 'upload' as const, label: 'PDF / Fichiers', color: 'text-blue-600' },
          { key: 'url' as const, label: 'Pages web', color: 'text-green-600' },
          { key: 'other' as const, label: 'Autres', color: 'text-orange-600' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setFilterType(t.key)}
            className={`bg-white rounded-xl border p-3 text-left transition-colors ${
              filterType === t.key ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-gray-300'
            }`}
          >
            <div className={`text-xl font-bold ${t.color}`}>{countByType[t.key]}</div>
            <div className="text-xs text-text-muted">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Upload progress bar */}
      {uploadProgress && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-blue-700 font-medium">{uploadProgress.step}</span>
            <span className="text-xs text-blue-500">{uploadProgress.pct}%</span>
          </div>
          <div className="w-full bg-blue-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.pct}%` }}
            />
          </div>
        </div>
      )}

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
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${
                      doc.source_type === 'upload' ? 'bg-blue-100 text-blue-700' : doc.source_type === 'url' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {doc.source_type === 'upload' ? 'PDF' : doc.source_type === 'url' ? 'URL' : doc.source_type}
                    </span>
                    {doc.chunk_count} chunks
                    {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} Ko` : ''}
                    {' · '}{new Date(doc.created_at).toLocaleDateString('fr-FR')}
                    {doc.updated_at && doc.updated_at !== doc.created_at && ` (maj ${new Date(doc.updated_at).toLocaleDateString('fr-FR')})`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Equipment association */}
                <select
                  value={(doc.metadata as Record<string, string>)?.equipment_id || ''}
                  onChange={async (e) => {
                    const eqId = e.target.value
                    const eq = catalogItems.find(c => c.id === eqId)
                    const meta = { ...(doc.metadata || {}), equipment_id: eqId || undefined, equipment_brand: eq?.brand, equipment_model: eq?.model, equipment_type: eq?.type }
                    if (!eqId) { delete (meta as Record<string, unknown>).equipment_id; delete (meta as Record<string, unknown>).equipment_brand; delete (meta as Record<string, unknown>).equipment_model; delete (meta as Record<string, unknown>).equipment_type }
                    await supabase.from('rag_documents').update({ metadata: meta }).eq('id', doc.id)
                    setDocuments(d => d.map(x => x.id === doc.id ? { ...x, metadata: meta } : x))
                  }}
                  className="text-[10px] px-1.5 py-1 border border-border rounded bg-white max-w-[140px] text-text-muted"
                  title="Associer à un équipement"
                >
                  <option value="">— Équipement —</option>
                  {catalogItems.map(c => (
                    <option key={c.id} value={c.id}>{c.brand} {c.model}</option>
                  ))}
                </select>
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
