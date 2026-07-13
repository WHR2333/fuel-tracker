// Snake_case (backend) ↔ camelCase (frontend) conversions. The rest of the
// app is written against camelCase types, so we translate at the API boundary
// rather than rewriting every page to use snake_case.

import type {
  ExportPayload,
  FuelRecord,
  FuelRecordCreate,
  MaintenanceCreate,
  MaintenanceRecord,
  Vehicle,
  VehicleCreate,
  Trigger,
} from "./types";
import { getToken, clearToken } from "./auth";

const BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    // Token expired or invalid — clear and redirect to login
    clearToken();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.detail) detail = String(j.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- conversions ---

function vehicleFromApi(v: any): Vehicle {
  return {
    id: v.id,
    name: v.name,
    plate: v.plate,
    tank: v.tank,
    model: v.model,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  };
}

function vehicleToApi(v: VehicleCreate): any {
  return {
    id: v.id,
    name: v.name,
    plate: v.plate,
    tank: typeof v.tank === "string" ? parseFloat(v.tank) || 0 : v.tank,
    model: v.model,
  };
}

function recordFromApi(r: any): FuelRecord {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    recordDate: r.record_date,
    odometer: r.odometer,
    liters: r.liters,
    price: r.price,
    totalCost: r.total_cost,
    pumpAmount: r.pump_amount ?? null,
    paidAmount: r.paid_amount ?? null,
    fullTank: r.full_tank,
    station: r.station,
    fuelType: r.fuel_type,
    note: r.note,
    light: r.light === true || r.light === 1 || r.light === "1",
    skippedPrevious: r.skipped_previous === true || r.skipped_previous === 1 || r.skipped_previous === "1",
    createdAt: r.created_at,
  };
}

function recordToApi(r: FuelRecordCreate): any {
  return {
    record_date: r.recordDate?.slice(0, 10) ?? r.recordDate,
    odometer: typeof r.odometer === "string" ? parseFloat(r.odometer) || 0 : r.odometer,
    liters: typeof r.liters === "string" ? parseFloat(r.liters) || 0 : r.liters,
    price: typeof r.price === "string" ? parseFloat(r.price) || 0 : r.price,
    pump_amount: r.pumpAmount ?? undefined,
    paid_amount: r.paidAmount ?? undefined,
    full_tank: r.fullTank,
    station: r.station,
    fuel_type: r.fuelType,
    note: r.note,
    light: r.light === true,
    skipped_previous: r.skippedPrevious === true,
  };
}

function maintFromApi(m: any): MaintenanceRecord {
  return {
    id: m.id,
    vehicleId: m.vehicle_id,
    recordDate: m.record_date,
    odometer: m.odometer,
    maintType: m.maint_type,
    customName: m.custom_name ?? "",
    item: m.item,
    cost: m.cost,
    note: m.note,
    trigger: (m.trigger ?? "either") as Trigger,
    nextDate: m.next_date,
    nextOdo: m.next_odo,
    createdAt: m.created_at,
  };
}

function maintToApi(m: MaintenanceCreate): any {
  return {
    record_date: m.recordDate,
    odometer: typeof m.odometer === "string" ? parseFloat(m.odometer) || 0 : m.odometer,
    maint_type: m.maintType,
    custom_name: m.customName,
    item: m.item,
    cost: typeof m.cost === "string" ? parseFloat(m.cost) || 0 : m.cost,
    note: m.note,
    trigger: m.trigger,
    next_date: m.nextDate,
    next_odo: m.nextOdo,
  };
}

// --- Vehicles ---

export const vehicles = {
  list: async () => (await request<any[]>("GET", "/vehicles")).map(vehicleFromApi),
  get: async (id: string) => vehicleFromApi(await request<any>("GET", `/vehicles/${id}`)),
  create: async (v: VehicleCreate) => vehicleFromApi(await request<any>("POST", "/vehicles", vehicleToApi(v))),
  update: async (id: string, v: VehicleCreate) =>
    vehicleFromApi(await request<any>("PUT", `/vehicles/${id}`, vehicleToApi({ ...v, id }))),
  remove: async (id: string) => request<void>("DELETE", `/vehicles/${id}`),
  removeAll: async () => request<{ deleted: number }>("DELETE", "/vehicles"),
};

// --- Fuel records ---

