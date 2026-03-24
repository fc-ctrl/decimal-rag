import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Camera, ArrowLeft, Loader, List, Package } from 'lucide-react'

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

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
  catalog_id: string | null
}

interface CatalogItem {
  id: string
  brand: string
  model: string
  type: string
  visual_traits: string | null
}

// Type icons
function typeIcon(type: string) {
  const t = type.toLowerCase()
  if (t.includes('pompe')) return '🔄'
  if (t.includes('electrolyseur') || t.includes('électrolyseur')) return '⚡'
  if (t.includes('regulateur') || t.includes('régulateur')) return '📊'
  if (t.includes('filtre')) return '🔽'
  if (t.includes('volet')) return '🪟'
  if (t.includes('robot')) return '🤖'
  return '🔧'
}

export default function ClientEquipment({ contactId, onBack }: Props) {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addMode, setAddMode] = useState<null | 'photo' | 'list'>(null)
  const [identifying, setIdentifying] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [identification, setIdentification] = useState<{ brand: string; model: string; type: string; catalog_id: string | null } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [contactId])

  async function loadData() {
    const [eqRes, catRes] = await Promise.all([
      supabase.from('cosy_equipment').select('*').eq('airtable_contact_id', contactId).order('created_at', { ascending: false }),
      supabase.from('rag_equipment_catalog').select('id, brand, model, type, visual_traits').order('type, brand, model'),
    ])
    setEquipment(eqRes.data || [])
    setCatalog(catRes.data || [])
    setLoading(false)
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIdentifying(true)
    setAddMode('photo')

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      setPreview(reader.result as string)

      // Build catalog context for Vision comparison
      const catalogContext = catalog.map(c =>
        `- ${c.brand} ${c.model} (${c.type})${c.visual_traits ? ' : ' + c.visual_traits : ''}`
      ).join('\n')

      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatInput: `Identifie cet equipement piscine en le comparant UNIQUEMENT avec la liste ci-dessous. Ne cherche PAS sur internet. Si aucun modele ne correspond, reponds "Non repertorie".

CATALOGUE COSY PISCINE :
${catalogContext}

Reponds STRICTEMENT :
Marque: [marque du catalogue]
Modele: [modele exact du catalogue]
Type: [type]`,
            sessionId: 'equipment-identify-' + Date.now(),
            image: base64,
          }),
        })
        const data = await res.json()
        const answer = data.output || data.answer || ''

        const get = (key: string) => {
          const match = answer.match(new RegExp(`${key}\\s*:\\s*(.+?)(?:\\n|$)`, 'i'))
          return match?.[1]?.trim() || ''
        }

        const brand = get('Marque')
        const model = get('Mod[eè]le')
        const type = get('Type')

        // Match with catalog
        const match = catalog.find(c =>
          c.model.toLowerCase().includes(model.toLowerCase()) ||
          model.toLowerCase().includes(c.model.toLowerCase())
        )

        setIdentification({
          brand: match?.brand || brand || 'Non identifié',
          model: match?.model || model || 'Non identifié',
          type: match?.type || type || 'Équipement piscine',
          catalog_id: match?.id || null,
        })
      } catch {
        setIdentification({ brand: 'Non identifié', model: 'Non identifié', type: 'Équipement piscine', catalog_id: null })
      }
      setIdentifying(false)
    }
    reader.readAsDataURL(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  function selectFromCatalog(item: CatalogItem) {
    setIdentification({
      brand: item.brand,
      model: item.model,
      type: item.type,
      catalog_id: item.id,
    })
    setAddMode('photo') // reuse the confirmation view
  }

  async function saveEquipment() {
    if (!identification) return
    await supabase.from('cosy_equipment').insert({
      airtable_contact_id: contactId,
      brand: identification.brand,
      model: identification.model,
      type: identification.type,
      catalog_id: identification.catalog_id,
      identified_by: addMode === 'list' ? 'catalog_select' : 'photo_ai',
    })
    setAddMode(null)
    setPreview(null)
    setIdentification(null)
    loadData()
  }

  async function deleteEquipment(id: string) {
    if (!confirm('Retirer cet équipement ?')) return
    await supabase.from('cosy_equipment').delete().eq('id', id)
    setEquipment(equipment.filter(e => e.id !== id))
  }

  // Group equipment by type
  const grouped = equipment.reduce((acc, eq) => {
    const type = eq.type || 'Autre'
    if (!acc[type]) acc[type] = []
    acc[type].push(eq)
    return acc
  }, {} as Record<string, Equipment[]>)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-sky-200 hover:text-white"><ArrowLeft size={20} /></button>
        <Package size={20} />
        <div>
          <div className="text-sm font-medium">Mon matériel</div>
          <div className="text-xs text-sky-200">{equipment.length} équipement{equipment.length > 1 ? 's' : ''}</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Add buttons */}
        {!addMode && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => photoRef.current?.click()}
              className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-sky-300 rounded-xl text-sky-600 hover:bg-sky-50">
              <Camera size={24} />
              <span className="text-xs font-medium">Prendre une photo</span>
            </button>
            <button onClick={() => setAddMode('list')}
              className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-sky-300 rounded-xl text-sky-600 hover:bg-sky-50">
              <List size={24} />
              <span className="text-xs font-medium">Choisir dans la liste</span>
            </button>
          </div>
        )}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

        {/* List selector */}
        {addMode === 'list' && !identification && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Choisir un équipement</h3>
              <button onClick={() => setAddMode(null)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {Object.entries(
                catalog.reduce((acc, c) => { const t = c.type; if (!acc[t]) acc[t] = []; acc[t].push(c); return acc }, {} as Record<string, CatalogItem[]>)
              ).map(([type, items]) => (
                <div key={type}>
                  <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-2 pt-2 pb-1">{typeIcon(type)} {type}</div>
                  {items.map(item => (
                    <button key={item.id} onClick={() => selectFromCatalog(item)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sky-50 rounded-lg text-left">
                      <div>
                        <div className="text-sm font-medium">{item.brand} {item.model}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo identification / Confirmation */}
        {(addMode === 'photo' || (addMode === 'list' && identification)) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {preview && <img src={preview} alt="Photo" className="w-full h-48 object-cover rounded-lg" />}
            {identifying ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader size={16} className="animate-spin" />
                Identification en cours (comparaison avec le catalogue Cosy)...
              </div>
            ) : identification ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">
                  {identification.catalog_id ? '✅ Équipement reconnu' : '⚠️ Modèle non répertorié'}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <label className="block text-[10px] text-gray-400 mb-1">Type</label>
                    <div className="text-sm font-medium">{identification.type}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <label className="block text-[10px] text-gray-400 mb-1">Marque</label>
                    <div className="text-sm font-medium">{identification.brand}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <label className="block text-[10px] text-gray-400 mb-1">Modèle</label>
                    <div className="text-sm font-medium">{identification.model}</div>
                  </div>
                </div>
                {!identification.catalog_id && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                    Ce modèle n'est pas dans notre catalogue. Vous pouvez quand même l'ajouter ou contactez votre magasin Cosy Piscine.
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={saveEquipment} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700">Ajouter</button>
                  <button onClick={() => { setAddMode(null); setPreview(null); setIdentification(null) }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Equipment list grouped by type */}
        {loading ? (
          <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : equipment.length === 0 && !addMode ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucun équipement enregistré.</p>
        ) : (
          Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <span>{typeIcon(type)}</span> {type}
              </h3>
              <div className="space-y-2">
                {items.map(eq => (
                  <div key={eq.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 group">
                    <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center text-lg">
                      {typeIcon(eq.type)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{eq.brand}</div>
                      <div className="text-sm text-gray-600">{eq.model}</div>
                    </div>
                    <button onClick={() => deleteEquipment(eq.id)} className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500">Retirer</button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
