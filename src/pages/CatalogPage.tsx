import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Camera, Loader, Search, Package } from 'lucide-react'

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

interface CatalogItem {
  id: string
  brand: string
  model: string
  type: string
  visual_traits: string | null
  photo_url: string | null
  photos: { url: string; view: string }[]
  created_at: string
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [photos, setPhotos] = useState<{ url: string; view: string }[]>([])
  const [newItem, setNewItem] = useState({ brand: '', model: '', type: '', visual_traits: '' })
  const photoRef = useRef<HTMLInputElement>(null)
  const addPhotoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadCatalog() }, [])

  async function loadCatalog() {
    const { data } = await supabase
      .from('rag_equipment_catalog')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data || [])
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
      const dataUrl = reader.result as string
      setPhotos([{ url: dataUrl, view: 'face' }])

      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatInput: 'Identifie precisement cet equipement piscine. Lis tous les textes visibles sur l appareil.',
            sessionId: 'catalog-' + Date.now(),
            image: base64,
          }),
        })
        const data = await res.json()
        const answer = data.output || data.answer || ''

        const brandMatch = answer.match(/[Mm]arque[:\s]*([^|\n]+)/)
        const modelMatch = answer.match(/[Mm]od[eè]le[:\s]*([^|\n]+)/)
        const typeMatch = answer.match(/[Tt]ype[:\s]*([^|\n]+)/)
        const traitsMatch = answer.match(/[Tt]raits?\s*(?:visuels)?[:\s]*([^|\n]+)/i)

        setNewItem({
          brand: brandMatch?.[1]?.trim() || '',
          model: modelMatch?.[1]?.trim() || '',
          type: typeMatch?.[1]?.trim() || '',
          visual_traits: traitsMatch?.[1]?.trim() || '',
        })
      } catch {
        setNewItem({ brand: '', model: '', type: '', visual_traits: '' })
      }
      setIdentifying(false)
    }
    reader.readAsDataURL(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhotos(p => [...p, { url: reader.result as string, view: 'autre' }])
    }
    reader.readAsDataURL(file)
    if (addPhotoRef.current) addPhotoRef.current.value = ''
  }

  async function saveItem() {
    if (!newItem.brand || !newItem.model) return
    await supabase.from('rag_equipment_catalog').insert({
      brand: newItem.brand,
      model: newItem.model,
      type: newItem.type,
      visual_traits: newItem.visual_traits,
      photo_url: photos[0]?.url || null,
      photos: photos,
    })
    setAdding(false)
    setPhotos([])
    setNewItem({ brand: '', model: '', type: '', visual_traits: '' })
    loadCatalog()
  }

  async function deleteItem(id: string) {
    if (!confirm('Supprimer ce modèle du catalogue ?')) return
    await supabase.from('rag_equipment_catalog').delete().eq('id', id)
    setItems(items.filter(i => i.id !== id))
  }

  const filtered = items.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return i.brand.toLowerCase().includes(q) || i.model.toLowerCase().includes(q) || i.type.toLowerCase().includes(q)
  })

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
          <Package size={20} />
          Catalogue équipements ({items.length})
        </h1>
        <button
          onClick={() => photoRef.current?.click()}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover"
        >
          <Plus size={14} />
          Ajouter (photo)
        </button>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6 bg-white rounded-xl border border-border p-5 space-y-4">
          {/* Photos grid */}
          <div className="flex gap-2 flex-wrap mb-4">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p.url} alt={p.view} className="w-28 h-28 object-cover rounded-lg border border-border" />
                <select
                  value={p.view}
                  onChange={e => setPhotos(photos.map((ph, j) => j === i ? { ...ph, view: e.target.value } : ph))}
                  className="absolute bottom-1 left-1 right-1 text-[10px] bg-white/90 rounded px-1 py-0.5 border"
                >
                  <option value="face">Face</option>
                  <option value="cote">Côté</option>
                  <option value="dessus">Dessus</option>
                  <option value="plaque">Plaque</option>
                  <option value="ecran">Écran</option>
                  <option value="autre">Autre</option>
                </select>
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
              </div>
            ))}
            <button onClick={() => addPhotoRef.current?.click()} className="w-28 h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-text-muted hover:border-primary hover:text-primary">
              <Camera size={20} />
              <span className="text-[10px] mt-1">+ Vue</span>
            </button>
            <input ref={addPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-3">
              {identifying ? (
                <div className="flex items-center gap-2 text-sm text-text-muted py-4">
                  <Loader size={16} className="animate-spin" />
                  Identification IA en cours...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Marque</label>
                      <input value={newItem.brand} onChange={e => setNewItem({ ...newItem, brand: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Poolex" />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Modèle</label>
                      <input value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Variline CosyLine" />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Type</label>
                      <select value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                        <option value="">Sélectionner...</option>
                        <option>Pompe de filtration</option>
                        <option>Pompe à chaleur</option>
                        <option>Électrolyseur</option>
                        <option>Régulateur</option>
                        <option>Filtre</option>
                        <option>Volet</option>
                        <option>Robot</option>
                        <option>Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Traits visuels distinctifs</label>
                      <input value={newItem.visual_traits} onChange={e => setNewItem({ ...newItem, visual_traits: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Logo bleu, boîtier noir..." />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveItem} disabled={!newItem.brand || !newItem.model} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50">Enregistrer</button>
                    <button onClick={() => { setAdding(false); setPhotos([]) }} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un modèle..."
          className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
        />
      </div>

      {/* Catalog list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(item => (
          <div key={item.id} className="bg-white rounded-xl border border-border overflow-hidden group">
            {item.photo_url ? (
              <img src={item.photo_url} alt={item.model} className="w-full h-40 object-cover" />
            ) : (
              <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                <Camera size={32} className="text-gray-300" />
              </div>
            )}
            <div className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{item.brand} {item.model}</div>
                  <div className="text-xs text-text-muted">{item.type}</div>
                  {item.visual_traits && <div className="text-xs text-text-muted mt-1 italic">{item.visual_traits}</div>}
                </div>
                <button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && !adding && (
        <div className="text-center py-12 text-text-muted text-sm">
          Aucun modèle dans le catalogue. Ajoutez-en un avec le bouton "Ajouter (photo)".
        </div>
      )}
    </div>
  )
}
