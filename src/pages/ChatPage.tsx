import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { Send, Plus, MessageSquare, Trash2, FileText, Download } from 'lucide-react'
import type { ChatConversation, ChatMessage, Document } from '@/types'

interface SourceLink {
  label: string
  url: string
}

function extractSourceRefs(text: string): string[] {
  const matches = text.matchAll(/\[Source:\s*([^\]]+)\]/gi)
  return [...new Set([...matches].map(m => m[1].trim()))]
}

async function resolveSourceLinks(refs: string[], docs: Document[]): Promise<SourceLink[]> {
  const links: SourceLink[] = []
  for (const ref of refs) {
    const doc = docs.find(d =>
      d.source_type === 'upload' &&
      (d.title.toLowerCase().includes(ref.toLowerCase().substring(0, 20)) ||
       ref.toLowerCase().includes(d.title.toLowerCase().replace(/\.[^.]+$/, '').substring(0, 20)))
    )
    if (doc?.source_ref) {
      const { data } = await supabase.storage
        .from('rag-documents')
        .createSignedUrl(doc.source_ref, 3600)
      if (data?.signedUrl) {
        links.push({ label: doc.title, url: data.signedUrl })
      }
    }
  }
  return links
}

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

export default function ChatPage() {
  const { profile } = useAuth()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConv, setActiveConv] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [downloadLinks, setDownloadLinks] = useState<Record<string, SourceLink[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
    loadDocs()
  }, [])

  async function loadDocs() {
    const { data } = await supabase
      .from('rag_documents')
      .select('*')
      .eq('source_type', 'upload')
      .eq('status', 'ready')
    setDocs(data || [])
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

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: 'user',
      content: input,
      sources: [],
      created_at: new Date().toISOString(),
    }
    setMessages(m => [...m, userMsg])
    setInput('')
    setSending(true)

    // Save user message
    await supabase.from('rag_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: userMsg.content,
      sources: [],
    })

    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatInput: userMsg.content,
          sessionId: convId,
        }),
      })
      const data = await res.json()

      // n8n Agent returns { output: "..." }
      const answerText = data.output || data.answer || 'Désolé, je n\'ai pas pu répondre.'

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversation_id: convId,
        role: 'assistant',
        content: answerText,
        sources: [],
        created_at: new Date().toISOString(),
      }
      setMessages(m => [...m, assistantMsg])

      // Resolve download links from [Source: ...] references
      const sourceRefs = extractSourceRefs(answerText)
      if (sourceRefs.length > 0) {
        resolveSourceLinks(sourceRefs, docs).then(links => {
          if (links.length > 0) {
            setDownloadLinks(prev => ({ ...prev, [assistantMsg.id]: links }))
          }
        })
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
                <div className="whitespace-pre-wrap">{msg.content}</div>
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
                {downloadLinks[msg.id] && downloadLinks[msg.id].length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/30 space-y-1.5">
                    <div className="text-xs font-medium opacity-70">Documents sources :</div>
                    {downloadLinks[msg.id].map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover hover:underline"
                      >
                        <Download size={12} />
                        <span>{link.label}</span>
                      </a>
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
          <div className="flex gap-2 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Posez une question sur vos documents..."
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
