// Domain types — camelCase to match v4 PWA. The API client converts the
// backend's snake_case envelopes into these shapes, so the rest of the app
// only ever touches camelCase keys.

export type FullTank = "yes" | "no";

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  model: string;
  createdAt?: string;
  updatedAt?: string;
}

export type VehicleCreate = {
  id?: string;
  name: string;
  plate: string;
  model: string;
};

export interface FuelRecord {
  id: string;
  vehicleId: string;
  /** YYYY-MM-DD or YYYY-MM-DDTHH:mm (datetime-local value). */
  recordDate: string;
  odometer: number | string;
  liters: number | string;
  price: number | string;
  /** Canonical total = liters × price. Server fills it on insert. */
  totalCost: number | string;
  /** What the gas-station pump display showed. Usually == totalCost. */
  pumpAmount: number | string | null;
  /** What the user actually paid (post-discount). Null = same as pumpAmount. */
  paidAmount: number | string | null;
  fullTank: FullTank;
  station: string;
  fuelType: string;
  note: string;
  /** True if the user noted the fuel-gauge low-fuel light was on at fill-up. */
  light: boolean;
  /** True when there were unrecorded fill-ups before this one. */
  skippedPrevious: boolean;
  createdAt?: string;
}

export type FuelRecordCreate = Omit<
  FuelRecord,
  "id" | "vehicleId" | "totalCost" | "createdAt"
> & { id?: string; light?: boolean };

/** Reminder trigger mode for a maintenance record. */
export type Trigger = "date" | "odo" | "either" | "none";

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  recordDate: string;
  odometer: number | string;
  /** Built-in preset key (oil / oilFilter / ...) or empty for custom. */
  maintType: string;
  /** User-supplied name; empty falls back to the preset's display name. */
  customName: string;
  item: string;
  cost: number | string;
  note: string;
  trigger: Trigger;
  nextDate: string | null;
  nextOdo: number | string | null;
  createdAt?: string;
}

export type MaintenanceCreate = Omit<
  MaintenanceRecord,
  "id" | "vehicleId" | "createdAt"
> & { id?: string };

export interface ExportPayload {
  version: string;
  exportedAt: string;
  vehicles: Vehicle[];
  records: FuelRecord[];
  maint: MaintenanceRecord[];
}