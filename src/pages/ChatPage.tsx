import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { Send, Plus, MessageSquare, Trash2, FileText, Camera } from 'lucide-react'
import type { ChatConversation, ChatMessage, Document } from '@/types'

interface SourceLink {
  label: string
  url: string
}

function extractSourceRefs(text: string): string[] {
  const matches = text.matchAll(/\[Source:\s*([^\]]+)\]/gi)
  return [...new Set([...matches].map(m => m[1].trim()))]
}

async function resolveSourceLinks(refs: string[], docs: Document[], answerText: string): Promise<SourceLink[]> {
  const links: SourceLink[] = []
  const seen = new Set<string>()
  const answerLower = answerText.toLowerCase()
  const skipWords = new Set(['source','manuel','manual','installation','utilisation','document','technique','pour','votre','dans','avec','plus','pompe','piscine','poolex','chaleur','filtration'])

  for (const ref of refs) {
    const refLower = ref.toLowerCase()
    const refWords = refLower.split(/[\s'']+/).filter(w => w.length > 4 && !skipWords.has(w))

    // Strategy 1: Match by filename
    const byTitle = docs.filter(d => {
      if (d.source_type !== 'upload') return false
      const tl = d.title.toLowerCase()
      return refWords.some(w => tl.includes(w.substring(0, 5)))
    })

    // Strategy 2: Match by equipment metadata (if answer mentions the model)
    const byEquipment = docs.filter(d => {
      if (d.source_type !== 'upload') return false
      const meta = d.metadata as Record<string, string>
      if (!meta?.equipment_model) return false
      const model = meta.equipment_model.toLowerCase()
      // Check if the source ref or answer mentions this equipment
      return model.split(/\s+/).filter(w => w.length > 3).some(w => refLower.includes(w) || answerLower.includes(w))
    })

    // Merge candidates, prefer equipment matches
    const allCandidates = [...new Map([...byEquipment, ...byTitle].map(d => [d.id, d])).values()]

    // Score: equipment match > title match, and prefer version-specific
    let best = allCandidates[0] || null
    if (allCandidates.length > 1) {
      // Prefer equipment-matched docs
      const eqMatch = allCandidates.find(d => byEquipment.includes(d))
      if (eqMatch) best = eqMatch

      // Version hints for Vertigo
      const hasV2Hint = answerLower.includes('v2') || answerLower.includes('2024') || /\bE\d{2}\b/.test(answerText)
      const hasV1Hint = answerLower.includes('v1') || answerLower.includes('2023')
      for (const c of allCandidates) {
        const tl = c.title.toLowerCase()
        if (hasV2Hint && tl.includes('2') && tl.includes('vertigo')) { best = c; break }
        if (hasV1Hint && tl.includes('1') && tl.includes('vertigo')) { best = c; break }
      }

      // WiFi hints
      if (answerLower.includes('wifi') || answerLower.includes('vp wifi')) {
        const wifiDoc = allCandidates.find(d => d.title.toLowerCase().includes('wifi') || ((d.metadata as Record<string,string>)?.equipment_model || '').toLowerCase().includes('wifi'))
        if (wifiDoc) best = wifiDoc
      }
    }

    if (best?.source_ref && !seen.has(best.id)) {
      seen.add(best.id)
      const { data } = await supabase.storage
        .from('rag-documents')
        .createSignedUrl(best.source_ref, 3600)
      if (data?.signedUrl) {
        links.push({ label: best.title, url: data.signedUrl })
      }
    }
  }
  return links
}

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

// Common pool words to ignore when matching URLs (too generic, match everything)
const URL_STOP_WORDS = new Set(['piscine','electrolyseur','pompe','filtre','votre','comment','guide','bien','pour',
  'dans','avec','plus','causes','solutions','complet','etape','conseils','chlore','traitement','fonctionnement'])

