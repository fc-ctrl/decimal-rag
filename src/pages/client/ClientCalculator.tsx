import WaterBalanceCalculator from '@/components/WaterBalanceCalculator'

interface Props {
  onOpenChat?: (message: string) => void
}

export default function ClientCalculator({ onOpenChat }: Props) {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <WaterBalanceCalculator showHistory onOpenChat={onOpenChat} />
    </div>
  )
}
