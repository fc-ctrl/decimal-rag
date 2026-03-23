import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Camera, Loader, Search, Package, X } from 'lucide-react'

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
        chatInput: 'IGNORE TOUT CONTEXTE DOCUMENTAIRE. Base-toi UNIQUEMENT sur la photo.\nETAPE 1 — Lis CHAQUE texte visible sur l\'appareil (marque, modele, etiquettes, ecran). Si aucun texte n\'est visible, ecris "aucun texte visible".\nETAPE 2 — La MARQUE = texte du logo. Le MODELE = nom ecrit sur l\'appareil. Si aucun nom n\'est lisible, reponds "Non identifie". NE JAMAIS INVENTER un nom de modele.\nETAPE 3 — Classifier par ce que tu VOIS : Electrolyseur = cellule sel + sondes. PAC = gros boitier + ventilateur. Pompe filtration = moteur + turbine.\nReponds STRICTEMENT :\nMarque: [texte lu ou "Non identifie"]\nModele: [texte lu ou "Non identifie"]\nType: [type]\nTraits: [ce que tu vois]\nDescription: [description photo en 2-3 phrases]',
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ brand: '', model: '', type: '', visual_traits: '' })
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

  function startEdit(item: CatalogItem) {
    setEditingId(item.id)
    setEditData({ brand: item.brand, model: item.model, type: item.type, visual_traits: item.visual_traits || '' })
  }

  async function saveEdit() {
    if (!editingId) return
    await supabase.from('rag_equipment_catalog').update(editData).eq('id', editingId)
    setItems(items.map(i => i.id === editingId ? { ...i, ...editData } : i))
    setEditingId(null)
  }

  async function deletePhoto(itemId: string, photoIndex: number) {
    const item = items.find(i => i.id === itemId)
    if (!item?.photos) return
    const newPhotos = item.photos.filter((_, i) => i !== photoIndex)
    await supabase.from('rag_equipment_catalog').update({ photos: newPhotos, photo_url: newPhotos[0]?.url || null }).eq('id', itemId)
    setItems(items.map(i => i.id === itemId ? { ...i, photos: newPhotos, photo_url: newPhotos[0]?.url || null } : i))
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
        <div className="flex items-center gap-2">
          <button onClick={() => { setAdding(true); setNewItem({ brand: '', model: '', type: '', visual_traits: '' }); setPhotoQueue([]) }} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-gray-50">
            <Plus size={14} /> Ajouter manuel
          </button>
          <button onClick={() => firstPhotoRef.current?.click()} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
            <Camera size={14} /> Ajouter (photo)
          </button>
        </div>
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
          {!analyzing && (
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
          <div key={item.id} className="bg-white rounded-xl border border-border overflow-hidden group cursor-pointer hover:shadow-md transition-shadow" onClick={() => startEdit(item)}>
            {(item.photos?.length > 0 || item.photo_url) ? (
              <div className="relative">
                <img src={(item.photos?.[0] || { url: item.photo_url }).url} alt="" className="w-full h-44 object-cover" />
                {(item.photos?.length || 0) > 1 && <span className="absolute top-1 right-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">{item.photos?.length} photos</span>}
              </div>
            ) : (
              <div className="w-full h-44 bg-gray-100 flex items-center justify-center">
                <Camera size={32} className="text-gray-300" />
              </div>
            )}
            <div className="p-3">
              <div className="text-sm font-medium">{item.brand} {item.model}</div>
              <div className="text-xs text-text-muted">{item.type}</div>
              {item.visual_traits && <div className="text-xs text-text-muted mt-1 italic line-clamp-2">{item.visual_traits}</div>}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && !adding && (
        <div className="text-center py-12 text-text-muted text-sm">
          Aucun modèle dans le catalogue. Ajoutez-en un avec le bouton "Ajouter (photo)".
        </div>
      )}

      {/* Edit modal */}
      {editingId && (() => {
        const item = items.find(i => i.id === editingId)
        if (!item) return null
        const editPhotoRef = { current: null as HTMLInputElement | null }
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setEditingId(null) }}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h2 className="text-base font-semibold">{item.brand} {item.model}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => { deleteItem(item.id); setEditingId(null) }} className="text-xs text-danger hover:underline">Supprimer</button>
                  <button onClick={() => setEditingId(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={16} /></button>
                </div>
              </div>

              {/* Photos */}
              <div className="p-5 border-b border-border">
                <div className="text-xs font-medium text-text-muted mb-3">Photos ({item.photos?.length || 0})</div>
                <div className="space-y-3">
                  {(item.photos || []).map((p, i) => (
                    <div key={i} className="flex gap-3 items-start bg-gray-50 rounded-lg p-3 group/photo">
                      <div className="relative shrink-0">
                        <img src={p.url} alt={p.view} className="w-28 h-28 object-cover rounded-lg border" />
                        <button onClick={() => deletePhoto(item.id, i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover/photo:opacity-100 hover:bg-red-600">
                          <X size={10} />
                        </button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <select value={p.view} onChange={e => {
                          const newPhotos = [...(item.photos || [])]
                          newPhotos[i] = { ...newPhotos[i], view: e.target.value }
                          supabase.from('rag_equipment_catalog').update({ photos: newPhotos }).eq('id', item.id)
                          setItems(items.map(x => x.id === item.id ? { ...x, photos: newPhotos } : x))
                        }} className="px-2 py-1 border border-border rounded text-xs">
                          <option value="face">Face</option>
                          <option value="cote">Côté</option>
                          <option value="dessus">Dessus</option>
                          <option value="plaque">Plaque signalétique</option>
                          <option value="ecran">Écran / Coffret</option>
                          <option value="autre">Autre</option>
                        </select>
                        <textarea value={p.description} onChange={e => {
                          const newPhotos = [...(item.photos || [])]
                          newPhotos[i] = { ...newPhotos[i], description: e.target.value }
                          setItems(items.map(x => x.id === item.id ? { ...x, photos: newPhotos } : x))
                        }} onBlur={() => {
                          supabase.from('rag_equipment_catalog').update({ photos: item.photos }).eq('id', item.id)
                        }} className="w-full px-2 py-1.5 border border-border rounded text-xs resize-none" rows={2} placeholder="Description de cette vue..." />
                        <button onClick={async () => {
                          const base64 = p.url.split(',')[1]
                          if (!base64) return
                          const btn = document.activeElement as HTMLButtonElement
                          btn.textContent = 'Analyse...'
                          btn.disabled = true
                          const result = await analyzePhoto(base64)
                          const newPhotos = [...(item.photos || [])]
                          newPhotos[i] = { ...newPhotos[i], description: result.description || p.description }
                          await supabase.from('rag_equipment_catalog').update({ photos: newPhotos }).eq('id', item.id)
                          setItems(items.map(x => x.id === item.id ? { ...x, photos: newPhotos } : x))
                          btn.textContent = 'Analyser avec IA'
                          btn.disabled = false
                        }} className="text-[10px] px-2 py-1 border border-border rounded hover:bg-primary/10 hover:text-primary hover:border-primary">
                          Analyser avec IA
                        </button>
                      </div>
                    </div>
                  ))}
                  <label className="w-full py-4 border-2 border-dashed border-border rounded-lg flex items-center justify-center gap-2 text-text-muted hover:border-primary hover:text-primary cursor-pointer">
                    <Camera size={16} />
                    <span className="text-xs">Ajouter une photo</span>
                    <input ref={el => { editPhotoRef.current = el }} type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) { addPhotoToExisting(item.id, file); if (editPhotoRef.current) editPhotoRef.current.value = '' }
                    }} />
                  </label>
                </div>
              </div>

              {/* Fields */}
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Marque</label>
                    <input value={editData.brand} onChange={e => setEditData({ ...editData, brand: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Modèle</label>
                    <input value={editData.model} onChange={e => setEditData({ ...editData, model: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Type</label>
                  <select value={editData.type} onChange={e => setEditData({ ...editData, type: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
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
                  <textarea value={editData.visual_traits} onChange={e => setEditData({ ...editData, visual_traits: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none" rows={3} placeholder="Couleur, forme, détails qui permettent de distinguer ce modèle..." />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={saveEdit} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">Sauvegarder</button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50">Fermer</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