// Find all relevant docs: PDFs (signed URL) + web pages (direct link)
async function resolveAllLinks(refs: string[], allDocs: Document[], answerText: string): Promise<SourceLink[]> {
  const links: SourceLink[] = []
  const seen = new Set<string>()
  const answerLower = answerText.toLowerCase()
  // 1. Source ref matching (from [Source: ...] tags) — PDFs only
  const refLinks = await resolveSourceLinks(refs, allDocs, answerText)
  for (const l of refLinks) {
    if (!seen.has(l.url)) { seen.add(l.url); links.push(l) }
  }

  // 2. Equipment-associated documents (PDFs + URLs)
  const docsWithRef = allDocs.filter(d => d.source_ref)
  for (const doc of docsWithRef) {
    if (seen.has(doc.id)) continue
    const meta = doc.metadata as Record<string, unknown>
    const eqModel = ((meta?.equipment_model as string) || '').toLowerCase()
    if (!eqModel) continue
    const models = eqModel.split('/').map(m => m.trim()).filter(Boolean)
    const mentioned = models.some(model => {
      const words = model.split(/\s+/).filter(w => w.length > 2)
      return words.length > 0 && words.every(w => answerLower.includes(w))
    })
    if (mentioned) {
      if (doc.source_type === 'upload') {
        const { data } = await supabase.storage.from('rag-documents').createSignedUrl(doc.source_ref, 3600)
        if (data?.signedUrl) {
          seen.add(doc.id)
          links.push({ label: `${doc.title} (${(meta.equipment_brand as string) || ''} ${eqModel})`.trim(), url: data.signedUrl })
        }
      } else if (doc.source_type === 'url') {
        seen.add(doc.id)
        const slug = doc.source_ref.replace(/https?:\/\/[^/]+\//, '').replace(/\/$/, '')
        const label = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        links.push({ label, url: doc.source_ref })
      }
    }
  }

  // 3. PDF matching by title keywords (even without equipment metadata)
  const uploadDocs = allDocs.filter(d => d.source_type === 'upload' && d.source_ref)
  for (const doc of uploadDocs) {
    if (seen.has(doc.id)) continue
    const titleWords = doc.title.toLowerCase().replace(/[._-]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !URL_STOP_WORDS.has(w))
    if (titleWords.length === 0) continue
    const titleMatch = titleWords.filter(w => answerLower.includes(w)).length
    if (titleMatch >= 2 && titleMatch >= titleWords.length * 0.4) {
      const { data } = await supabase.storage.from('rag-documents').createSignedUrl(doc.source_ref, 3600)
      if (data?.signedUrl) {
        seen.add(doc.id)
        links.push({ label: doc.title, url: data.signedUrl })
      }
    }
  }

  // 4. URL documents — strict keyword matching (fallback if not equipment-linked)
  const urlDocs = allDocs.filter(d => d.source_type === 'url' && d.source_ref)
  const urlScored: { doc: typeof urlDocs[0]; score: number }[] = []
  for (const doc of urlDocs) {
    if (seen.has(doc.id)) continue
    const slug = doc.source_ref.toLowerCase().replace(/https?:\/\/[^/]+\//, '').replace(/\/$/, '')
    const slugWords = slug.split(/[-_/]/).filter(w => w.length > 3 && !URL_STOP_WORDS.has(w))
    if (slugWords.length === 0) continue
    const matchCount = slugWords.filter(w => answerLower.includes(w)).length
    const ratio = matchCount / slugWords.length
    if (matchCount >= 2 && ratio >= 0.5) {
      urlScored.push({ doc, score: matchCount + ratio })
    }
  }
  urlScored.sort((a, b) => b.score - a.score)
  for (const { doc } of urlScored.slice(0, 3)) {
    seen.add(doc.id)
    const slug = doc.source_ref.replace(/https?:\/\/[^/]+\//, '').replace(/\/$/, '')
    const label = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    links.push({ label, url: doc.source_ref })
  }

  return links
}

export default function ChatPage() {
  const { profile } = useAuth()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConv, setActiveConv] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [pendingImage, setPendingImage] = useState<{ base64: string; preview: string } | null>(null)
  const [catalogItems, setCatalogItems] = useState<{ brand: string; model: string; type: string; visual_traits: string | null }[]>([])
  const photoRef = useRef<HTMLInputElement>(null)
  const streamingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
    loadDocs()
    loadCatalog()
  }, [])

  async function loadDocs() {
    const { data } = await supabase
      .from('rag_documents')
      .select('*')
      .eq('status', 'ready')
    setDocs(data || [])
  }

  async function loadCatalog() {
    const { data } = await supabase
      .from('rag_equipment_catalog')
      .select('brand, model, type, visual_traits')
    setCatalogItems(data || [])
  }

  useEffect(() => {
    if (activeConv) loadMessages(activeConv)
  }, [activeConv])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    const { data } = await supabase
      .from('rag_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
    setConversations(data || [])
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from('rag_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at')
    setMessages(data || [])
  }

  async function newConversation() {
    const { data } = await supabase
      .from('rag_conversations')
      .insert({
        org_id: 'default',
        user_id: profile?.id,
        title: 'Nouvelle conversation',
      })
      .select()
      .single()
    if (data) {
      setConversations(c => [data, ...c])
      setActiveConv(data.id)
      setMessages([])
    }
  }

  async function deleteConversation(id: string) {
    await supabase.from('rag_conversations').delete().eq('id', id)
    setConversations(c => c.filter(x => x.id !== id))
    if (activeConv === id) {
      setActiveConv(null)
      setMessages([])
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      const preview = reader.result as string
      setPendingImage({ base64, preview })
      if (!input.trim()) setInput('Identifie cet équipement piscine')
    }
    reader.readAsDataURL(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  async function sendMessage() {
    if (!input.trim() || sending) return

    let convId: string = activeConv || ''
    if (!convId) {
      const { data } = await supabase
        .from('rag_conversations')
        .insert({
          org_id: 'default',
          user_id: profile?.id,
          title: input.substring(0, 60),
        })
        .select()
        .single()
      if (!data) return
      convId = data.id
      setActiveConv(data.id)
      setConversations(c => [data, ...c])
    }

    const imageData = pendingImage
    const userContent = imageData ? `📷 ${input}` : input

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: 'user',
      content: userContent,
      sources: [],
      created_at: new Date().toISOString(),
    }
    setMessages(m => [...m, userMsg])
    setInput('')
    setPendingImage(null)
    setSending(true)

    // Save user message
    await supabase.from('rag_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: userMsg.content,
      sources: [],
    })

    try {
      // Build chatInput with context for short follow-up messages
      let chatInput = input
      if (imageData && catalogItems.length > 0) {
        chatInput = `${input}\n\nEQUIPEMENTS CONNUS (compare la photo avec cette liste) :\n${catalogItems.map(c => `- ${c.brand} ${c.model} (${c.type})${c.visual_traits ? ' : ' + c.visual_traits : ''}`).join('\n')}`
      } else if (input.trim().length < 40 && messages.length >= 2) {
        // Short follow-up: inject context from last exchange
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
        const lastUser = [...messages].reverse().find(m => m.role === 'user')
        if (lastAssistant) {
          // Extract equipment/topic keywords from last assistant message
          const lastContent = lastAssistant.content.substring(0, 300)
          chatInput = `(Contexte: la conversation portait sur: "${lastUser?.content || ''}" → "${lastContent.substring(0, 150)}...")\n\nNouvelle question: ${input}`
        }
      }

      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatInput,
          sessionId: convId,
          ...(imageData ? { image: imageData.base64 } : {}),
        }),
      })
      const data = await res.json()
      const answerText = data.output || data.answer || 'Désolé, je n\'ai pas pu répondre.'
      const fromCache = data.fromCache || false

      // Resolve links BEFORE displaying the answer
      const sourceRefs = extractSourceRefs(answerText)
      const resolvedLinks = await resolveAllLinks(sourceRefs, docs, answerText)

      // Inject links into the answer text
      let fullAnswer = answerText
      if (resolvedLinks.length > 0) {
        const linkLines = resolvedLinks.map(l => `- ${l.label} : ${l.url}`).join('\n')
        fullAnswer = `${answerText}\n\n📎 Documents utiles :\n${linkLines}`
      }

      const msgId = crypto.randomUUID()
      const assistantMsg: ChatMessage = {
        id: msgId,
        conversation_id: convId,
        role: 'assistant',
        content: fullAnswer,
        sources: [],
        created_at: new Date().toISOString(),
      }

      // Typing effect: show answer progressively (word by word)
      if (!fromCache && fullAnswer.length > 50) {
        streamingRef.current = true
        setMessages(m => [...m, { ...assistantMsg, content: '' }])
        const words = fullAnswer.split(/(\s+)/)
        let displayed = ''
        for (let w = 0; w < words.length; w++) {
          displayed += words[w]
          const snap = displayed
          setMessages(m => m.map(msg => msg.id === msgId ? { ...msg, content: snap } : msg))
          if (words[w].trim()) await new Promise(r => setTimeout(r, 15))
        }
        streamingRef.current = false
      } else {
        setMessages(m => [...m, assistantMsg])
      }

      // Save assistant message
      await supabase.from('rag_messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: assistantMsg.content,
        sources: assistantMsg.sources,
      })

      // Update conversation title if first message
      if (messages.length === 0) {
        await supabase
          .from('rag_conversations')
          .update({ title: userMsg.content.substring(0, 60), updated_at: new Date().toISOString() })
          .eq('id', convId)
        setConversations(c =>
          c.map(x => x.id === convId ? { ...x, title: userMsg.content.substring(0, 60) } : x)
        )
      }
    } catch {
      setMessages(m => [...m, {
        id: crypto.randomUUID(),
        conversation_id: convId!,
        role: 'assistant',
        content: 'Erreur de connexion au serveur RAG.',
        sources: [],
        created_at: new Date().toISOString(),
      }])
    }

    setSending(false)
  }

  return (
    <div className="flex flex-1 h-screen">
      {/* Sidebar conversations */}
      <div className="w-64 bg-white border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            Nouvelle conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/50 hover:bg-gray-50 group ${activeConv === conv.id ? 'bg-purple-50' : ''}`}
              onClick={() => setActiveConv(conv.id)}
            >
              <MessageSquare size={14} className="text-text-muted shrink-0" />
              <span className="text-sm truncate flex-1">{conv.title}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="p-4 text-center text-text-muted text-xs">
              Aucune conversation
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !activeConv && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center text-text-muted">
                <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-1">Decimal RAG</p>
                <p className="text-sm">Posez une question sur vos documents</p>
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-white'
                  : 'bg-white border border-border'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content.split(/(https?:\/\/[^\s\]]+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-hover break-all">{part}</a>
                  ) : part
                )}</div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
                    <div className="text-xs font-medium opacity-70">Sources :</div>
                    {msg.sources.map((s, i) => (
                      <div key={i} className="flex items-center gap-1 text-xs opacity-70">
                        <FileText size={10} />
                        <span>{s.document_title}</span>
                        <span className="text-[10px]">({Math.round(s.similarity * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-border rounded-2xl px-4 py-3 text-sm text-text-muted">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white">
          {pendingImage && (
            <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2">
              <img src={pendingImage.preview} alt="Photo" className="w-16 h-16 object-cover rounded-lg border border-border" />
              <span className="text-xs text-text-muted">Photo prête à envoyer</span>
              <button onClick={() => setPendingImage(null)} className="text-xs text-danger hover:underline">Retirer</button>
            </div>
          )}
          <div className="flex gap-2 max-w-3xl mx-auto">
            <button
              onClick={() => photoRef.current?.click()}
              disabled={sending}
              className="px-3 py-2.5 border border-border rounded-xl text-text-muted hover:bg-gray-50 hover:text-primary disabled:opacity-50 transition-colors"
              title="Envoyer une photo d'équipement"
            >
              <Camera size={18} />
            </button>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={pendingImage ? "Décrivez votre problème ou envoyez directement..." : "Posez une question sur vos documents..."}
              className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
