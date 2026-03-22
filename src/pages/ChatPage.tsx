import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { Send, Plus, MessageSquare, Trash2, Camera } from 'lucide-react'
import type { ChatConversation, ChatMessage } from '@/types'

// Simple markdown renderer: **bold**, [text](url), raw URLs
function renderMarkdown(text: string): ReactNode[] {
  const elements: ReactNode[] = []
  // Split by lines to handle block-level formatting
  const lines = text.split('\n')
  for (let li = 0; li < lines.length; li++) {
    if (li > 0) elements.push('\n')
    const line = lines[li]
    // Parse inline: **bold**, [text](url), raw URLs
    const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g)
    for (let pi = 0; pi < parts.length; pi++) {
      const p = parts[pi]
      const key = `${li}-${pi}`
      const boldMatch = p.match(/^\*\*(.+)\*\*$/)
      const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (boldMatch) {
        elements.push(<strong key={key}>{boldMatch[1]}</strong>)
      } else if (linkMatch) {
        elements.push(<a key={key} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-hover">{linkMatch[1]}</a>)
      } else if (/^https?:\/\//.test(p)) {
        elements.push(<a key={key} href={p} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-hover break-all">{p}</a>)
      } else {
        elements.push(p)
      }
    }
  }
  return elements
}

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

export default function ChatPage() {
  const { profile } = useAuth()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConv, setActiveConv] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingImage, setPendingImage] = useState<{ base64: string; preview: string } | null>(null)
  const [catalogItems, setCatalogItems] = useState<{ brand: string; model: string; type: string; visual_traits: string | null }[]>([])
  const photoRef = useRef<HTMLInputElement>(null)
  const streamingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
    loadCatalog()
  }, [])

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
      } else if (input.trim().length < 15 && messages.length >= 2) {
        // Very short follow-up only (oui, non, notice?, et le pH?)
        // Don't inject context for topic changes like "volet immergé"
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
        const lastUser = [...messages].reverse().find(m => m.role === 'user')
        if (lastAssistant) {
          const lastContent = lastAssistant.content.substring(0, 300)
          chatInput = `(Contexte: "${lastUser?.content || ''}" → "${lastContent.substring(0, 150)}...")\n\n${input}`
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

      // Remove the ⚠️ verification note (too noisy)
      let fullAnswer = answerText.replace(/\n\n⚠️ Note:.*$/s, '')

      // Fallback: if AI didn't include a PDF link, check equipment-associated PDFs
      if (!fullAnswer.includes('.pdf') && !fullAnswer.includes('cosy-piscine')) {
        try {
          const { data: eqDocs } = await supabase
            .from('rag_documents')
            .select('title, source_ref, metadata')
            .eq('source_type', 'upload')
            .eq('status', 'ready')
            .not('metadata->equipment_model', 'is', null)
          const answerLower = fullAnswer.toLowerCase()
          const matchedPdfs: { title: string; url: string; label: string }[] = []
          for (const doc of eqDocs || []) {
            const meta = doc.metadata as Record<string, string>
            const models = (meta.equipment_model || '').toLowerCase().split('/').map(m => m.trim())
            const mentioned = models.some(model => {
              const words = model.split(/\s+/).filter(w => w.length > 2)
              return words.length > 0 && words.every(w => answerLower.includes(w))
            })
            if (mentioned && doc.source_ref) {
              const { data: signed } = await supabase.storage.from('rag-documents').createSignedUrl(doc.source_ref, 3600)
              if (signed?.signedUrl) {
                matchedPdfs.push({ title: doc.title, url: signed.signedUrl, label: `${doc.title} (${meta.equipment_brand || ''} ${meta.equipment_model || ''})`.trim() })
              }
            }
          }
          if (matchedPdfs.length > 0) {
            const pdfLinks = matchedPdfs.map(p => `- [${p.label}](${p.url})`).join('\n')
            fullAnswer = `${fullAnswer}\n\n**Documentation disponible :**\n${pdfLinks}`
          }
        } catch {}
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
                <div className="whitespace-pre-wrap">{renderMarkdown(msg.content)}</div>
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
