import { useState, useEffect } from 'react'
import { MessageSquare, Wrench, Camera, LogOut, AlertCircle, CheckCircle, Clock } from 'lucide-react'

const AIRTABLE_PROXY = 'https://n8n.decimal-ia.com/webhook/cosy-client-data'

interface Props {
  clientName: string
  contactId: string
  onNavigate: (page: string) => void
  onLogout: () => void
}

interface SavTicket {
  id: string
  title: string
  status: string
  date: string
  description: string
}

export default function ClientDashboard({ clientName, contactId, onNavigate, onLogout }: Props) {
  const [savTickets, setSavTickets] = useState<SavTicket[]>([])
  const [equipmentCount, setEquipmentCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [contactId])

  async function loadData() {
    try {
      const res = await fetch(AIRTABLE_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dashboard', contactId }),
      })
      const data = await res.json()
      setSavTickets(data.savTickets || [])
      setEquipmentCount(data.equipmentCount || 0)
    } catch {
      // Fallback
    }
    setLoading(false)
  }

  const statusIcon = (status: string) => {
    if (status === 'Clôturé' || status === 'Résolu') return <CheckCircle size={14} className="text-green-500" />
    if (status === 'En cours') return <Clock size={14} className="text-orange-500" />
    return <AlertCircle size={14} className="text-red-500" />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <span className="text-lg font-bold">C</span>
          </div>
          <div>
            <div className="text-sm font-medium">Cosy Piscine</div>
            <div className="text-xs text-sky-200">Bonjour {clientName}</div>
          </div>
        </div>
        <button onClick={onLogout} className="text-sky-200 hover:text-white">
          <LogOut size={20} />
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => onNavigate('chat')}
            className="bg-white rounded-xl border border-gray-200 p-5 text-center hover:border-sky-300 hover:shadow-md transition-all"
          >
            <MessageSquare size={28} className="mx-auto mb-2 text-sky-600" />
            <div className="text-sm font-medium">Chat SAV</div>
            <div className="text-xs text-gray-400">Assistance en ligne</div>
          </button>
          <button
            onClick={() => onNavigate('equipment')}
            className="bg-white rounded-xl border border-gray-200 p-5 text-center hover:border-sky-300 hover:shadow-md transition-all"
          >
            <Camera size={28} className="mx-auto mb-2 text-sky-600" />
            <div className="text-sm font-medium">Mon matériel</div>
            <div className="text-xs text-gray-400">{equipmentCount} équipement{equipmentCount > 1 ? 's' : ''}</div>
          </button>
          <button
            onClick={() => onNavigate('sav')}
            className="bg-white rounded-xl border border-gray-200 p-5 text-center hover:border-sky-300 hover:shadow-md transition-all"
          >
            <Wrench size={28} className="mx-auto mb-2 text-sky-600" />
            <div className="text-sm font-medium">Mes SAV</div>
            <div className="text-xs text-gray-400">{savTickets.length} demande{savTickets.length > 1 ? 's' : ''}</div>
          </button>
        </div>

        {/* Recent SAV tickets */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold mb-4">Dernières demandes SAV</h2>
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" />
            </div>
          ) : savTickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune demande SAV</p>
          ) : (
            <div className="space-y-3">
              {savTickets.slice(0, 5).map(ticket => (
                <div key={ticket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {statusIcon(ticket.status)}
                    <div>
                      <div className="text-sm font-medium">{ticket.title}</div>
                      <div className="text-xs text-gray-400">{ticket.date}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    ticket.status === 'Clôturé' || ticket.status === 'Résolu' ? 'bg-green-100 text-green-700' :
                    ticket.status === 'En cours' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {ticket.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
