import { useState, useEffect, useMemo } from 'react';
import { getSharedSocket, releaseSharedSocket } from '../socket';

export interface EVChargingStation {
  id: string; name: string; nameZh: string;
  intersectionId: string; zoneType: string;
  capacity: number; currentCars: number; queueLength: number;
  basePrice: number; currentPrice: number;
  solarDiscount: number; chargeRate: number;
  totalLoad: number; solarPowered: boolean;
}

export interface JointSnapshot {
  timestamp: string; simTime: string; simHour: number;
  totalVehicles: number; avgSpeed: number; congestionLevel: number;
  solarOutput: number; batterySoc: number; gridPrice: number;
  totalGridLoad: number; gridCarbonIntensity: number;
  stations: EVChargingStation[];
  totalEvLoad: number; evDemandFromCongestion: number;
  lyapunovCost: number; lyapunovCarbon: number; lyapunovDPP: number;
  fsmState: string; solarSurplus: boolean;
  notifyMessage: string | null; notifyMessageZh: string | null;
  priceHistory: { time: string; price: number; solar: number }[];
  evLoadHistory: { time: string; evLoad: number; congestion: number }[];
}

export function useJoint() {
  const [snapshot, setSnapshot] = useState<JointSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    const socket = getSharedSocket();
    const onData = (s: JointSnapshot) => {
      if (!cancelled) setSnapshot(s);
    };

    socket.on('joint:snapshot', onData);

    return () => {
      cancelled = true;
      socket.off('joint:snapshot', onData);
      releaseSharedSocket();
    };
  }, []);

  return useMemo(() => ({ snapshot }), [snapshot]);
}
