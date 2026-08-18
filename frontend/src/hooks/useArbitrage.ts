import { useState, useEffect, useCallback, useRef } from 'react'
import { getSharedSocket, releaseSharedSocket, getExistingSocket } from '../socket'
import type { ArbitrageSnapshot } from '../../../shared/types/arbitrage'

interface UseArbitrageReturn {
  snapshot: ArbitrageSnapshot | null
  isActive: boolean
  toggleActive: () => void
  isLoading: boolean
}

export function useArbitrage(): UseArbitrageReturn {
  const [snapshot, setSnapshot] = useState<ArbitrageSnapshot | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const socket = getSharedSocket()

    const handler = (data: ArbitrageSnapshot) => {
      if (mountedRef.current) {
        setSnapshot(data)
        setIsLoading(false)
      }
    }

    socket.on('arbitrage:snapshot', handler)
    socket.emit('arbitrage:get_state')

    return () => {
      mountedRef.current = false
      socket.off('arbitrage:snapshot', handler)
      releaseSharedSocket()
    }
  }, [])

  const toggleActive = useCallback(() => {
    setIsActive(prev => {
      const next = !prev
      const socket = getExistingSocket()
      if (socket?.connected) {
        socket.emit('arbitrage:toggle', { active: next })
      }
      return next
    })
  }, [])

  return { snapshot, isActive, toggleActive, isLoading }
}
