import { useState, useEffect } from 'react'
import { ArrowLeft, AlertCircle, CheckCircle, Clock, ChevronDown, ChevronUp, Wrench, Calendar, MapPin, Phone } from 'lucide-react'

const DATA_URL = 'https://n8n.decimal-ia.com/webhook/cosy-client-data'

interface Props {
  contactId: string
  onBack: () => void
}

interface Intervention {
  id: string
  title: string
  date: string
  status: string
  report: string
  rapportIA: string
  photos: { url: string; thumb: string }[]
  address: string
  contact: string
  tel: string
}

interface SavTicket {
  id: string
  title: string
  status: string
  date: string
  description: string
  clientReport: string
  families: string[]
  interventions: Intervention[]
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
    const s = status.toLowerCase()
    if (s.includes('clôtur') || s.includes('résolu') || s.includes('termin')) return <CheckCircle size={14} className="text-green-500" />
    if (s.includes('cours') || s.includes('planifi') || s.includes('confirm')) return <Clock size={14} className="text-orange-500" />
    return <AlertCircle size={14} className="text-sky-500" />
  }

  const statusColor = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('clôtur') || s.includes('résolu') || s.includes('termin')) return 'bg-green-100 text-green-700'
    if (s.includes('cours') || s.includes('planifi') || s.includes('confirm')) return 'bg-orange-100 text-orange-700'
    return 'bg-sky-100 text-sky-700'
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
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColor(ticket.status)}`}>
                    {ticket.status}
                  </span>
                  {expandedId === ticket.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {expandedId === ticket.id && (
                <div className="border-t border-gray-100">
                  {/* Description client */}
                  {ticket.description && (
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                    </div>
                  )}

                  {/* Rapport SAV global */}
                  {ticket.clientReport && (
                    <div className="px-4 py-3 bg-sky-50 border-b border-sky-100">
                      <div className="text-xs font-medium text-sky-600 mb-1">Synthèse</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.clientReport}</p>
                    </div>
                  )}

                  {/* Interventions — Style rapport email */}
                  {ticket.interventions?.length > 0 && (
                    <div className="p-4 space-y-4">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Interventions ({ticket.interventions.length})</div>
                      {ticket.interventions.map((itv, i) => (
                        <div key={itv.id || i} className="rounded-xl overflow-hidden border border-gray-200">
                          {/* Header intervention — style rapport Cosy */}
                          <div className="bg-[#001f3f] px-4 py-3 flex items-center justify-between border-b-4 border-[#00d4ff]">
                            <div className="flex items-center gap-2">
                              <Wrench size={14} className="text-[#00d4ff]" />
                              <span className="text-white text-sm font-medium">Rapport de visite</span>
                            </div>
                            <span className="text-[#00d4ff] text-xs font-bold uppercase">Cosy Piscine</span>
                          </div>

                          {/* Infos intervention */}
                          <div className="px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-4">
                                {itv.date && (
                                  <span className="flex items-center gap-1 text-gray-500">
                                    <Calendar size={12} />
                                    {itv.date}
                                  </span>
                                )}
                                {itv.address && (
                                  <span className="flex items-center gap-1 text-gray-500">
                                    <MapPin size={12} />
                                    {itv.address}
                                  </span>
                                )}
                                {itv.tel && (
                                  <span className="flex items-center gap-1 text-gray-500">
                                    <Phone size={12} />
                                    {itv.tel}
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(itv.status)}`}>
                                {itv.status}
                              </span>
                            </div>
                          </div>

                          {/* Rapport — Travaux réalisés */}
                          {(itv.rapportIA || itv.report) && (
                            <div className="px-4 py-3 bg-[#fafbfc]">
                              <div className="text-xs font-bold text-[#004080] uppercase mb-1">Travaux réalisés</div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {itv.rapportIA || itv.report}
                              </p>
                            </div>
                          )}

                          {/* Photos */}
                          {itv.photos?.length > 0 && (
                            <div className="px-4 py-3 grid grid-cols-2 gap-2">
                              {itv.photos.map((photo, j) => (
                                <a key={j} href={photo.url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={photo.thumb}
                                    alt={`Photo ${j + 1}`}
                                    className="w-full h-40 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Footer */}
                          <div className="text-center py-2 bg-gray-50 text-gray-400 text-[10px]">
                            Cosy Piscine-Habitat
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {ticket.interventions?.length === 0 && !ticket.description && !ticket.clientReport && (
                    <div className="p-4 text-sm text-gray-400 text-center">Aucun détail disponible</div>
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
