import WaterBalanceCalculator from '@/components/WaterBalanceCalculator'
import { Droplets } from 'lucide-react'

export default function PublicCalculatorPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Droplets size={18} className="text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold">Cosy Piscine</span>
              <span className="text-xs text-gray-400 ml-2">Outils</span>
            </div>
          </div>
          <a href="https://service.cosy-piscine.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
            Assistance Cosy Piscine →
          </a>
        </div>
      </header>

      {/* Calculator */}
      <div className="px-4 py-6">
        <WaterBalanceCalculator />
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-4 py-4 mt-8">
        <div className="max-w-3xl mx-auto text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Cosy Piscine — Assistance et outils pour votre piscine
        </div>
      </footer>
    </div>
  )
}
