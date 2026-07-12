// Maps MAINT_PRESETS iconKey values to Lucide components.
// Kept in one place so maintenance pages don't each build their own map.

import {
  Droplets,
  CircleDot,
  Wind,
  Circle,
  Octagon,
  Thermometer,
  Cog,
  Zap,
  BatteryFull,
  SprayCan,
  Ruler,
  Wrench,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  droplets: Droplets,
  "circle-dot": CircleDot,
  wind: Wind,
  circle: Circle,
  octagon: Octagon,
  thermometer: Thermometer,
  cog: Cog,
  zap: Zap,
  "battery-full": BatteryFull,
  "spray-can": SprayCan,
  ruler: Ruler,
  wrench: Wrench,
};

interface Props extends LucideProps {
  name: string;
}

export function MaintIcon({ name, size = 20, strokeWidth = 1.5, ...rest }: Props) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon size={size} strokeWidth={strokeWidth} {...rest} />;
}