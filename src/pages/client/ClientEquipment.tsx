import { useState, useEffect, useRef } from 'react'
import { Camera, Plus, ArrowLeft, Loader } from 'lucide-react'

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'
const SUPABASE_URL = 'https://plbjafwltwpupspmlnip.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYmphZndsdHdwdXBzcG1sbmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjQ1MTYsImV4cCI6MjA4ODU0MDUxNn0.xQRTqPRBmpEwC1pZ3rX4m9wCtbQHx8jQC-dvgtUbNfk'

interface Props {
  contactId: string
  onBack: () => void
}

interface Equipment {
  id: string
  brand: string
  model: string
  type: string
  photo_url: string | null
  install_date: string | null
  identified_by: string
}

export default function ClientEquipment({ contactId, onBack }: Props) {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [identification, setIdentification] = useState<{ brand: string; model: string; type: string } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadEquipment()
  }, [contactId])

  async function loadEquipment() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cosy_equipment?airtable_contact_id=eq.${contactId}&select=*&order=created_at.desc`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      })
      const data = await res.json()
      setEquipment(data || [])
    } catch {}
    setLoading(false)
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIdentifying(true)
    setAdding(true)

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      setPreview(reader.result as string)

      // Send to GPT-4o Vision via chat webhook
      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatInput: 'Identifie precisement cet equipement piscine. Donne la marque, le modele exact et le type.',
            sessionId: 'equipment-identify-' + Date.now(),
            image: base64,
          }),
        })
        const data = await res.json()
        const answer = data.output || data.answer || ''

        // Parse identification
        const brandMatch = answer.match(/(?:marque|brand)[:\s]*([^\n|,]+)/i)
        const modelMatch = answer.match(/(?:mod[eè]le|model)[:\s]*([^\n|,]+)/i)
        const typeMatch = answer.match(/(?:type)[:\s]*([^\n|,]+)/i)

        setIdentification({
          brand: brandMatch?.[1]?.trim() || 'Inconnu',
          model: modelMatch?.[1]?.trim() || 'Inconnu',
          type: typeMatch?.[1]?.trim() || 'Équipement piscine',
        })
      } catch {
        setIdentification({ brand: 'Inconnu', model: 'Inconnu', type: 'Équipement piscine' })
      }
      setIdentifying(false)
    }
    reader.readAsDataURL(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  async function saveEquipment() {
    if (!identification) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/cosy_equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          airtable_contact_id: contactId,
          brand: identification.brand,
          model: identification.model,
          type: identification.type,
          identified_by: 'photo_ai',
        }),
      })
      setAdding(false)
      setPreview(null)
      setIdentification(null)
      loadEquipment()
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="text-sm font-medium">Mon matériel</div>
      </header>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Add button */}
        {!adding && (
          <button
            onClick={() => photoRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-sky-300 rounded-xl text-sky-600 hover:bg-sky-50 transition-colors"
          >
            <Plus size={20} />
            <span className="text-sm font-medium">Ajouter un équipement (photo)</span>
          </button>
        )}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

        {/* Identification in progress */}
        {adding && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {preview && <img src={preview} alt="Photo" className="w-full h-48 object-cover rounded-lg" />}
            {identifying ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader size={16} className="animate-spin" />
                Identification en cours...
              </div>
            ) : identification ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Équipement identifié :</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400">Marque</label>
                    <input
                      value={identification.brand}
                      onChange={e => setIdentification({ ...identification, brand: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400">Modèle</label>
                    <input
                      value={identification.model}
                      onChange={e => setIdentification({ ...identification, model: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400">Type</label>
                    <input
                      value={identification.type}
                      onChange={e => setIdentification({ ...identification, type: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEquipment} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700">Valider</button>
                  <button onClick={() => { setAdding(false); setPreview(null); setIdentification(null) }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Equipment list */}
        {loading ? (
          <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : equipment.length === 0 && !adding ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucun équipement enregistré. Prenez une photo pour commencer.</p>
        ) : (
          <div className="space-y-3">
            {equipment.map(eq => (
              <div key={eq.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center">
                  <Camera size={20} className="text-sky-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">{eq.brand} {eq.model}</div>
                  <div className="text-xs text-gray-400">{eq.type} {eq.identified_by === 'photo_ai' ? '· Identifié par photo' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
