/**
 * Non-CSS theme concerns: icon mapping (spec 3.5) and the single named class
 * that activates the Command Center dark scope. Keeping this name in one
 * place means only one file needs to change if the product ever reverses
 * this decision back to full light, per spec 2.1.
 */
import {
  LayoutDashboard, Activity, Map, RadioTower, MapPin, Users,
  ReceiptIndianRupee, BrainCircuit, BellRing, Waves, Settings, Plug,
  ShieldCheck, Database, Gauge, Radio, Wifi, BatteryMedium,
} from 'lucide-react';

export const CORTEX_ICONS = {
  dashboard: LayoutDashboard,
  commandCenter: Activity,
  gis: Map,
  networkExplorer: RadioTower,
  gatewayPlacement: MapPin,
  households: Users,
  billing: ReceiptIndianRupee,
  aiAnalysis: BrainCircuit,
  alarms: BellRing,
  hydraulic: Waves,
  settings: Settings,
  integration: Plug,
  usersRoles: ShieldCheck,
  telemetry: Database,
  meter: Gauge,
  gateway: Radio,
  signal: Wifi,
  battery: BatteryMedium,
} as const;

/** Applied ONLY around <CommandCenterPage/>'s route element. See router.tsx. */
export const COMMAND_CENTER_DARK_SCOPE_CLASS = 'cw-scope-dark';
