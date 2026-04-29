/**
 * Implémentation minimale d'un client Prisma-like, backée par mock-store.
 * Couvre uniquement les opérations utilisées dans l'app.
 */
import { mockStore } from "./mock-store";

type AnyRecord = Record<string, unknown>;

function matchValue(value: unknown, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (condition === null) return value === null;
  if (typeof condition !== "object") return value === condition;

  // Opérateurs
  const cond = condition as AnyRecord;
  if ("equals" in cond) return value === cond.equals;
  if ("in" in cond && Array.isArray(cond.in)) return cond.in.includes(value);
  if ("not" in cond) return value !== cond.not;
  if ("gte" in cond || "lte" in cond || "gt" in cond || "lt" in cond) {
    const v = value instanceof Date ? value.getTime() : (value as number);
    if ("gte" in cond) {
      const c = cond.gte instanceof Date ? cond.gte.getTime() : (cond.gte as number);
      if (!(v >= c)) return false;
    }
    if ("lte" in cond) {
      const c = cond.lte instanceof Date ? cond.lte.getTime() : (cond.lte as number);
      if (!(v <= c)) return false;
    }
    if ("gt" in cond) {
      const c = cond.gt instanceof Date ? cond.gt.getTime() : (cond.gt as number);
      if (!(v > c)) return false;
    }
    if ("lt" in cond) {
      const c = cond.lt instanceof Date ? cond.lt.getTime() : (cond.lt as number);
      if (!(v < c)) return false;
    }
    return true;
  }
  return false;
}

function matchWhere(item: AnyRecord, where: AnyRecord | undefined): boolean {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    if (!matchValue(item[key], where[key])) return false;
  }
  return true;
}

function applySelect<T extends AnyRecord>(
  item: T,
  select: AnyRecord | undefined
): AnyRecord {
  if (!select) return { ...item };
  const out: AnyRecord = {};
  for (const k of Object.keys(select)) {
    if (select[k]) out[k] = (item as AnyRecord)[k];
  }
  return out;
}

function applyOrderBy<T extends AnyRecord>(
  items: T[],
  orderBy: AnyRecord | AnyRecord[] | undefined
): T[] {
  if (!orderBy) return items;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...items].sort((a, b) => {
    for (const o of orders) {
      for (const key of Object.keys(o)) {
        const dir = o[key] === "desc" ? -1 : 1;
        const va = (a as AnyRecord)[key];
        const vb = (b as AnyRecord)[key];
        if (va === vb) continue;
        if (va === null || va === undefined) return -1 * dir;
        if (vb === null || vb === undefined) return 1 * dir;
        if (va instanceof Date && vb instanceof Date) {
          return (va.getTime() - vb.getTime()) * dir;
        }
        if (typeof va === "boolean" && typeof vb === "boolean") {
          return (Number(vb) - Number(va)) * dir;
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
      }
    }
    return 0;
  });
}

type Includes = AnyRecord | undefined;

function applyInclude(item: AnyRecord, include: Includes): AnyRecord {
  if (!include) return item;
  const out = { ...item };
  if (include.employee) {
    const emp = mockStore.employees.find((e) => e.id === item.employeeId);
    if (emp) {
      out.employee = applySelect(
        emp,
        typeof include.employee === "object" && include.employee !== null
          ? ((include.employee as AnyRecord).select as AnyRecord)
          : undefined
      );
    }
  }
  return out;
}

// ─── Modèle générique ────────────────────────────────────────────

