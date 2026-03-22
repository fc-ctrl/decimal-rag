import { useState, useEffect } from 'react'
import { ArrowLeft, AlertCircle, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'

const DATA_URL = 'https://n8n.decimal-ia.com/webhook/cosy-client-data'

interface Props {
  contactId: string
  onBack: () => void
}

interface SavTicket {
  id: string
  title: string
  status: string
  date: string
  description: string
  families: string[]
  interventions: { date: string; status: string; report: string }[]
}

export default function ClientSav({ contactId, onBack }: Props) {
  const [tickets, setTickets] = useState<SavTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadSav()
  }, [contactId])

  async function loadSav() {
    try {
      const res = await fetch(DATA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sav_list', contactId }),
      })
      const data = await res.json()
      setTickets(data.tickets || [])
    } catch {}
    setLoading(false)
  }

  const statusIcon = (status: string) => {
    if (status === 'Clôturé' || status === 'Résolu') return <CheckCircle size={14} className="text-green-500" />
    if (status === 'En cours') return <Clock size={14} className="text-orange-500" />
    return <AlertCircle size={14} className="text-red-500" />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="text-sm font-medium">Mes demandes SAV</div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-3">
        {loading ? (
          <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucune demande SAV enregistrée.</p>
        ) : (
          tickets.map(ticket => (
            <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-3">
                  {statusIcon(ticket.status)}
                  <div>
                    <div className="text-sm font-medium">{ticket.title || 'Demande SAV'}</div>
                    <div className="text-xs text-gray-400">
                      {ticket.date}
                      {ticket.families?.length > 0 && ` · ${ticket.families.join(', ')}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    ticket.status === 'Clôturé' || ticket.status === 'Résolu' ? 'bg-green-100 text-green-700' :
                    ticket.status === 'En cours' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {ticket.status}
                  </span>
                  {expandedId === ticket.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>
              {expandedId === ticket.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  {ticket.description && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                    </div>
                  )}
                  {ticket.interventions?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Interventions</div>
                      <div className="space-y-2">
                        {ticket.interventions.map((itv, i) => (
                          <div key={i} className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-400">{itv.date} · {itv.status}</div>
                            {itv.report && <p className="text-sm text-gray-700 mt-1">{itv.report}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
