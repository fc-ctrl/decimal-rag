import { useState, useEffect } from 'react'
import ClientLoginPage from './ClientLoginPage'
import ClientDashboard from './ClientDashboard'
import ClientEquipment from './ClientEquipment'
import ClientChat from './ClientChat'
import ClientSav from './ClientSav'
import ClientCalculator from './ClientCalculator'

export default function ClientApp() {
  const [token, setToken] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [contactId, setContactId] = useState('')
  const [page, setPage] = useState('dashboard')

  useEffect(() => {
    const savedToken = localStorage.getItem('cosy_token')
    const savedName = localStorage.getItem('cosy_client_name')
    const savedContact = localStorage.getItem('cosy_contact_id')
    if (savedToken && savedName && savedContact) {
      setToken(savedToken)
      setClientName(savedName)
      setContactId(savedContact)
    }
  }, [])

  function handleLogin(t: string, name: string, cId: string) {
    setToken(t)
    setClientName(name)
    setContactId(cId)
    setPage('dashboard')
  }

  function handleLogout() {
    localStorage.removeItem('cosy_token')
    localStorage.removeItem('cosy_client_name')
    localStorage.removeItem('cosy_contact_id')
    setToken(null)
    setClientName('')
    setContactId('')
    setPage('dashboard')
  }

  if (!token) {
    return <ClientLoginPage onLogin={handleLogin} />
  }

  switch (page) {
    case 'chat':
      return <ClientChat clientName={clientName} contactId={contactId} onBack={() => setPage('dashboard')} />
    case 'equipment':
      return <ClientEquipment contactId={contactId} onBack={() => setPage('dashboard')} />
    case 'sav':
      return <ClientSav contactId={contactId} onBack={() => setPage('dashboard')} />
    case 'calculator':
      return <ClientCalculator contactId={contactId} onOpenChat={() => { setPage('chat') }} onBack={() => setPage('dashboard')} />
    default:
      return <ClientDashboard clientName={clientName} contactId={contactId} onNavigate={setPage} onLogout={handleLogout} />
  }
}
