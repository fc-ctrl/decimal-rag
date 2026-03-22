import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Camera, Loader, Search, Package } from 'lucide-react'

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

interface PhotoItem {
  url: string
  view: string
  description: string
}

interface CatalogItem {
  id: string
  brand: string
  model: string
  type: string
  visual_traits: string | null
  photo_url: string | null
  photos: PhotoItem[]
  created_at: string
}

async function analyzePhoto(base64: string): Promise<{ brand: string; model: string; type: string; traits: string; description: string }> {
  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatInput: `ETAPE 1 — LIRE le texte sur l'appareil :
Lis CHAQUE mot/texte visible imprime ou grave sur l'appareil (nom de marque, nom de modele, etiquettes, inscriptions sur l'ecran). Liste-les tous.

ETAPE 2 — IDENTIFIER a partir du texte lu :
- La MARQUE est le texte du logo (ex: POOLEX, HAYWARD, etc.)
- Le MODELE est le nom du produit ecrit sur l'appareil (ex: Aqualyser, Vertigo, Variline, MaxFlo, etc.)
- NE JAMAIS inventer un nom de modele. Si tu lis "Aqualyser" sur l'appareil, le modele EST "Aqualyser", PAS autre chose.

ETAPE 3 — CLASSIFIER le type d'equipement :
- Electrolyseur = appareil avec cellule de sel, sondes pH/ORP, production de chlore
- Pompe a chaleur = gros boitier avec ventilateur, echangeur thermique
- Pompe de filtration = moteur avec turbine hydraulique
- Regulateur = boitier de controle pH/chlore sans cellule de production

REGLE ABSOLUE : Le modele dans ta reponse DOIT correspondre au texte que tu as LU sur l'appareil. Si tu as lu "Aqualyser", tu reponds "Aqualyser".

Reponds STRICTEMENT dans ce format :
Marque: [marque lue sur l'appareil]
Modele: [modele lu sur l'appareil]
Type: [pompe de filtration/pompe a chaleur/electrolyseur/regulateur/filtre/volet/robot/coffret de commande]
Traits: [couleurs, forme, details distinctifs]
Description: [description complete de ce que tu vois sur cette photo en 2-3 phrases]`,
        sessionId: 'catalog-analyze-' + Date.now(),
        image: base64,
      }),
    })
    const data = await res.json()
    const answer = data.output || data.answer || ''

    const get = (key: string) => {
      const match = answer.match(new RegExp(`${key}\\s*:\\s*(.+?)(?:\\n|$)`, 'i'))
      return match?.[1]?.trim() || ''
    }

    return {
      brand: get('Marque'),
      model: get('Mod[eè]le'),
      type: get('Type'),
      traits: get('Traits'),
      description: get('Description'),
    }
  } catch {
    return { brand: '', model: '', type: '', traits: '', description: '' }
  }
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoQueue, setPhotoQueue] = useState<PhotoItem[]>([])
  const [newItem, setNewItem] = useState({ brand: '', model: '', type: '', visual_traits: '' })
  const firstPhotoRef = useRef<HTMLInputElement>(null)
  const addPhotoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadCatalog() }, [])

  async function loadCatalog() {
    const { data } = await supabase.from('rag_equipment_catalog').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function handleFirstPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true)
    setAdding(true)

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const dataUrl = reader.result as string

      const result = await analyzePhoto(base64)

      setPhotoQueue([{
        url: dataUrl,
        view: 'face',
        description: result.description || 'Photo principale',
      }])
      setNewItem({
        brand: result.brand,
        model: result.model,
        type: result.type,
        visual_traits: result.traits,
      })
      setAnalyzing(false)
    }
    reader.readAsDataURL(file)
    if (firstPhotoRef.current) firstPhotoRef.current.value = ''
  }

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true)

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const dataUrl = reader.result as string

      const result = await analyzePhoto(base64)

      setPhotoQueue(prev => [...prev, {
        url: dataUrl,
        view: 'autre',
        description: result.description || 'Vue additionnelle',
      }])
      setAnalyzing(false)
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
      photo_url: photoQueue[0]?.url || null,
      photos: photoQueue,
    })
    setAdding(false)
    setPhotoQueue([])
    setNewItem({ brand: '', model: '', type: '', visual_traits: '' })
    loadCatalog()
  }

  async function addPhotoToExisting(itemId: string, file: File) {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const dataUrl = reader.result as string
      const result = await analyzePhoto(base64)

      const item = items.find(i => i.id === itemId)
      const newPhotos = [...(item?.photos || []), {
        url: dataUrl,
        view: 'autre',
        description: result.description || 'Vue additionnelle',
      }]
      await supabase.from('rag_equipment_catalog').update({ photos: newPhotos }).eq('id', itemId)
      loadCatalog()
    }
    reader.readAsDataURL(file)
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
    return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="p-6 max-w-6xl overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Package size={20} />
          Catalogue équipements ({items.length})
        </h1>
        <button onClick={() => firstPhotoRef.current?.click()} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
          <Plus size={14} /> Ajouter (photo)
        </button>
        <input ref={firstPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleFirstPhoto} />
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-6 bg-white rounded-xl border border-border p-5 space-y-4">
          {/* Photos avec descriptions */}
          <div className="space-y-3">
            {photoQueue.map((p, i) => (
              <div key={i} className="flex gap-3 items-start bg-gray-50 rounded-lg p-3">
                <div className="relative shrink-0">
                  <img src={p.url} alt="" className="w-24 h-24 object-cover rounded-lg border" />
                  <button onClick={() => setPhotoQueue(photoQueue.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={p.view}
                      onChange={e => setPhotoQueue(photoQueue.map((ph, j) => j === i ? { ...ph, view: e.target.value } : ph))}
                      className="px-2 py-1 border border-border rounded text-xs"
                    >
                      <option value="face">Face</option>
                      <option value="cote">Côté</option>
                      <option value="dessus">Dessus</option>
                      <option value="plaque">Plaque signalétique</option>
                      <option value="ecran">Écran / Coffret</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <textarea
                    value={p.description}
                    onChange={e => setPhotoQueue(photoQueue.map((ph, j) => j === i ? { ...ph, description: e.target.value } : ph))}
                    className="w-full px-2 py-1.5 border border-border rounded text-xs resize-none"
                    rows={2}
                    placeholder="Description de cette vue..."
                  />
                </div>
              </div>
            ))}

            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-text-muted p-3 bg-blue-50 rounded-lg">
                <Loader size={16} className="animate-spin" />
                Analyse de la photo en cours...
              </div>
            )}

            <button
              onClick={() => addPhotoRef.current?.click()}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-lg text-text-muted hover:border-primary hover:text-primary text-sm disabled:opacity-50"
            >
              <Camera size={16} /> Ajouter une autre vue
            </button>
            <input ref={addPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
          </div>

          {/* Champs identification */}
          {!analyzing && photoQueue.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Marque</label>
                  <input value={newItem.brand} onChange={e => setNewItem({ ...newItem, brand: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Poolex" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Modèle</label>
                  <input value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Variline VP WiFi" />
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
                    <option>Coffret de commande</option>
                    <option>Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Traits visuels distinctifs</label>
                  <input value={newItem.visual_traits} onChange={e => setNewItem({ ...newItem, visual_traits: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Logo jaune, coffret digital..." />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveItem} disabled={!newItem.brand || !newItem.model} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50">Enregistrer</button>
                <button onClick={() => { setAdding(false); setPhotoQueue([]) }} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un modèle..." className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm" />
      </div>

      {/* Catalog grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(item => (
          <div key={item.id} className="bg-white rounded-xl border border-border overflow-hidden group">
            {/* Photos */}
            {(item.photos?.length > 0 || item.photo_url) ? (
              <div className="relative">
                <div className="flex overflow-x-auto gap-0.5 snap-x">
                  {(item.photos?.length > 0 ? item.photos : [{ url: item.photo_url || '', view: 'face', description: '' }]).map((p, i) => (
                    <div key={i} className="min-w-full snap-center relative">
                      <img src={p.url} alt={p.view} className="w-full h-44 object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <span className="text-[10px] text-white/80 uppercase">{p.view}</span>
                        {p.description && <div className="text-[10px] text-white/70 truncate">{p.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <span className="absolute top-1 right-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">{item.photos?.length || 1} photo{(item.photos?.length || 1) > 1 ? 's' : ''}</span>
              </div>
            ) : (
              <div className="w-full h-44 bg-gray-100 flex items-center justify-center">
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
                <div className="flex items-center gap-1">
                  <label className="opacity-0 group-hover:opacity-100 cursor-pointer text-text-muted hover:text-primary" title="Ajouter une vue">
                    <Camera size={14} />
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) addPhotoToExisting(item.id, file)
                    }} />
                  </label>
                  <button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
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
