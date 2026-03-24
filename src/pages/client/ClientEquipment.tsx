import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Package, Calendar, MapPin, Shield, FileText, ChevronDown } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        // Load RAG catalog with linked_product_ids for exact matching
        const { data: catData } = await supabase.from('rag_equipment_catalog').select('linked_product_ids, notice_url, links, topics')

        const mapped = data.map((d: Record<string, unknown>) => {
          const prod = d.mat_produits as Record<string, unknown>
          const prodId = d.produit_id as string
          const sc = prod?.mat_sous_categories as Record<string, unknown>
          const fam = sc?.mat_familles as Record<string, unknown>

          // Match via linked_product_ids (exact link from back-office)
          let notice_url: string | null = null
          let links: Equipment['links'] = []
          let topics: Equipment['topics'] = []
          if (catData) {
            const match = catData.find((c: Record<string, unknown>) => {
              const ids = c.linked_product_ids as string[] | null
              return ids && ids.includes(prodId)
            })
            if (match) {
              notice_url = match.notice_url as string | null
              links = (match.links || []) as Equipment['links']
              topics = (match.topics || []) as Equipment['topics']
            }
          }

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
            notice_url, links, topics,
          }
        })
        setEquipment(mapped)
      }
    } else {
      setEquipment(eqData)
    }

    setLoading(false)
  }

  // Group by famille
  const grouped = equipment.reduce((acc, eq) => {
    const f = eq.famille || 'Autre'
    if (!acc[f]) acc[f] = []
    acc[f].push(eq)
    return acc
  }, {} as Record<string, Equipment[]>)

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-sky-200 hover:text-white"><ArrowLeft size={20} /></button>
        <Package size={20} />
        <div>
          <div className="text-sm font-medium">Mon matériel</div>
          <div className="text-xs text-sky-200">{equipment.length} équipement{equipment.length > 1 ? 's' : ''}</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* No self-add - contact store */}


        {/* Equipment list */}
        {loading ? (
          <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : equipment.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Package size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">Aucun équipement enregistré</p>
            <p className="text-xs text-gray-400 mt-2">Pour ajouter votre matériel, contactez votre magasin Cosy Piscine.</p>
          </div>
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
