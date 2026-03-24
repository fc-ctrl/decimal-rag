import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Camera, ArrowLeft, Loader, List, Package, Calendar, MapPin, Shield, FileText, ChevronDown } from 'lucide-react'

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

interface Props {
  contactId: string
  onBack: () => void
}

interface Equipment {
  id: string
  marque: string
  modele: string
  sous_categorie: string
  famille: string
  numero_serie: string | null
  date_installation: string | null
  garantie_fin: string | null
  statut: string | null
  emplacement: string | null
  notes: string | null
  photo_url: string | null
  // RAG catalog info (if linked)
  notice_url: string | null
  links: { label: string; url: string; type: string }[]
  topics: { label: string; description: string; guide_url: string | null }[]
}

interface CatalogItem {
  id: string
  brand: string
  model: string
  type: string
  visual_traits: string | null
}

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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<null | 'photo' | 'list'>(null)
  const [identifying, setIdentifying] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [identification, setIdentification] = useState<{ brand: string; model: string; type: string } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [contactId])

  async function loadData() {
    // Load equipment from back-office table with joins
    const { data: eqData } = await supabase.rpc('get_client_equipment_with_rag', { p_contact_id: contactId })

    // Fallback: direct query if RPC doesn't exist
    if (!eqData) {
      const { data } = await supabase
        .from('mat_parc_client')
        .select(`
          id, numero_serie, date_installation, garantie_fin, statut, emplacement, notes, photo_url,
          mat_produits!inner(marque, modele, sous_categorie_id,
            mat_sous_categories!inner(nom,
              mat_familles!inner(nom)
            )
          )
        `)
        .eq('client_airtable_id', contactId)
      if (data) {
        const mapped = data.map((d: Record<string, unknown>) => {
          const prod = d.mat_produits as Record<string, unknown>
          const sc = prod?.mat_sous_categories as Record<string, unknown>
          const fam = sc?.mat_familles as Record<string, unknown>
          return {
            id: d.id as string,
            marque: (prod?.marque || '') as string,
            modele: (prod?.modele || '') as string,
            sous_categorie: (sc?.nom || '') as string,
            famille: (fam?.nom || '') as string,
            numero_serie: d.numero_serie as string | null,
            date_installation: d.date_installation as string | null,
            garantie_fin: d.garantie_fin as string | null,
            statut: d.statut as string | null,
            emplacement: d.emplacement as string | null,
            notes: d.notes as string | null,
            photo_url: d.photo_url as string | null,
            notice_url: null, links: [], topics: [],
          }
        })
        setEquipment(mapped)

        // Try to match with RAG catalog for extra info
        const { data: catData } = await supabase.from('rag_equipment_catalog').select('brand, model, notice_url, links, topics')
        if (catData) {
          setEquipment(mapped.map(eq => {
            const match = catData.find((c: Record<string, unknown>) =>
              (c.model as string).toLowerCase().includes(eq.modele.toLowerCase()) ||
              eq.modele.toLowerCase().includes((c.model as string).toLowerCase())
            )
            if (match) {
              return { ...eq, notice_url: match.notice_url as string | null, links: (match.links || []) as Equipment['links'], topics: (match.topics || []) as Equipment['topics'] }
            }
            return eq
          }))
        }
      }
    } else {
      setEquipment(eqData)
    }

    const { data: catRes } = await supabase.from('rag_equipment_catalog').select('id, brand, model, type, visual_traits').order('type, brand, model')
    setCatalog(catRes || [])
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
      const catalogContext = catalog.map(c => `- ${c.brand} ${c.model} (${c.type})${c.visual_traits ? ' : ' + c.visual_traits : ''}`).join('\n')
      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatInput: `Identifie cet equipement en le comparant UNIQUEMENT avec cette liste. Si aucun match, reponds "Non repertorie".\n\nCATALOGUE:\n${catalogContext}\n\nReponds:\nMarque: [marque]\nModele: [modele]\nType: [type]`,
            sessionId: 'eq-id-' + Date.now(),
            image: base64,
          }),
        })
        const data = await res.json()
        const answer = data.output || data.answer || ''
        const get = (key: string) => answer.match(new RegExp(`${key}\\s*:\\s*(.+?)(?:\\n|$)`, 'i'))?.[1]?.trim() || ''
        const match = catalog.find(c => c.model.toLowerCase().includes(get('Mod[eè]le').toLowerCase()))
        setIdentification({ brand: match?.brand || get('Marque'), model: match?.model || get('Mod[eè]le'), type: match?.type || get('Type') })
      } catch {
        setIdentification({ brand: 'Non identifié', model: 'Non identifié', type: '' })
      }
      setIdentifying(false)
    }
    reader.readAsDataURL(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  function selectFromCatalog(item: CatalogItem) {
    setIdentification({ brand: item.brand, model: item.model, type: item.type })
    setAddMode('photo')
  }

  // Group by famille
  const grouped = equipment.reduce((acc, eq) => {
    const f = eq.famille || 'Autre'
    if (!acc[f]) acc[f] = []
    acc[f].push(eq)
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
            <button onClick={() => photoRef.current?.click()} className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-sky-300 rounded-xl text-sky-600 hover:bg-sky-50">
              <Camera size={24} /><span className="text-xs font-medium">Prendre une photo</span>
            </button>
            <button onClick={() => setAddMode('list')} className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-sky-300 rounded-xl text-sky-600 hover:bg-sky-50">
              <List size={24} /><span className="text-xs font-medium">Choisir dans la liste</span>
            </button>
          </div>
        )}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

        {/* List selector */}
        {addMode === 'list' && !identification && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Choisir un équipement</h3>
              <button onClick={() => setAddMode(null)} className="text-xs text-gray-400">Annuler</button>
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {Object.entries(catalog.reduce((acc, c) => { if (!acc[c.type]) acc[c.type] = []; acc[c.type].push(c); return acc }, {} as Record<string, CatalogItem[]>)).map(([type, items]) => (
                <div key={type}>
                  <div className="text-[10px] text-gray-400 font-semibold uppercase px-2 pt-2 pb-1">{typeIcon(type)} {type}</div>
                  {items.map(item => (
                    <button key={item.id} onClick={() => selectFromCatalog(item)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sky-50 rounded-lg text-left">
                      <div className="text-sm font-medium">{item.brand} {item.model}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo / Confirmation */}
        {addMode === 'photo' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {preview && <img src={preview} alt="" className="w-full h-48 object-cover rounded-lg" />}
            {identifying ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader size={16} className="animate-spin" /> Identification en cours...</div>
            ) : identification ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] text-gray-400">Type</div><div className="text-sm font-medium">{identification.type}</div></div>
                  <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] text-gray-400">Marque</div><div className="text-sm font-medium">{identification.brand}</div></div>
                  <div className="bg-gray-50 rounded-lg p-3"><div className="text-[10px] text-gray-400">Modèle</div><div className="text-sm font-medium">{identification.model}</div></div>
                </div>
                <p className="text-xs text-gray-400">Pour ajouter cet équipement à votre fiche, contactez votre magasin Cosy Piscine.</p>
                <button onClick={() => { setAddMode(null); setPreview(null); setIdentification(null) }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Fermer</button>
              </div>
            ) : null}
          </div>
        )}

        {/* Equipment list */}
        {loading ? (
          <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : equipment.length === 0 && !addMode ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucun équipement enregistré. Contactez votre magasin Cosy Piscine.</p>
        ) : (
          Object.entries(grouped).map(([famille, items]) => (
            <div key={famille}>
              <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{typeIcon(famille)} {famille}</h3>
              <div className="space-y-2">
                {items.map(eq => {
                  const isExpanded = expandedId === eq.id
                  return (
                    <div key={eq.id} className={`bg-white rounded-xl border transition-all ${isExpanded ? 'border-sky-300 shadow-md' : 'border-gray-200'}`}>
                      <button onClick={() => setExpandedId(isExpanded ? null : eq.id)} className="w-full flex items-center gap-4 p-4 text-left">
                        <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center text-lg">{typeIcon(eq.sous_categorie)}</div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{eq.marque} — {eq.modele}</div>
                          <div className="text-xs text-gray-400">{eq.famille} › {eq.sous_categorie}</div>
                        </div>
                        {eq.numero_serie && <span className="text-[10px] text-gray-400 hidden sm:block">S/N: {eq.numero_serie}</span>}
                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                          {/* Details */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {eq.numero_serie && (
                              <div className="bg-gray-50 rounded-lg p-2"><div className="text-[9px] text-gray-400">N° de série</div><div className="text-xs font-medium">{eq.numero_serie}</div></div>
                            )}
                            {eq.date_installation && (
                              <div className="bg-gray-50 rounded-lg p-2"><div className="text-[9px] text-gray-400 flex items-center gap-1"><Calendar size={9} /> Installation</div><div className="text-xs font-medium">{new Date(eq.date_installation).toLocaleDateString('fr-FR')}</div></div>
                            )}
                            {eq.garantie_fin && (
                              <div className="bg-gray-50 rounded-lg p-2"><div className="text-[9px] text-gray-400 flex items-center gap-1"><Shield size={9} /> Garantie</div><div className="text-xs font-medium">Jusqu'au {new Date(eq.garantie_fin).toLocaleDateString('fr-FR')}</div></div>
                            )}
                            {eq.emplacement && (
                              <div className="bg-gray-50 rounded-lg p-2"><div className="text-[9px] text-gray-400 flex items-center gap-1"><MapPin size={9} /> Emplacement</div><div className="text-xs font-medium">{eq.emplacement}</div></div>
                            )}
                          </div>
                          {eq.statut && (
                            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${eq.statut === 'en_service' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {eq.statut === 'en_service' ? '✓ En service' : eq.statut}
                            </span>
                          )}
                          {eq.notes && <p className="text-xs text-gray-500 italic">{eq.notes}</p>}

                          {/* RAG info */}
                          {eq.notice_url && (
                            <a href={eq.notice_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-sky-600 hover:underline">
                              <FileText size={14} /> Notice PDF
                            </a>
                          )}
                          {eq.links.length > 0 && (
                            <div>
                              <div className="text-[10px] text-gray-400 mb-1">Guides disponibles :</div>
                              <div className="flex flex-wrap gap-1">
                                {eq.links.map((l, i) => (
                                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 bg-sky-50 text-sky-600 rounded-full hover:bg-sky-100">{l.label}</a>
                                ))}
                              </div>
                            </div>
                          )}
                          {eq.topics.length > 0 && (
                            <div>
                              <div className="text-[10px] text-gray-400 mb-1">Sujets fréquents :</div>
                              <div className="space-y-1">
                                {eq.topics.map((t, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-medium">{t.label}</span>
                                    <span className="text-gray-400"> — {t.description}</span>
                                    {t.guide_url && <a href={t.guide_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-sky-500 hover:underline">Guide →</a>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
