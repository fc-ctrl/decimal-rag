import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Package, X, GripVertical } from 'lucide-react'

interface Product {
  id: string
  name: string
  description: string | null
  category: string
  image_url: string | null
  price: number | null
  unit: string
  linked_param: string | null
  active: boolean
  sort_order: number
}

interface Tip {
  id: string
  title: string
  content: string
  linked_param: string | null
  linked_situation: string | null
  product_id: string | null
  active: boolean
  sort_order: number
}

interface Situation {
  id: string
  slug: string
  label: string
  description: string | null
  icon: string
  product_ids: string[]
  guide_url: string | null
  active: boolean
  sort_order: number
}

const CATEGORIES = [
  { value: 'correction_ph', label: 'Correction pH' },
  { value: 'correction_tac', label: 'Correction TAC' },
  { value: 'correction_th', label: 'Correction TH' },
  { value: 'chlore', label: 'Chlore' },
  { value: 'sel', label: 'Sel' },
  { value: 'stabilisant', label: 'Stabilisant' },
  { value: 'complement', label: 'Complément' },
  { value: 'entretien', label: 'Entretien' },
]

const PARAMS = [
  { value: '', label: '— Aucun —' },
  { value: 'ph_plus', label: 'pH+ (augmenter)' },
  { value: 'ph_moins', label: 'pH- (diminuer)' },
  { value: 'tac_plus', label: 'TAC+' },
  { value: 'th_plus', label: 'TH+' },
  { value: 'chlore', label: 'Chlore' },
  { value: 'chlore_choc', label: 'Chlore choc' },
  { value: 'sel', label: 'Sel' },
  { value: 'stabilisant', label: 'Stabilisant' },
]