export const records = {
  list: async (vid: string) =>
    (await request<any[]>("GET", `/vehicles/${vid}/records`)).map(recordFromApi),
  create: async (vid: string, r: FuelRecordCreate) =>
    recordFromApi(await request<any>("POST", `/vehicles/${vid}/records`, recordToApi(r))),
  update: async (rid: string, r: FuelRecordCreate) =>
    recordFromApi(await request<any>("PUT", `/records/${rid}`, recordToApi(r))),
  remove: async (rid: string) => request<void>("DELETE", `/records/${rid}`),
};

// --- Maintenance ---

export const maintenance = {
  list: async (vid: string) =>
    (await request<any[]>("GET", `/vehicles/${vid}/maintenance`)).map(maintFromApi),
  create: async (vid: string, m: MaintenanceCreate) =>
    maintFromApi(await request<any>("POST", `/vehicles/${vid}/maintenance`, maintToApi(m))),
  update: async (mid: string, m: MaintenanceCreate) =>
    maintFromApi(await request<any>("PUT", `/maintenance/${mid}`, maintToApi(m))),
  remove: async (mid: string) => request<void>("DELETE", `/maintenance/${mid}`),
};

// --- Analytics (monthly aggregate only; everything else is computed on the
//     frontend from `records.list` so we don't need a battery of endpoints) ---

export const analytics = {
  monthly: async (vid: string) =>
    request<{
      vehicle_id: string;
      overall_l_per_100km: number;
      overall_cost: number | string;
      total_distance: number | string;
      monthly: Array<{
        month: string;
        count: number;
        total_cost: number | string;
        total_fuel: number | string;
        distance: number | string;
        l_per_100km: number;
      }>;
    }>("GET", `/vehicles/${vid}/analytics`),
};

// --- Admin: full DB export + import for data portability ---

export const admin = {
  export: async (): Promise<ExportPayload> => {
    const data = await request<any>("GET", "/admin/export");
    return {
      version: data.version,
      exportedAt: data.exported_at,
      vehicles: (data.vehicles ?? []).map(vehicleFromApi),
      records: (data.records ?? []).map(recordFromApi),
      maint: (data.maint ?? []).map(maintFromApi),
    };
  },
  import: async (payload: ExportPayload) => {
    const body = {
      vehicles: payload.vehicles.map((v) => vehicleToApi(v)),
      records: payload.records.map((r) => ({
        id: r.id,
        vehicle_id: r.vehicleId,
        record_date: r.recordDate,
        odometer: typeof r.odometer === "string" ? parseFloat(r.odometer) || 0 : r.odometer,
        liters: typeof r.liters === "string" ? parseFloat(r.liters) || 0 : r.liters,
        price: typeof r.price === "string" ? parseFloat(r.price) || 0 : r.price,
        total_cost: typeof r.totalCost === "string" ? parseFloat(r.totalCost) || 0 : r.totalCost,
        pump_amount: r.pumpAmount ?? null,
        paid_amount: r.paidAmount ?? null,
        full_tank: r.fullTank,
        station: r.station,
        fuel_type: r.fuelType,
        note: r.note,
        light: r.light === true,
        skipped_previous: r.skippedPrevious === true,
      })),
      maint: payload.maint.map((m) => ({
        id: m.id,
        vehicle_id: m.vehicleId,
        record_date: m.recordDate,
        odometer: typeof m.odometer === "string" ? parseFloat(m.odometer) || 0 : m.odometer,
        maint_type: m.maintType,
        custom_name: m.customName,
        item: m.item,
        cost: typeof m.cost === "string" ? parseFloat(m.cost) || 0 : m.cost,
        note: m.note,
        trigger: m.trigger,
        next_date: m.nextDate,
        next_odo: m.nextOdo,
      })),
    };
    return request<{ vehicles: number; records: number; maint: number }>("POST", "/admin/import", body);
  },
};

// --- Users (admin) ---

export const users = {
  list: async () =>
    request<Array<{ id: string; username: string; is_admin: boolean }>>("GET", "/users"),
  create: async (username: string, password: string) =>
    request<{ id: string; username: string; is_admin: boolean }>("POST", "/users", { username, password }),
  remove: async (uid: string) => request<void>("DELETE", `/users/${uid}`),
  setPassword: async (uid: string, newPassword: string) =>
    request<{ detail: string }>(`PUT`, `/users/${uid}/password`, { new_password: newPassword }),
  changeMyPassword: async (oldPassword: string, newPassword: string) =>
    request<{ detail: string }>("PUT", "/auth/password", { old_password: oldPassword, new_password: newPassword }),
  verifyPassword: async (password: string) =>
    request<{ detail: string }>("POST", "/auth/verify-password", { password }),
};

// --- Health ---

export const meta = {
  health: async () => request<{ status: string; env: string }>("GET", "/health"),
};