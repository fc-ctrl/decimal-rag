import { useState, useRef, useEffect } from 'react'
import { Send, ArrowLeft, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const CHAT_URL = 'https://n8n.decimal-ia.com/webhook/decimal-rag-chat'

interface Props {
  clientName: string
  contactId: string
  onBack: () => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Equipment {
  brand: string
  model: string
  type: string
}

export default function ClientChat({ clientName, contactId, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef('cosy-' + contactId + '-' + Date.now())

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    loadEquipment()
  }, [contactId])

  async function loadEquipment() {
    try {
      const { data } = await supabase
        .from('mat_parc_client')
        .select('produit_id, mat_produits!inner(marque, modele, mat_sous_categories!inner(nom))')
        .eq('client_airtable_id', contactId)
      if (data) {
        setEquipment(data.map((d: Record<string, unknown>) => {
          const prod = d.mat_produits as Record<string, unknown>
          const sc = prod?.mat_sous_categories as Record<string, unknown>
          return {
            brand: (prod?.marque || '') as string,
            model: (prod?.modele || '') as string,
            type: (sc?.nom || '') as string,
          }
        }))
      }
    } catch {}
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPendingImage((reader.result as string).split(',')[1])
      setImagePreview(reader.result as string)
      if (!input.trim()) setInput('Quel est ce matériel et comment puis-je le dépanner ?')
    }
    reader.readAsDataURL(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  async function sendMessage() {
    if ((!input.trim() && !pendingImage) || sending) return

    const userContent = pendingImage ? `📷 ${input}` : input
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: userContent }
    setMessages(m => [...m, userMsg])

    const imageData = pendingImage
    setInput('')
    setPendingImage(null)
    setImagePreview(null)
    setSending(true)

    try {
      // Build context with client equipment
      let equipCtx = ''
      if (equipment.length > 0) {
        equipCtx = '\n\n[MATERIEL DU CLIENT]\n' + equipment.map(e => `- ${e.brand} ${e.model} (${e.type})`).join('\n')
      }

      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatInput: input + equipCtx,
          sessionId: sessionId.current,
          ...(imageData ? { image: imageData } : {}),
        }),
      })
      const data = await res.json()
      const answer = data.output || data.answer || 'Désolé, je n\'ai pas pu répondre.'

      // Typing effect
      const msgId = crypto.randomUUID()
      setMessages(m => [...m, { id: msgId, role: 'assistant', content: '' }])
      const words = answer.split(/(\s+)/)
      let displayed = ''
      for (const word of words) {
        displayed += word
        const snap = displayed
        setMessages(m => m.map(msg => msg.id === msgId ? { ...msg, content: snap } : msg))
        if (word.trim()) await new Promise(r => setTimeout(r, 15))
      }
    } catch {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', content: 'Erreur de connexion.' }])
    }
    setSending(false)
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      <header className="bg-sky-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack}><ArrowLeft size={20} /></button>
        <div>
          <div className="text-sm font-medium">Chat SAV</div>
          <div className="text-xs text-sky-200">{clientName}</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-16 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <MessageIcon />
            <p className="text-sm mt-2">Posez votre question ou envoyez une photo</p>
            {equipment.length > 0 && (
              <p className="text-xs mt-1">Votre matériel : {equipment.map(e => `${e.brand} ${e.model}`).join(', ')}</p>
            )}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-sky-600 text-white' : 'bg-white border border-gray-200'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content.split(/(https?:\/\/[^\s\]]+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">{part}</a>
                ) : part
              )}</div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 sm:px-8 lg:px-16 py-3 border-t border-gray-200 bg-white">
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2">
            <img src={imagePreview} alt="Photo" className="w-12 h-12 object-cover rounded-lg border" />
            <span className="text-xs text-gray-400">Photo prête</span>
            <button onClick={() => { setPendingImage(null); setImagePreview(null) }} className="text-xs text-red-500">Retirer</button>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => photoRef.current?.click()} disabled={sending} className="px-3 py-2 border border-gray-200 rounded-xl text-gray-400 hover:text-sky-600">
            <Camera size={18} />
          </button>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Décrivez votre problème..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            disabled={sending}
          />
          <button onClick={sendMessage} disabled={sending || (!input.trim() && !pendingImage)} className="px-3 py-2 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageIcon() {
  return <svg className="mx-auto w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
}