function makeModel<T extends AnyRecord & { id: string }>(
  collection: () => T[],
  setCollection: (items: T[]) => void,
  prefix: string
) {
  return {
    findMany: async (opts?: {
      where?: AnyRecord;
      orderBy?: AnyRecord | AnyRecord[];
      select?: AnyRecord;
      include?: AnyRecord;
    }) => {
      const items = collection().filter((i) => matchWhere(i, opts?.where));
      const ordered = applyOrderBy(items, opts?.orderBy);
      return ordered.map((i) => {
        const withInc = applyInclude(i, opts?.include);
        return opts?.select ? applySelect(withInc, opts.select) : withInc;
      });
    },
    findFirst: async (opts?: {
      where?: AnyRecord;
      select?: AnyRecord;
      include?: AnyRecord;
    }) => {
      const item = collection().find((i) => matchWhere(i, opts?.where));
      if (!item) return null;
      const withInc = applyInclude(item, opts?.include);
      return opts?.select ? applySelect(withInc, opts.select) : withInc;
    },
    findUnique: async (opts: {
      where: AnyRecord;
      select?: AnyRecord;
      include?: AnyRecord;
    }) => {
      const item = collection().find((i) => matchWhere(i, opts.where));
      if (!item) return null;
      const withInc = applyInclude(item, opts.include);
      return opts.select ? applySelect(withInc, opts.select) : withInc;
    },
    create: async (opts: { data: AnyRecord }) => {
      const now = new Date();
      const item = {
        id: opts.data.id ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
        ...opts.data,
      } as unknown as T;
      collection().push(item);
      return item;
    },
    createMany: async (opts: { data: AnyRecord[] }) => {
      const now = new Date();
      const items = opts.data.map(
        (d) =>
          ({
            id: d.id ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: now,
            updatedAt: now,
            ...d,
          }) as unknown as T
      );
      const list = collection();
      items.forEach((i) => list.push(i));
      return { count: items.length };
    },
    update: async (opts: { where: AnyRecord; data: AnyRecord }) => {
      const list = collection();
      const idx = list.findIndex((i) => matchWhere(i, opts.where));
      if (idx === -1) throw new Error(`Record not found in ${prefix}`);
      list[idx] = { ...list[idx], ...opts.data, updatedAt: new Date() };
      return list[idx];
    },
    updateMany: async (opts: { where: AnyRecord; data: AnyRecord }) => {
      const list = collection();
      let count = 0;
      list.forEach((i, idx) => {
        if (matchWhere(i, opts.where)) {
          list[idx] = { ...i, ...opts.data, updatedAt: new Date() };
          count++;
        }
      });
      return { count };
    },
    upsert: async (opts: {
      where: AnyRecord;
      create: AnyRecord;
      update: AnyRecord;
    }) => {
      const list = collection();
      // Le where pour un upsert sur clé composite ressemble à
      // { employeeId_date_timeSlot: { employeeId, date, timeSlot } }
      const compoundKey = Object.keys(opts.where)[0];
      const compoundValue = opts.where[compoundKey] as AnyRecord;
      const idx = list.findIndex((i) => matchWhere(i, compoundValue));
      const now = new Date();
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...opts.update, updatedAt: now };
        return list[idx];
      }
      const item = {
        id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
        ...opts.create,
      } as unknown as T;
      list.push(item);
      return item;
    },
    delete: async (opts: { where: AnyRecord }) => {
      const list = collection();
      const idx = list.findIndex((i) => matchWhere(i, opts.where));
      if (idx === -1) throw new Error(`Record not found in ${prefix}`);
      const [removed] = list.splice(idx, 1);
      return removed;
    },
    deleteMany: async (opts?: { where?: AnyRecord }) => {
      const before = collection().length;
      const remaining = collection().filter((i) => !matchWhere(i, opts?.where));
      setCollection(remaining as T[]);
      return { count: before - remaining.length };
    },
    count: async (opts?: { where?: AnyRecord }) => {
      return collection().filter((i) => matchWhere(i, opts?.where)).length;
    },
  };
}

// ─── Instanciation des modèles ───────────────────────────────────

export function createMockPrisma() {
  return {
    pharmacy: makeModel(
      () => mockStore.pharmacies,
      (v) => (mockStore.pharmacies = v as typeof mockStore.pharmacies),
      "pharm"
    ),
    employee: makeModel(
      () => mockStore.employees,
      (v) => (mockStore.employees = v as typeof mockStore.employees),
      "emp"
    ),
    user: makeModel(
      () => mockStore.users,
      (v) => (mockStore.users = v as typeof mockStore.users),
      "user"
    ),
    scheduleEntry: makeModel(
      () => mockStore.scheduleEntries,
      (v) => (mockStore.scheduleEntries = v as typeof mockStore.scheduleEntries),
      "se"
    ),
    absenceRequest: makeModel(
      () => mockStore.absenceRequests,
      (v) => (mockStore.absenceRequests = v as typeof mockStore.absenceRequests),
      "ar"
    ),
    weekTemplate: makeModel(
      () => mockStore.weekTemplates as unknown as Array<AnyRecord & { id: string }>,
      (v) => (mockStore.weekTemplates = v),
      "wt"
    ),
    weekTemplateEntry: makeModel(
      () => mockStore.weekTemplateEntries as unknown as Array<AnyRecord & { id: string }>,
      (v) => (mockStore.weekTemplateEntries = v),
      "wte"
    ),
    $transaction: async <T>(arg: Promise<T>[] | (() => Promise<T>)): Promise<T[] | T> => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg();
    },
    $disconnect: async () => undefined,
  };
}