export default function ProductsPage() {
  const [tab, setTab] = useState<'products' | 'tips' | 'situations'>('products')
  const [products, setProducts] = useState<Product[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [situations, setSituations] = useState<Situation[]>([])
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null)
  const [editTip, setEditTip] = useState<Partial<Tip> | null>(null)
  const [editSituation, setEditSituation] = useState<Partial<Situation> | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [p, t, s] = await Promise.all([
      supabase.from('rag_products').select('*').order('sort_order'),
      supabase.from('rag_tips').select('*').order('sort_order'),
      supabase.from('rag_water_situations').select('*').order('sort_order'),
    ])
    setProducts(p.data || [])
    setTips(t.data || [])
    setSituations(s.data || [])
    setLoading(false)
  }

  // Product CRUD
  async function saveProduct() {
    if (!editProduct?.name) return
    if (editProduct.id) {
      await supabase.from('rag_products').update(editProduct).eq('id', editProduct.id)
    } else {
      await supabase.from('rag_products').insert(editProduct)
    }
    setEditProduct(null)
    loadAll()
  }

  async function deleteProduct(id: string) {
    if (!confirm('Supprimer ce produit ?')) return
    await supabase.from('rag_products').delete().eq('id', id)
    loadAll()
  }

  // Tip CRUD
  async function saveTip() {
    if (!editTip?.content) return
    if (editTip.id) {
      await supabase.from('rag_tips').update(editTip).eq('id', editTip.id)
    } else {
      await supabase.from('rag_tips').insert(editTip)
    }
    setEditTip(null)
    loadAll()
  }

  async function deleteTip(id: string) {
    if (!confirm('Supprimer ce tip ?')) return
    await supabase.from('rag_tips').delete().eq('id', id)
    loadAll()
  }

  // Situation CRUD
  async function saveSituation() {
    if (!editSituation?.label) return
    if (editSituation.id) {
      await supabase.from('rag_water_situations').update(editSituation).eq('id', editSituation.id)
    } else {
      await supabase.from('rag_water_situations').insert(editSituation)
    }
    setEditSituation(null)
    loadAll()
  }

  async function deleteSituation(id: string) {
    if (!confirm('Supprimer cette situation ?')) return
    await supabase.from('rag_water_situations').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>

  return (
    <div className="p-6 max-w-5xl overflow-y-auto h-full">
      <h1 className="text-lg font-semibold flex items-center gap-2 mb-4"><Package size={20} /> Produits & Conseils</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { key: 'products' as const, label: `Produits (${products.length})` },
          { key: 'tips' as const, label: `Tips (${tips.length})` },
          { key: 'situations' as const, label: `Situations (${situations.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Products tab */}
      {tab === 'products' && (
        <div>
          <button onClick={() => setEditProduct({ name: '', category: 'complement', unit: 'kg', active: true, sort_order: products.length })} className="mb-3 flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
            <Plus size={14} /> Ajouter un produit
          </button>
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg border border-border p-3 group">
                <GripVertical size={14} className="text-gray-300" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 rounded">{CATEGORIES.find(c => c.value === p.category)?.label}</span>
                    {p.linked_param && <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{p.linked_param}</span>}
                    {!p.active && <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Inactif</span>}
                  </div>
                  {p.description && <div className="text-xs text-gray-400 mt-0.5">{p.description}</div>}
                </div>
                {p.price && <span className="text-sm font-medium text-gray-600">{p.price}€/{p.unit}</span>}
                <button onClick={() => setEditProduct(p)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary text-xs">Modifier</button>
                <button onClick={() => deleteProduct(p.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips tab */}
      {tab === 'tips' && (
        <div>
          <button onClick={() => setEditTip({ title: 'Le saviez-vous ?', content: '', active: true, sort_order: tips.length })} className="mb-3 flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
            <Plus size={14} /> Ajouter un tip
          </button>
          <div className="space-y-2">
            {tips.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-white rounded-lg border border-border p-3 group">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">{t.title}</span>
                    {t.linked_param && <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{t.linked_param}</span>}
                    {t.linked_situation && <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{t.linked_situation}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{t.content}</div>
                </div>
                <button onClick={() => setEditTip(t)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary text-xs">Modifier</button>
                <button onClick={() => deleteTip(t.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Situations tab */}
      {tab === 'situations' && (
        <div>
          <button onClick={() => setEditSituation({ slug: '', label: '', icon: 'droplets', active: true, product_ids: [], sort_order: situations.length })} className="mb-3 flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
            <Plus size={14} /> Ajouter une situation
          </button>
          <div className="space-y-2">
            {situations.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-white rounded-lg border border-border p-3 group">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 rounded">{s.slug}</span>
                    {s.guide_url && <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded">Guide lié</span>}
                  </div>
                  {s.description && <div className="text-xs text-gray-400 mt-0.5">{s.description}</div>}
                  {s.product_ids.length > 0 && <div className="text-[10px] text-gray-400 mt-1">{s.product_ids.length} produit(s) associé(s)</div>}
                </div>
                <button onClick={() => setEditSituation(s)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary text-xs">Modifier</button>
                <button onClick={() => deleteSituation(s.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setEditProduct(null) }}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">{editProduct.id ? 'Modifier' : 'Ajouter'} un produit</h2>
              <button onClick={() => setEditProduct(null)}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Nom *</label><input value={editProduct.name || ''} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="text-xs text-gray-500">Description</label><textarea value={editProduct.description || ''} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Catégorie</label><select value={editProduct.category || ''} onChange={e => setEditProduct({ ...editProduct, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                <div><label className="text-xs text-gray-500">Paramètre lié</label><select value={editProduct.linked_param || ''} onChange={e => setEditProduct({ ...editProduct, linked_param: e.target.value || null })} className="w-full px-3 py-2 border rounded-lg text-sm">{PARAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500">Prix</label><input type="number" step="0.01" value={editProduct.price || ''} onChange={e => setEditProduct({ ...editProduct, price: +e.target.value || null })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="9.99" /></div>
                <div><label className="text-xs text-gray-500">Unité</label><select value={editProduct.unit || 'kg'} onChange={e => setEditProduct({ ...editProduct, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="kg">kg</option><option value="g">g</option><option value="l">l</option><option value="unité">unité</option></select></div>
                <div><label className="text-xs text-gray-500">Ordre</label><input type="number" value={editProduct.sort_order || 0} onChange={e => setEditProduct({ ...editProduct, sort_order: +e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editProduct.active ?? true} onChange={e => setEditProduct({ ...editProduct, active: e.target.checked })} className="accent-primary" /><span className="text-xs">Actif</span></label>
              <div className="flex gap-2 pt-2"><button onClick={saveProduct} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">Sauvegarder</button><button onClick={() => setEditProduct(null)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tip Modal */}
      {editTip && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setEditTip(null) }}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">{editTip.id ? 'Modifier' : 'Ajouter'} un tip</h2>
              <button onClick={() => setEditTip(null)}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Titre</label><input value={editTip.title || ''} onChange={e => setEditTip({ ...editTip, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Le saviez-vous ?" /></div>
              <div><label className="text-xs text-gray-500">Contenu *</label><textarea value={editTip.content || ''} onChange={e => setEditTip({ ...editTip, content: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Lié au paramètre</label><select value={editTip.linked_param || ''} onChange={e => setEditTip({ ...editTip, linked_param: e.target.value || null })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">— Tous —</option><option value="ph">pH</option><option value="tac">TAC</option><option value="th">TH</option><option value="chlore">Chlore</option><option value="stabilisant">Stabilisant</option><option value="sel">Sel</option></select></div>
                <div><label className="text-xs text-gray-500">Lié à la situation</label><select value={editTip.linked_situation || ''} onChange={e => setEditTip({ ...editTip, linked_situation: e.target.value || null })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">— Toutes —</option>{situations.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}</select></div>
              </div>
              <div className="flex gap-2 pt-2"><button onClick={saveTip} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">Sauvegarder</button><button onClick={() => setEditTip(null)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Situation Modal */}
      {editSituation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setEditSituation(null) }}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">{editSituation.id ? 'Modifier' : 'Ajouter'} une situation</h2>
              <button onClick={() => setEditSituation(null)}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Label *</label><input value={editSituation.label || ''} onChange={e => setEditSituation({ ...editSituation, label: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Mon eau est verte" /></div>
                <div><label className="text-xs text-gray-500">Slug *</label><input value={editSituation.slug || ''} onChange={e => setEditSituation({ ...editSituation, slug: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="eau_verte" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Description</label><textarea value={editSituation.description || ''} onChange={e => setEditSituation({ ...editSituation, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} /></div>
              <div><label className="text-xs text-gray-500">URL guide RAG</label><input value={editSituation.guide_url || ''} onChange={e => setEditSituation({ ...editSituation, guide_url: e.target.value || null })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://service.cosy-piscine.com/..." /></div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Produits associés</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {products.filter(p => p.active).map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-xs p-1 hover:bg-gray-50 rounded">
                      <input type="checkbox" checked={(editSituation.product_ids || []).includes(p.id)} onChange={e => {
                        const ids = [...(editSituation.product_ids || [])]
                        if (e.target.checked) ids.push(p.id); else ids.splice(ids.indexOf(p.id), 1)
                        setEditSituation({ ...editSituation, product_ids: ids })
                      }} className="accent-primary" />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2"><button onClick={saveSituation} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">Sauvegarder</button><button onClick={() => setEditSituation(null)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
