export interface EventTypeInfo {
  label: string;
  colorClass: string;
  activeColorClass: string;
  minimapClass: string;
  badgeClass: string;
  dotClass: string;
}

export function getEventTypeInfo(recordType: number): EventTypeInfo {
  switch (recordType) {
    case 1:
    case 13: // Smart PIR / Motion
      return {
        label: 'Motion',
        colorClass: 'bg-blue-500 hover:bg-blue-400 active:bg-blue-300',
        activeColorClass: 'bg-amber-400 ring-2 ring-amber-300 shadow-lg shadow-amber-500/50 z-20',
        minimapClass: 'bg-blue-500/80',
        badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800/60',
        dotClass: 'bg-blue-400',
      };
    case 2: // Sensor / Alarm
    case 3: // Motion | Alarm
    case 14: // Smart | Alarm
      return {
        label: 'Alarm',
        colorClass: 'bg-rose-500 hover:bg-rose-400 active:bg-rose-300',
        activeColorClass: 'bg-amber-400 ring-2 ring-amber-300 shadow-lg shadow-amber-500/50 z-20',
        minimapClass: 'bg-rose-500/90',
        badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/60',
        dotClass: 'bg-rose-500',
      };
    case 4: // Manual
      return {
        label: 'Manual',
        colorClass: 'bg-purple-500 hover:bg-purple-400 active:bg-purple-300',
        activeColorClass: 'bg-amber-400 ring-2 ring-amber-300 shadow-lg shadow-amber-500/50 z-20',
        minimapClass: 'bg-purple-400/90',
        badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
        dotClass: 'bg-purple-400',
      };
    default: // 0, Continuous / Scheduled
      return {
        label: 'Continuous',
        colorClass: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-300',
        activeColorClass: 'bg-amber-400 ring-2 ring-amber-300 shadow-lg shadow-amber-500/50 z-20',
        minimapClass: 'bg-emerald-500/80',
        badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
        dotClass: 'bg-emerald-400',
      };
  }
}
