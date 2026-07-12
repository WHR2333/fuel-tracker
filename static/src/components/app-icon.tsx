// Shared icon map for all EmptyState / card-title / button usages.
// All icons rendered with strokeWidth=1 for thin outline style.

import {
  Loader,
  Car,
  FileText,
  BarChart3,
  TrendingDown,
  DollarSign,
  TrendingUp,
  Calendar,
  CalendarDays,
  Store,
  BrainCircuit,
  RefreshCw,
  Clock,
  Wrench,
  Inbox,
  type LucideProps,
} from "lucide-react";

const MAP: Record<string, React.ComponentType<LucideProps>> = {
  loading: Loader,
  car: Car,
  file: FileText,
  chart: BarChart3,
  "trend-down": TrendingDown,
  money: DollarSign,
  "trend-up": TrendingUp,
  calendar: Calendar,
  "calendar-days": CalendarDays,
  store: Store,
  brain: BrainCircuit,
  refresh: RefreshCw,
  clock: Clock,
  wrench: Wrench,
  inbox: Inbox,
};

interface Props extends LucideProps {
  name: string;
}

export function AppIcon({ name, size = 20, strokeWidth = 1, ...rest }: Props) {
  const Icon = MAP[name] ?? Inbox;
  return <Icon size={size} strokeWidth={strokeWidth} fill="none" {...rest} />;
}

// Convenience wrappers — all at strokeWidth=1 for thin outline style.
export const iconLoading = () => <AppIcon name="loading" size={48} />;
export const iconCar = () => <AppIcon name="car" size={48} />;
export const iconFile = () => <AppIcon name="file" size={48} />;
export const iconChart = () => <AppIcon name="chart" size={48} />;
export const iconTrendDown = () => <AppIcon name="trend-down" size={48} />;
export const iconMoney = () => <AppIcon name="money" size={48} />;
export const iconTrendUp = () => <AppIcon name="trend-up" size={48} />;
export const iconCalendar = () => <AppIcon name="calendar" size={48} />;
export const iconStore = () => <AppIcon name="store" size={48} />;
export const iconBrain = () => <AppIcon name="brain" size={48} />;
export const iconInbox = () => <AppIcon name="inbox" size={48} />;
export const iconWrench = () => <AppIcon name="wrench" size={48} />;

// Card title helpers: small inline icon + text, all strokeWidth=1.
export function cardTitle(iconName: string, text: string) {
  return (
    <>
      <AppIcon name={iconName} size={16} />
      <span>{text}</span>
    </>
  );
}