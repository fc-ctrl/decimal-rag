import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { History, MessageSquare, Search, ChevronDown, ChevronUp } from 'lucide-react'

interface ConvWithMessages {
  id: string
  title: string
  created_at: string
  updated_at: string
  messages: { role: string; content: string; created_at: string }[]
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConvWithMessages[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  useEffect(() => {
    loadHistory()
  }, [dateRange])

  async function loadHistory() {
    setLoading(true)

    let query = supabase
      .from('rag_conversations')
      .select('*')
      .order('updated_at', { ascending: false })

    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const since = new Date(Date.now() - days * 86400000).toISOString()
      query = query.gte('updated_at', since)
    }

    const { data: convs } = await query
    if (!convs) { setLoading(false); return }

    // Load messages for each conversation
    const results: ConvWithMessages[] = []
    for (const conv of convs) {
      const { data: msgs } = await supabase
        .from('rag_messages')
        .select('role, content, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at')
      results.push({
        ...conv,
        messages: msgs || [],
      })
    }

    setConversations(results)
    setLoading(false)
  }

  const filtered = conversations.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.title.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
  })

  const totalQuestions = conversations.reduce((acc, c) => acc + c.messages.filter(m => m.role === 'user').length, 0)
  const totalAnswers = conversations.reduce((acc, c) => acc + c.messages.filter(m => m.role === 'assistant').length, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <History size={20} />
          Historique ({conversations.length} conversations)
        </h1>
        <div className="flex gap-1">
          {(['7d', '30d', '90d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1 text-xs rounded-lg ${
                dateRange === range
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-muted hover:bg-gray-200'
              }`}
            >
              {range === '7d' ? '7 jours' : range === '30d' ? '30 jours' : range === '90d' ? '90 jours' : 'Tout'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-primary">{conversations.length}</div>
          <div className="text-xs text-text-muted">Conversations</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-blue-600">{totalQuestions}</div>
          <div className="text-xs text-text-muted">Questions posées</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-2xl font-bold text-green-600">{totalAnswers}</div>
          <div className="text-xs text-text-muted">Réponses données</div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher dans les conversations..."
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
        />
      </div>

      {/* Conversation list */}
      <div className="space-y-2">
        {filtered.map(conv => {
          const isExpanded = expandedId === conv.id
          const questionCount = conv.messages.filter(m => m.role === 'user').length
          return (
            <div key={conv.id} className="bg-white rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare size={16} className="text-text-muted shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{conv.title}</div>
                    <div className="text-xs text-text-muted">
                      {questionCount} question{questionCount > 1 ? 's' : ''}
                      {' · '}{new Date(conv.updated_at).toLocaleDateString('fr-FR')}
                      {' à '}{new Date(conv.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
              </button>
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-3 bg-gray-50 max-h-96 overflow-y-auto">
                  {conv.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                        msg.role === 'user'
                          ? 'bg-primary text-white'
                          : 'bg-white border border-border'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-white/60' : 'text-text-muted'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm bg-white rounded-xl border border-border">
            Aucune conversation trouvée.
          </div>
        )}
      </div>
    </div>
  )
}
