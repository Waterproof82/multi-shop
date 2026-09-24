export interface LandingBypassSignals {
  hasMesaParam: boolean;
  isWaiterMode: boolean;
  isPedidosSubdomain: boolean;
}

export function shouldBypassLanding(signals: LandingBypassSignals): boolean {
  return signals.hasMesaParam || signals.isWaiterMode || signals.isPedidosSubdomain;
}
