import { useState } from 'react'

const AUTH_URL = 'https://n8n.decimal-ia.com/webhook/cosy-client-auth'

interface ClientLoginProps {
  onLogin: (token: string, clientName: string, contactId: string) => void
}

export default function ClientLoginPage({ onLogin }: ClientLoginProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('cosy_token', data.token)
        localStorage.setItem('cosy_client_name', data.clientName)
        localStorage.setItem('cosy_contact_id', data.contactId)
        onLogin(data.token, data.clientName, data.contactId)
      } else {
        setError(data.error || 'Connexion impossible.')
      }
    } catch {
      setError('Erreur de connexion au serveur.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Cosy Piscine</h1>
          <p className="text-sm text-gray-500 mt-1">Espace client — SAV & Assistance</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Votre adresse email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre.email@exemple.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-3 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Utilisez l'email associé à votre compte Cosy Piscine
        </p>
      </div>
    </div>
  )
}
