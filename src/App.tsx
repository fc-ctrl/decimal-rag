import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import LoginPage from '@/pages/LoginPage'
import ChatPage from '@/pages/ChatPage'
import DocumentsPage from '@/pages/DocumentsPage'
import SettingsPage from '@/pages/SettingsPage'
import HistoryPage from '@/pages/HistoryPage'
import CatalogPage from '@/pages/CatalogPage'
import ClientApp from '@/pages/client/ClientApp'
import PublicCalculatorPage from '@/pages/PublicCalculatorPage'
import { MessageSquare, FileText, Settings, LogOut, Brain, History, Package } from 'lucide-react'
import packageJson from '../package.json'

function Layout() {
  const { profile, signOut } = useAuth()

  const links = [
    { to: '/', icon: MessageSquare, label: 'Chat' },
    { to: '/documents', icon: FileText, label: 'Documents' },
    { to: '/history', icon: History, label: 'Historique' },
    { to: '/catalog', icon: Package, label: 'Catalogue' },
    { to: '/settings', icon: Settings, label: 'Paramètres' },
  ]

  return (
    <div className="flex flex-1">
      {/* Sidebar */}
      <nav className="w-14 bg-white border-r border-border flex flex-col items-center py-4 gap-1">
        <div className="flex flex-col items-center mb-4">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <span className="text-[9px] text-text-muted mt-0.5">v{packageJson.version}</span>
        </div>

        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                isActive ? 'bg-purple-100 text-primary' : 'text-text-muted hover:bg-gray-100'
              }`
            }
            title={link.label}
          >
            <link.icon size={20} />
          </NavLink>
        ))}

        <div className="mt-auto flex flex-col items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary" title={profile?.email || ''}>
            {(profile?.nom || profile?.email || '?')[0].toUpperCase()}
          </div>
          <button onClick={signOut} className="text-text-muted hover:text-danger" title="Déconnexion">
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 flex overflow-hidden">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!session) return <LoginPage />

  return <Layout />
}

function ClientRoute() {
  return <ClientApp />
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/outils/equilibre-eau" element={<PublicCalculatorPage />} />
        <Route path="/client/*" element={<ClientRoute />} />
        <Route path="/*" element={
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        } />
      </Routes>
    </BrowserRouter>
  )
}
