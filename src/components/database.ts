import Dexie from 'dexie';

export interface Schema {
  id?: string;
  name: string;
  description?: string;
  nodes: string; // JSON string de los nodos
  edges: string; // JSON string de las conexiones
  created_at?: string;
  created_by?: string;
  updated_by?: string;
  updated_at?: string;
  local?: boolean; // true = only stored in browser DB
  // browser-only flags
  synchronized?: boolean;
  hidden?: boolean;
}

export interface SvgElement {
  id?: string;
  name: string;
  description?: string;
  category?: string; // Categoría del elemento (ej: 'basic', 'custom', 'flowchart', etc.)
  svg: string; // SVG markup
  handles?: string; // JSON string of handles metadata
  created_at?: string;
  created_by?: string;
  updated_by?: string;
  updated_at?: string;
  local?: boolean;
  // browser-only flags
  synchronized?: boolean; 
  hidden?: boolean;
}

// Dexie (IndexedDB) backed implementation for browser
// Preserves the same exported API as before so other components don't need changes.

class DrawPakDB extends Dexie {
  schemas!: Dexie.Table<Schema, string>;
  svg_elements!: Dexie.Table<SvgElement, string>;

  constructor() {
    super('drawpak');
    // Legacy version (numeric autoincrement) - keep for compatibility
    this.version(1).stores({
      schemas: '++id,name,updated_at,local',
      svg_elements: '++id,name,category,updated_at,local'
    });

    // New version uses string UUID primary keys (id)
    this.version(2).stores({
      // Add synchronized and hidden to schemas index so local and remote columns align
      schemas: 'id,name,updated_at,local,synchronized,hidden',
      svg_elements: 'id,name,category,updated_at,local,synchronized,hidden'
    }).upgrade(async (tx) => {
      // Migrate any numeric or missing ids to UUID strings
      try {
        const sTable = tx.table('schemas') as Dexie.Table<Schema, string>;
        const eTable = tx.table('svg_elements') as Dexie.Table<SvgElement, string>;
        const schemas = await sTable.toArray();
  for (const s of schemas) {
          if (!s.id || typeof s.id === 'number') {
            const rnd = (typeof crypto !== 'undefined' ? (crypto as unknown as { randomUUID?: () => string }).randomUUID : undefined);
            const newId = typeof rnd === 'function' ? rnd() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            s.id = newId;
            await sTable.put(s);
          }
        }
        const svgs = await eTable.toArray();
        for (const e of svgs) {
          // ensure id exists and is a string
          if (!e.id || typeof e.id === 'number') {
            const rnd = (typeof crypto !== 'undefined' ? (crypto as unknown as { randomUUID?: () => string }).randomUUID : undefined);
            const newId = typeof rnd === 'function' ? rnd() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            e.id = newId;
          }
          // ensure new browser-only fields exist with defaults for svgs
          if (typeof e.synchronized !== 'boolean') e.synchronized = false;
          if (typeof e.hidden !== 'boolean') e.hidden = false;
          await eTable.put(e);
        }
        // ensure schemas rows also have the new browser-only fields
        for (const sRow of schemas) {
          const typed = sRow as Partial<Schema>;
          let changed = false;
          if (typeof typed.synchronized !== 'boolean') { typed.synchronized = false; changed = true; }
          if (typeof typed.hidden !== 'boolean') { typed.hidden = false; changed = true; }
          if (changed) await sTable.put(typed as Schema);
        }
      } catch (err) {
        console.warn('Dexie upgrade migration to UUID ids failed:', err);
      }
    });

    this.schemas = this.table('schemas');
    this.svg_elements = this.table('svg_elements');
  }
}

const db = new DrawPakDB();

// Simple in-memory inflight fetch cache for per-user library blob requests.
// Ensures multiple callers in the same tick reuse the same network request
// (helps prevent duplicate GET /api/user-library/:user on startup).
const _inflightUserLibraryFetches: Record<string, Promise<{ data: LibraryBlob; updated_at?: string } | null> | undefined> = {};

async function fetchUserLibraryOnce(username?: string | null) {
  const user = username || getStoredUsername();
  if (!user) return null;
  const existing = _inflightUserLibraryFetches[user];
  if (existing) return existing;
  const p = (async () => {
    try {
      const url = (typeof window !== 'undefined') ? new URL(`/api/user-library/${encodeURIComponent(user)}`, window.location.origin).toString() : `/api/user-library/${encodeURIComponent(user)}`;
      const resp = await fetch(url);
      if (resp.status === 404) return null;
      if (!resp.ok) return null;
      const json = await resp.json() as { data?: LibraryBlob; updated_at?: string; updatedAt?: string };
      return { data: json.data || { elements: [] }, updated_at: json.updated_at || json.updatedAt };
    } catch (err) {
      console.warn('fetchUserLibraryOnce failed', err);
      return null;
    }
  })();
  // store and ensure removal after settle so subsequent unrelated calls will refetch
  _inflightUserLibraryFetches[user] = p;
  void p.finally(() => { try { delete _inflightUserLibraryFetches[user]; } catch { /* ignore */ } });
  return p;
}

// Promise used to ensure only one seeding runs at a time in this page session.
let seedingPromise: Promise<void> | null = null;

function nowIso() { return new Date().toISOString(); }

// Robust parser for hidden-like values coming from server blobs.
// Accepts boolean, number (1/0), and string ('1'/'0'/'true'/'false') and
// returns a boolean. If value is undefined/null, returns undefined so callers
// can decide whether to apply a default.
function parseHidden(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === '1' || t === 'true') return true;
    if (t === '0' || t === 'false') return false;
    return undefined;
  }
  return undefined;
}

// Local library timestamp key (per username). Stored in localStorage.
const LOCAL_LIB_KEY_PREFIX = 'drawpak:user_library_updated_at';

function getStoredUsername(): string | null {
  try {
    return localStorage.getItem('dp_username') || localStorage.getItem('username') || null;
  } catch {
    return null;
  }
}

function libKeyFor(username?: string | null) {
  const user = username || getStoredUsername() || 'anon';
  return `${LOCAL_LIB_KEY_PREFIX}:${user}`;
}

export function getLocalLibraryUpdatedAt(username?: string | null): string | null {
  try {
    return localStorage.getItem(libKeyFor(username));
  } catch {
    return null;
  }
}

export function setLocalLibraryUpdatedAt(username?: string | null, ts?: string): void {
  try {
    const key = libKeyFor(username);
    const val = ts || nowIso();
    localStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

// Per-user schemas updated_at key (for coarse-grained reconciliation)
const LOCAL_SCHEMAS_KEY_PREFIX = 'drawpak:user_schemas_updated_at';

function schemasKeyFor(username?: string | null) {
  const user = username || getStoredUsername() || 'anon';
  return `${LOCAL_SCHEMAS_KEY_PREFIX}:${user}`;
}

export function getLocalSchemasUpdatedAt(username?: string | null): string | null {
  try {
    return localStorage.getItem(schemasKeyFor(username));
  } catch {
    return null;
  }
}

export function setLocalSchemasUpdatedAt(username?: string | null, ts?: string): void {
  try {
    const key = schemasKeyFor(username);
    const val = ts || nowIso();
    localStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

// Upload the full library (blob) to the backend for the given username.
export async function uploadUserLibrary(username?: string | null): Promise<boolean> {
  // Delegate to unified uploader that handles merging of elements and schemas
  return await uploadFullUserLibrary(username);
}

// Merge two library data blobs (preserve both elements and schemas keys). This is intentionally
// tolerant: if keys are missing, it will default to empty arrays. New data wins for overlapping
// items by id (using id field) when possible.
function mergeLibraryData(existing: Record<string, unknown> | null, incoming: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // version: take max or incoming
  out.version = incoming && incoming.version ? incoming.version : existing && existing.version ? existing.version : 1;

  // Merge elements (SVGs)
  const exElements = Array.isArray(existing?.['elements']) ? existing['elements'] as unknown[] : [];
  const inElements = Array.isArray(incoming?.['elements']) ? incoming['elements'] as unknown[] : [];
  if (exElements.length === 0 && inElements.length > 0) out.elements = inElements;
  else if (inElements.length === 0 && exElements.length > 0) out.elements = exElements;
  else {
    // Merge by id: shallow-merge incoming into existing (incoming overrides present keys)
    const map = new Map<string, Record<string, unknown>>();
    for (const e of exElements) {
      if (e && typeof e === 'object' && 'id' in (e as Record<string, unknown>)) map.set(String((e as Record<string, unknown>)['id']), e as Record<string, unknown>);
    }
    for (const e of inElements) {
      if (e && typeof e === 'object' && 'id' in (e as Record<string, unknown>)) {
        const id = String((e as Record<string, unknown>)['id']);
        const existingObj = map.get(id) || {};
  map.set(id, { ...existingObj, ... (e as Record<string, unknown>) });
      }
    }
    out['elements'] = Array.from(map.values());
  }

  // Merge schemas
  const exSchemas = Array.isArray(existing?.['schemas']) ? existing['schemas'] as unknown[] : [];
  const inSchemas = Array.isArray(incoming?.['schemas']) ? incoming['schemas'] as unknown[] : [];
  if (exSchemas.length === 0 && inSchemas.length > 0) out.schemas = inSchemas;
  else if (inSchemas.length === 0 && exSchemas.length > 0) out.schemas = exSchemas;
  else {
    const map = new Map<string, Record<string, unknown>>();
    for (const s of exSchemas) {
      if (s && typeof s === 'object' && 'id' in (s as Record<string, unknown>)) map.set(String((s as Record<string, unknown>)['id']), s as Record<string, unknown>);
    }
    for (const s of inSchemas) {
      if (s && typeof s === 'object' && 'id' in (s as Record<string, unknown>)) {
        const id = String((s as Record<string, unknown>)['id']);
        const existingObj = map.get(id) || {};
  map.set(id, { ...existingObj, ... (s as Record<string, unknown>) });
      }
    }
    out['schemas'] = Array.from(map.values());
  }

  // Preserve other keys present in either side (non-destructive): copy primitives/objects that are not arrays
  const otherKeys = new Set<string>([...Object.keys(existing || {}), ...Object.keys(incoming || {})]);
  for (const k of otherKeys) {
    if (k === 'elements' || k === 'schemas' || k === 'version') continue;
    const inc = incoming;
    const ex = existing;
    if (inc && inc[k] !== undefined) out[k] = inc[k];
    else if (ex && ex[k] !== undefined) out[k] = ex[k];
    else out[k] = undefined;
  }

  return out;
}

// Unified uploader: uploads both elements and schemas in a single merged blob so callers
// don't accidentally overwrite unrelated keys on the server.
export async function uploadFullUserLibrary(username?: string | null): Promise<boolean> {
  const user = username || getStoredUsername();
  if (!user) return false;
  await initDatabase();

  const elements = await getAllSvgElements();
  const schemas = await getAllSchemas();

  const sanitizedElements = elements.map(sanitizeSvgForServer);
  const sanitizedSchemas = schemas.map(sanitizeSchemaForServer);

  const payload = {
    username: user,
    updated_at: getLocalLibraryUpdatedAt(user) || nowIso(),
    data: { version: 1, elements: sanitizedElements, schemas: sanitizedSchemas }
  };

  try {
    const existing = await downloadUserLibrary(user).catch(() => null);
    const existingData = existing && existing.data ? (existing.data as Record<string, unknown>) : { version: 1, elements: [] };
    const merged = mergeLibraryData(existingData, payload.data as Record<string, unknown>);

    const finalPayload = { username: user, updated_at: payload.updated_at, data: merged };
    const url = (typeof window !== 'undefined') ? new URL(`/api/user-library/${encodeURIComponent(user)}`, window.location.origin).toString() : `/api/user-library/${encodeURIComponent(user)}`;
    const resp = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalPayload) });
    if (!resp.ok) {
      console.warn('uploadFullUserLibrary failed:', await resp.text().catch(() => '<no-body>'));
      return false;
    }
    const json = await resp.json().catch(() => null) as { updated_at?: string } | null;
    if (json && json.updated_at) {
      setLocalLibraryUpdatedAt(user, String(json.updated_at));
      setLocalSchemasUpdatedAt(user, String(json.updated_at));
    } else {
      setLocalLibraryUpdatedAt(user);
      setLocalSchemasUpdatedAt(user);
    }
    // Mark local rows as synchronized so UI status icons reflect the upload
    try {
      await db.transaction('rw', db.svg_elements, db.schemas, async () => {
        // mark all svg elements as synchronized
        await db.svg_elements.toCollection().modify((e: Partial<SvgElement>) => { (e as Record<string, unknown>)['synchronized'] = true; });
        // mark all schemas as synchronized
        await db.schemas.toCollection().modify((s: Partial<Schema>) => { (s as Record<string, unknown>)['synchronized'] = true; });
      });
    } catch (err) {
      console.warn('Failed to mark local rows as synchronized after upload:', err);
    }
    return true;
  } catch (err) {
    console.warn('uploadFullUserLibrary network error', err);
    return false;
  }
}

// Debounced uploader: avoid sending multiple full-library uploads in a short burst.
// Per-user timers ensure independent debounces per account.
const _debounceTimers: Record<string, number | undefined> = {};
const UPLOAD_DEBOUNCE_MS = 2000;

export function scheduleUploadFullUserLibrary(username?: string | null): void {
  const user = username || getStoredUsername();
  if (!user) return;
  // clear existing timer
  try {
    if (_debounceTimers[user]) {
      clearTimeout(_debounceTimers[user]);
    }
  } catch { /* ignore */ }
  // schedule
  // schedule a non-async callback that launches an async IIFE to avoid passing
  // an async function directly to setTimeout (avoids eslint@typescript-eslint/no-misused-promises)
  _debounceTimers[user] = setTimeout(() => {
    void (async () => {
      try {
        const ok = await uploadFullUserLibrary(user);
        if (ok) {
          try { setLocalLibraryUpdatedAt(user); } catch { /* ignore */ }
        }
      } catch (err) {
        console.warn('Debounced uploadFullUserLibrary failed', err);
      } finally {
        try { delete _debounceTimers[user]; } catch { /* ignore */ }
      }
    })();
  }, UPLOAD_DEBOUNCE_MS) as unknown as number;
}

interface LibraryBlob {
  version?: number;
  elements?: SvgElement[];
}

// Download user library blob from server (returns {data, updated_at} or null)
export async function downloadUserLibrary(username?: string | null): Promise<{ data: LibraryBlob; updated_at?: string } | null> {
  const user = username || getStoredUsername();
  if (!user) return null;
  // Use inflight cache to avoid duplicate GETs
  try {
    return await fetchUserLibraryOnce(user);
  } catch (err) {
    console.warn('downloadUserLibrary failed', err);
    return null;
  }
}

// Replace local DB svg_elements with provided elements array. Sets local library updated_at to serverUpdatedAt.
async function replaceLocalLibraryWith(elements: SvgElement[], serverUpdatedAt?: string, username?: string | null) {
  await initDatabase();
  try {
    await db.transaction('rw', db.svg_elements, async () => {
      await db.svg_elements.clear();
      for (const e of elements) {
        const elem: SvgElement = {
          id: e.id,
          name: e.name || '',
          description: e.description || '',
          category: e.category || 'custom',
          svg: e.svg || '',
          handles: e.handles || '',
          created_at: e.created_at || nowIso(),
          created_by: e.created_by || username || undefined,
          updated_at: e.updated_at || e.created_at || nowIso(),
          updated_by: e.updated_by || e.created_by || username || undefined,
          local: typeof e.local === 'boolean' ? e.local : false,
          synchronized: true,
          hidden: parseHidden(e.hidden) ?? false
        };
        await db.svg_elements.put(elem);
      }
    });
    setLocalLibraryUpdatedAt(username, serverUpdatedAt || nowIso());
  } catch (err) {
    console.error('replaceLocalLibraryWith failed', err);
  }
}

// Reconcile local vs server library using local library updated_at timestamp
export async function reconcileUserLibrary(username?: string | null): Promise<void> {
  const user = username || getStoredUsername();
  if (!user) return;
  await initDatabase();
  const localUpdated = getLocalLibraryUpdatedAt(user);
  const server = await downloadUserLibrary(user);

  // No server library
  if (!server) {
    // If local has data, push it to server
    if (localUpdated) {
      await uploadUserLibrary(user);
    }
    return;
  }

  const serverUpdated = server.updated_at || null;

  const localTs = localUpdated ? Date.parse(localUpdated) : 0;
  const serverTs = serverUpdated ? Date.parse(serverUpdated) : 0;

  if (localUpdated && serverUpdated && localTs === serverTs) {
    // same timestamp: nothing to do
    return;
  }

  if (localUpdated && localTs > serverTs) {
    // local newer -> replace server
    await uploadUserLibrary(user);
    return;
  }

  // server is newer (or local has no timestamp) -> replace local
  try {
    const payload = server.data;
    if (!payload) return;
    const elements = Array.isArray(payload.elements) ? payload.elements : (Array.isArray(payload) ? payload : []);
    await replaceLocalLibraryWith(elements, serverUpdated || undefined, user);
  } catch (err) {
    console.warn('reconcileUserLibrary failed to apply server library', err);
  }
}

// --- Schema library sync (analogous to svg library functions) ---

interface SchemasBlob {
  version?: number;
  schemas?: Schema[];
}

export async function uploadUserSchemas(username?: string | null): Promise<boolean> {
  // Delegate to the unified uploader so elements and schemas are uploaded together
  return await uploadFullUserLibrary(username);
}

export async function downloadUserSchemas(username?: string | null): Promise<{ data: SchemasBlob; updated_at?: string } | null> {
  const user = username || getStoredUsername();
  if (!user) return null;
  try {
    const result = await fetchUserLibraryOnce(user);
    if (!result) return null;
    const data = result.data as unknown as SchemasBlob | LibraryBlob;
    return { data: (data as SchemasBlob) || { schemas: [] }, updated_at: result.updated_at };
  } catch (err) {
    console.warn('downloadUserSchemas failed', err);
    return null;
  }
}

async function replaceLocalSchemasWith(schemas: Schema[], serverUpdatedAt?: string, username?: string | null) {
  await initDatabase();
  try {
    await db.transaction('rw', db.schemas, async () => {
      await db.schemas.clear();
      for (const s of schemas) {
        const row: Schema = {
          id: s.id,
          name: s.name || '',
          description: s.description || '',
          nodes: s.nodes || '[]',
          edges: s.edges || '[]',
          created_at: s.created_at || nowIso(),
          created_by: s.created_by || username || undefined,
          updated_at: s.updated_at || s.created_at || nowIso(),
          updated_by: s.updated_by || s.created_by || username || undefined,
          local: typeof s.local === 'boolean' ? s.local : false,
          synchronized: true,
          hidden: parseHidden(s.hidden) ?? false
        };
        await db.schemas.put(row);
      }
    });
    setLocalSchemasUpdatedAt(username, serverUpdatedAt || nowIso());
  } catch (err) {
    console.error('replaceLocalSchemasWith failed', err);
  }
}

export async function reconcileUserSchemas(username?: string | null): Promise<void> {
  const user = username || getStoredUsername();
  if (!user) return;
  await initDatabase();
  const localUpdated = getLocalSchemasUpdatedAt(user);
  const server = await downloadUserSchemas(user);

  if (!server) {
    // If local has data, push it
    if (localUpdated) {
      await uploadUserSchemas(user);
    }
    return;
  }

  const serverUpdated = server.updated_at || null;
  const localTs = localUpdated ? Date.parse(localUpdated) : 0;
  const serverTs = serverUpdated ? Date.parse(serverUpdated) : 0;

  if (localUpdated && serverUpdated && localTs === serverTs) return;
  if (localUpdated && localTs > serverTs) {
    await uploadUserSchemas(user);
    return;
  }

  // server newer -> replace local
  try {
    const payload = server.data;
    if (!payload) return;
    const rows = Array.isArray(payload.schemas) ? payload.schemas : (Array.isArray(payload) ? payload : []);
    await replaceLocalSchemasWith(rows, serverUpdated || undefined, user);
  } catch (err) {
    console.warn('reconcileUserSchemas failed to apply server schemas', err);
  }
}



export async function initDatabase(): Promise<boolean> {
  await db.open();
  await initializeBasicElements();
  return true;
}

export async function saveSchema(schema: Schema): Promise<string> {
  await initDatabase();
  const now = nowIso();
  const toSave: Schema = {
    ...schema,
    created_at: schema.created_at || now,
    created_by: schema.created_by || undefined,
    updated_by: schema.updated_by || schema.created_by || undefined,
    updated_at: now,
    local: typeof schema.local === 'boolean' ? schema.local : false,
  };

  // Ensure we have a string id (IndexedDB keyPath requires it); generate in frontend if missing
  if (!toSave.id || typeof toSave.id !== 'string') {
    try {
      // prefer native crypto.randomUUID when available
      toSave.id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    } catch {
      toSave.id = `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  await db.schemas.put(toSave);
  // mark schemas updated timestamp for current user
  try { setLocalSchemasUpdatedAt(); } catch { /* ignore */ }
  // attempt sync in background (non-blocking)
  void syncSchemasWithBackend().catch(() => { /* ignore */ });
  // If we have a configured username, also upload the full user library so server-side user_library is updated
  try {
    const user = getStoredUsername();
    if (user) {
      try { scheduleUploadFullUserLibrary(user); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return toSave.id;
}

// Helpers to sanitize objects before sending to the backend
function sanitizeSchemaForServer(s: Partial<Schema>): Record<string, unknown> {
  const sRec = s as Partial<Schema> & Record<string, unknown>;
  const created_by = sRec['created_by'] !== undefined ? String(sRec['created_by']) : undefined;
  const updated_by = sRec['updated_by'] !== undefined ? String(sRec['updated_by']) : undefined;
  return {
    id: s.id,
    name: s.name || '',
    description: s.description || '',
    nodes: s.nodes || '[]',
    edges: s.edges || '[]',
    created_at: s.created_at || nowIso(),
    updated_at: s.updated_at || nowIso(),
    created_by,
    updated_by,
    // Always send local as 0 to server-side SQLite (server rows must not be marked local-only)
    local: 0,
    // include hidden flag for user_library blobs
    hidden: parseHidden(s.hidden) ?? false
  };
}

function sanitizeSvgForServer(e: Partial<SvgElement>): Record<string, unknown> {
  const eRec = e as Partial<SvgElement> & Record<string, unknown>;
  const created_by = eRec['created_by'] !== undefined ? String(eRec['created_by']) : undefined;
  const updated_by = eRec['updated_by'] !== undefined ? String(eRec['updated_by']) : undefined;
  return {
    id: e.id,
    name: e.name || '',
    description: e.description || '',
    category: e.category || 'custom',
    svg: e.svg || '',
    handles: e.handles || '',
    created_at: e.created_at || nowIso(),
    updated_at: e.updated_at || nowIso(),
    created_by,
    updated_by,
    local: 0,
    // include hidden flag for user_library blobs
    hidden: parseHidden(e.hidden) ?? false
  };
}

export async function updateSchema(id: string, schema: Partial<Schema>): Promise<void> {
  await initDatabase();
  const cur = await db.schemas.get(id);
  if (!cur) throw new Error('Esquema no encontrado');
  const updated: Schema = { ...cur, ...schema, updated_at: nowIso(), updated_by: schema.updated_by || cur.updated_by || cur.created_by, local: typeof schema.local === 'boolean' ? schema.local : cur.local } as Schema;
  await db.schemas.put(updated);
  try { setLocalSchemasUpdatedAt(); } catch { /* ignore */ }
  void syncSchemasWithBackend().catch(() => { /* ignore */ });
  // If we have a username, upload the full user library so server blob reflects schema changes (e.g. hidden)
  try {
    const user = getStoredUsername();
    if (user) {
      try { scheduleUploadFullUserLibrary(user); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export async function getAllSchemas(): Promise<Schema[]> {
  await initDatabase();
  const all = await db.schemas.toArray();
  return all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getSchemaById(id: string): Promise<Schema | null> {
  await initDatabase();
  const s = await db.schemas.get(id);
  return s || null;
}

export async function deleteSchema(id: string): Promise<void> {
  await initDatabase();
  await db.schemas.delete(id);
  try { setLocalSchemasUpdatedAt(); } catch { /* ignore */ }
  void syncSchemasWithBackend().catch(() => { /* ignore */ });
}

// Synchronize schemas with backend using rules similar to syncSvgsWithBackend:
// - fetch server rows (GET /api/schemas)
// - insert server-only rows locally
// - update local rows when server updated_at is newer
// - push local-only rows (local === false) to server via POST /api/schemas
export async function syncSchemasWithBackend(): Promise<void> {
  await initDatabase();
  // prefer stored username if present; do not force a default username
  const storedUsername = (typeof localStorage !== 'undefined') ? localStorage.getItem('username') : null;
  // Reset synchronized flags for schemas before syncing (mirror behavior for svgs)
  try {
    await db.transaction('rw', db.schemas, async () => {
      await db.schemas.toCollection().modify((s: Partial<Schema>) => {
        (s as Record<string, unknown>)['synchronized'] = false;
      });
    });
  } catch (err) {
    console.warn('Failed to reset synchronized flags for schemas before sync:', err);
  }
  let serverRows: Array<Record<string, unknown>> = [];
  // Attempt to fetch server schemas. Use an absolute URL to avoid base-path issues
  // and retry once after a short delay in case the backend is not immediately available
  try {
    const url = (typeof window !== 'undefined') ? new URL('/api/schemas', window.location.origin).toString() : '/api/schemas';
    let resp: Response | null = null;
    try {
      resp = await fetch(url);
    } catch (err) {
      // First attempt failed (network/CORS). Wait briefly and retry once.
      console.warn('Initial fetch(/api/schemas) failed, retrying in 2s...', err);
      await new Promise((res) => setTimeout(res, 2000));
      try {
        resp = await fetch(url);
      } catch (err2) {
        console.warn('Retry fetch(/api/schemas) failed; aborting schemas sync for now', err2);
        return;
      }
    }

    if (!resp || !resp.ok) {
      // Non-OK response: treat as no server rows but continue to attempt pushing local-only rows below
      console.warn('fetch(/api/schemas) returned non-ok status:', resp && resp.status);
      const data = await resp?.json().catch(() => null);
      serverRows = Array.isArray(data) ? data : [];
    } else {
      const data = await resp.json();
      // If server returns non-array, treat as no server rows. Do NOT abort when [] —
      // we still want to attempt pushing local-only schemas to an empty server.
      serverRows = Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn('Unexpected error during fetch(/api/schemas):', err);
    return;
  }

  const serverById = new Map<string, Record<string, unknown>>();
  for (const r of serverRows) {
    if (r && r.id) serverById.set(String(r.id), r);
  }

  const local = await db.schemas.toArray();
  const localById = new Map<string, Schema>();
  for (const l of local) if (l && l.id) localById.set(String(l.id), l);

  try {
    await db.transaction('rw', db.schemas, async () => {
      for (const [id, srv] of serverById.entries()) {
        const localElem = localById.get(id);
        const normalized: Schema = {
          id: String(srv.id),
          name: srv.name ? String(srv.name) : '',
          description: srv.description ? String(srv.description) : '',
          nodes: srv.nodes ? String(srv.nodes) : '[]',
          edges: srv.edges ? String(srv.edges) : '[]',
          created_at: srv.created_at ? String(srv.created_at) : nowIso(),
          created_by: srv.created_by ? String(srv.created_by) : undefined,
          updated_at: srv.updated_at ? String(srv.updated_at) : nowIso(),
          updated_by: srv.updated_by ? String(srv.updated_by) : undefined,
          local: Boolean(srv.local),
        };

        if (!localElem) {
          // server-only -> insert locally (mark synchronized)
          normalized.synchronized = true;
          await db.schemas.put(normalized);
        } else {
          const srvTs = Date.parse(String(srv.updated_at || srv.created_at || '')) || 0;
          const locTs = Date.parse(String(localElem.updated_at || localElem.created_at || '')) || 0;
          if (srvTs > locTs) {
            // server is newer -> update local (mark synchronized)
            normalized.synchronized = true;
            await db.schemas.put(normalized);
          }
        }
      }
    });
  } catch (err) {
    console.warn('Error applying server->local schemas sync:', err);
  }

  // Push local-only schemas to server
  for (const l of local) {
    try {
      if (!l.id) continue;
      if (serverById.has(l.id)) continue;
      if (l.local === false) {
        const payload = sanitizeSchemaForServer(l);
  // Server requires a username field for POST; prefer created_by then stored username
  if (l.created_by) payload['username'] = l.created_by;
  else if (storedUsername) payload['username'] = storedUsername;

        try {
          const resp = await fetch('/api/schemas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!resp.ok) {
            console.warn('Failed to push local schema to server', l.id, await resp.text());
          } else {
            // mark local row as synchronized on successful push
            try { await db.schemas.update(l.id, { synchronized: true }); } catch { /* ignore */ }
          }
        } catch (err) {
          console.warn('Network error pushing local schema to server', l.id, err);
        }
      }
    } catch (err) {
      console.warn('Error handling local schema for push:', err);
    }
  }
}

export async function duplicateSchema(id: string, newName: string): Promise<string> {
  const original = await getSchemaById(id);
  if (!original) throw new Error('Esquema no encontrado');
  const copy: Schema = {
    name: newName,
    description: original.description,
    nodes: original.nodes,
    edges: original.edges,
    created_at: nowIso(),
    created_by: original.created_by || undefined,
    updated_by: original.updated_by || original.created_by || undefined,
    updated_at: nowIso(),
    local: original.local !== undefined ? original.local : false
  };
  return await saveSchema(copy);
}

// SVG elements
export async function saveSvgElement(elem: SvgElement): Promise<string> {
  await initDatabase();
  const now = nowIso();
  const toSave: SvgElement = {
    ...elem,
    created_at: elem.created_at || now,
    created_by: elem.created_by || undefined,
    updated_by: elem.updated_by || elem.created_by || undefined,
    updated_at: now,
    local: typeof elem.local === 'boolean' ? elem.local : false,
    synchronized: typeof elem.synchronized === 'boolean' ? elem.synchronized : false,
    hidden: parseHidden(elem.hidden) ?? false
  };

  // Ensure we have a string id (IndexedDB keyPath requires it); generate in frontend if missing
  if (!toSave.id || typeof toSave.id !== 'string') {
    // Prefer crypto.randomUUID when available
    try {
      toSave.id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    } catch {
      toSave.id = `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  await db.svg_elements.put(toSave);
  // mark local library as modified
  try { setLocalLibraryUpdatedAt(); } catch { /* ignore */ }
  await syncSvgsWithBackend();
  // Also attempt to upload the entire user library to server if user is configured so server blob remains current
  try {
    const user = getStoredUsername();
    if (user) {
      try { scheduleUploadFullUserLibrary(user); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return toSave.id;
}

export async function updateSvgElement(id: string, elem: Partial<SvgElement>): Promise<void> {
  await initDatabase();
  const cur = await db.svg_elements.get(id);
  if (!cur) throw new Error('SVG element not found');
  const updated: SvgElement = { ...cur, ...elem, updated_at: nowIso(), updated_by: elem.updated_by || cur.updated_by || cur.created_by, local: typeof elem.local === 'boolean' ? elem.local : cur.local, synchronized: typeof elem.synchronized === 'boolean' ? elem.synchronized : cur.synchronized } as SvgElement;
  // preserve existing hidden if incoming doesn't specify a hidden-like value
  const updatedHidden: boolean = parseHidden(elem.hidden) ?? (cur.hidden === true);
  updated.hidden = updatedHidden;
  await db.svg_elements.put(updated);
  try { setLocalLibraryUpdatedAt(); } catch { /* ignore */ }
  // Also upload full user library in background when user exists so server blob includes this change
  try {
    const user = getStoredUsername();
    if (user) {
      try { scheduleUploadFullUserLibrary(user); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export async function getAllSvgElements(): Promise<SvgElement[]> {
  await initDatabase();
  const all = await db.svg_elements.toArray();
  return all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getSvgElementById(id: string): Promise<SvgElement | null> {
  await initDatabase();
  const e = await db.svg_elements.get(id);
  return e || null;
}

export async function getSvgElementsByCategory(category: string): Promise<SvgElement[]> {
  await initDatabase();
  const all = await db.svg_elements.where('category').equals(category).toArray();
  return all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getSvgCategories(): Promise<string[]> {
  await initDatabase();
  const all = await db.svg_elements.toArray();
  const set = new Set<string>();
  all.forEach(e => { if (e.category) set.add(e.category); });
  return Array.from(set).sort();
}

export async function deleteSvgElement(id: string): Promise<void> {
  await syncSvgsWithBackend();
  await db.svg_elements.delete(id);
  try { setLocalLibraryUpdatedAt(); } catch { /* ignore */ }
}

export async function clearAllSvgElements(): Promise<void> {
  await initDatabase();
  await db.svg_elements.clear();
}

// Close the Dexie instance and delete the IndexedDB database
export async function deleteDatabase(): Promise<void> {
  try {
    try {
      // close Dexie to release handles (Dexie.close is synchronous)
      db.close();
    } catch {
      // ignore
    }
    // Delete the DB by name and return a promise that resolves when done
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase('drawpak');
        req.onsuccess = () => resolve();
        req.onblocked = () => resolve();
        req.onerror = () => resolve();
      } catch {
        // If indexedDB is not available or deletion failed, resolve anyway
        resolve();
      }
    });
  } catch {
    // swallow errors
  }
}


export async function reinitializeBasicElements(): Promise<void> {
  await clearAllSvgElements();
  await initializeBasicElements();
}

// Synchronize SVG elements with backend according to rules:
// - fetch server rows (ignore if network fails)
// - if a server row exists but not locally: insert locally
// - if a local row exists but not on server AND local === false: POST it to server
// - if exists in both and server.updated_at is newer: update local from server
export async function syncSvgsWithBackend(): Promise<void> {
  await initDatabase();

  // prefer stored username if present; do not force a default username
  const storedUsername = (typeof localStorage !== 'undefined') ? localStorage.getItem('username') : null;

  // Antes de consultar el backend, asegurarnos de que todos los elementos locales
  // tengan la bandera `synchronized` a false. Esto nos permite marcar luego los
  // que realmente se sincronizan como true.
  try {
    await db.transaction('rw', db.svg_elements, async () => {
      // usar modify para actualizar todos los registros existentes
      await db.svg_elements.toCollection().modify((e: Partial<SvgElement>) => {
        (e as Record<string, unknown>)['synchronized'] = false;
      });
    });
  } catch (err) {
    console.warn('Failed to reset synchronized flags before sync:', err);
  }

  let serverRows: Array<Record<string, unknown>> = [];
  try {
    const resp = await fetch('/api/svgs');
    if (!resp.ok) return; // silently ignore failures
    const data = await resp.json();
    // Allow empty array: still need to push local-only svgs to an empty server.
    serverRows = Array.isArray(data) ? data : [];
  } catch {
    // network/CORS error — nothing to sync
    return;
  }

  // Build maps for quick lookup
  const serverById = new Map<string, Record<string, unknown>>();
  for (const r of serverRows) {
    if (r && r.id) serverById.set(String(r.id), r);
  }

  const local = await db.svg_elements.toArray();
  const localById = new Map<string, SvgElement>();
  for (const l of local) {
    if (l && l.id) localById.set(String(l.id), l);
  }

  // Insert server-only rows into local, update local when server is newer
  try {
    await db.transaction('rw', db.svg_elements, async () => {
      for (const [id, srv] of serverById.entries()) {
        const localElem = localById.get(id);
        const normalized: SvgElement = {
          id: String(srv.id),
          name: srv.name ? String(srv.name) : '',
          description: srv.description ? String(srv.description) : '',
          category: srv.category ? String(srv.category) : 'basic',
          svg: srv.svg ? String(srv.svg) : '',
          handles: srv.handles ? String(srv.handles) : '',
          created_at: srv.created_at ? String(srv.created_at) : undefined,
          created_by: srv.created_by ? String(srv.created_by) : undefined,
          updated_at: srv.updated_at ? String(srv.updated_at) : (srv.created_at ? String(srv.created_at) : undefined),
          updated_by: srv.updated_by ? String(srv.updated_by) : undefined,
          local: Boolean(srv.local),
          // marcar como sincronizado porque viene del servidor
          synchronized: true,
          // conservar hidden si existe localmente, si no, false
          hidden: localElem && typeof localElem.hidden === 'boolean' ? localElem.hidden : false
        };

        if (!localElem) {
          // server-only -> insert locally (mark synchronized)
          await db.svg_elements.put(normalized);
        } else {
          // exists both -> compare updated_at
          const srvTs = Date.parse(String(srv.updated_at || srv.created_at || '')) || 0;
          const locTs = Date.parse(String(localElem.updated_at || localElem.created_at || '')) || 0;
          if (srvTs > locTs) {
            // server is newer -> update local (includes synchronized: true)
            await db.svg_elements.put(normalized);
          } else {
            // server has the row but is not newer: mark local as synchronized without overwriting
            try {
              await db.svg_elements.update(String(localElem.id), { synchronized: true, hidden: typeof localElem.hidden === 'boolean' ? localElem.hidden : false });
            } catch (err) {
              console.warn('Failed to mark existing local svg as synchronized:', localElem.id, err);
            }
          }
        }
      }
    });
  } catch (err) {
    console.warn('Error applying server->local sync:', err);
  }

  // Push local-only items (with local === false) to server
  for (const l of local) {
    try {
      if (!l.id) continue;
      if (serverById.has(l.id)) continue; // already on server
      // only push if local flag is false (meaning it should be persisted on server)
      if (l.local === false) {
        // prepare payload; backend expects username
  const payload = sanitizeSvgForServer(l);

        if (l.created_by) payload['created_by'] = l.created_by;
        if (l.updated_by) payload['updated_by'] = l.updated_by;
        if (storedUsername) payload['username'] = storedUsername;

        try {
          const resp = await fetch('/api/svgs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          // ignore non-OK responses but log for diagnostics
          if (!resp.ok) {
            console.warn('Failed to push local svg to server', l.id, await resp.text());
          } else {
            // marcar localmente como sincronizado solo si el POST fue exitoso
            try {
              await db.svg_elements.update(l.id, { synchronized: true });
            } catch (err) {
              console.warn('Failed to mark local svg as synchronized after push:', l.id, err);
            }
          }
        } catch (err) {
          console.warn('Network error pushing local svg to server', l.id, err);
        }
      }
    } catch (err) {
      console.warn('Error handling local svg for push:', err);
    }
  }

  // Notify UI that svg elements may have changed so components reload.
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('svg-elements-updated'));
    }
  } catch {
    // ignore
  }
}

export async function initializeBasicElements(): Promise<void> {
  // Evitar seeding concurrente en la misma sesión
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    // Verificar si ya existen elementos básicos (usar conteo directo para evitar reentradas)
    const count = await db.svg_elements.count();
    if (count > 0) {
      return;
    }

    // Primero: intentar obtener los SVGs del backend. Si funciona, usarlos como semilla.
    try {
      const resp = await fetch('/api/svgs');
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          try {
            await db.transaction('rw', db.svg_elements, async () => {
              for (const r of rows) {
                // Normalizar la fila recibida a SvgElement
                const elem: SvgElement = {
                  id: r.id,
                  name: r.name || '',
                  description: r.description || '',
                  category: r.category || 'basic',
                  svg: r.svg || '',
                  handles: r.handles || '',
                  created_at: r.created_at || nowIso(),
                  created_by: r.created_by || 'server',
                  updated_at: r.updated_at || nowIso(),
                  updated_by: r.updated_by || r.created_by || 'server',
                  local: !!r.local
                };

                // upsert by id (preferred) or by name+category to avoid duplicates
                if (elem.id) {
                  await db.svg_elements.put(elem);
                } else {
                  const exists = await db.svg_elements
                    .where('name')
                    .equalsIgnoreCase(elem.name)
                    .and(e => (e.category || 'basic') === (elem.category || 'basic'))
                    .first();
                  if (!exists) await db.svg_elements.add(elem);
                }
              }
            });
            // Semilla cargada desde backend, terminamos
            seedingPromise = null;
            return;
          } catch (err) {
            console.warn('Fallo al aplicar seeds desde backend, proceder con locales:', err);
            // continue to local seeding
          }
        }
      }
    } catch {
      // Error de red o CORS; continuar con semilla local
    }

    // Transformadores
    const transformadores = [
      {
        id: 'fa31ce0c-fb55-4685-bcc9-3bfb0d5bdee5',
        name: 'Transformador',
        description: 'Transformador básico',
        category: 'transformadores',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" style="background: rgba(255, 255, 255, 0);">
        <defs xmlns="http://www.w3.org/2000/svg"/>
        <g xmlns="http://www.w3.org/2000/svg">
            <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 40)">
                <circle xmlns="http://www.w3.org/2000/svg" cx="60" fill-opacity="0" fill="#fff" stroke="#000" r="25" stroke-width="2" cy="40"/>
            </g>
        </g>
        <g xmlns="http://www.w3.org/2000/svg">
            <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 80)">
                <circle xmlns="http://www.w3.org/2000/svg" cx="60" fill-opacity="0" fill="#fff" stroke="#000" r="25" stroke-width="2" cy="80"/>
            </g>
        </g>
        <g xmlns="http://www.w3.org/2000/svg">
            <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 7.5)">
                <line xmlns="http://www.w3.org/2000/svg" y2="15" y1="0" stroke="#000" x2="60" stroke-width="2" x1="60"/>
            </g>
        </g>
        <g xmlns="http://www.w3.org/2000/svg">
            <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 112.5)">
                <line xmlns="http://www.w3.org/2000/svg" y2="105" y1="120" stroke="#000" x2="60" stroke-width="2" x1="60"/>
                <g xmlns="http://www.w3.org/2000/svg"/>
            </g>
        </g>
    </svg>`,
        handles: JSON.stringify([
          { id: 'top', x: 60, y: 0, type: 'source' },
          { id: 'bottom', x: 60, y: 120, type: 'target' }
        ])
      },
      {
        id: '51399c85-3dc0-452c-b2eb-5436202eb63f',
        name: 'Transformador Doble',
        description: 'Transformador con doble salida',
        category: 'transformadores',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 60)">
                  <circle xmlns="http://www.w3.org/2000/svg" fill-opacity="0" cx="60" fill="#fff" stroke-width="2" stroke="#000" cy="60" r="30"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 40, 100)">
                  <circle xmlns="http://www.w3.org/2000/svg" fill-opacity="0" cx="40" fill="#fff" stroke-width="2" stroke="#000" cy="100" r="30"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 80, 100)">
                  <circle xmlns="http://www.w3.org/2000/svg" fill-opacity="0" cx="80" fill="none" stroke-width="2" stroke="#000" cy="100" r="30"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 15)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="60" y1="30" stroke-width="2" stroke="#000" y2="0" x2="60"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 40, 145)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="40" y1="160" stroke-width="2" stroke="#000" y2="130" x2="40"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 80, 145)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="80" y1="160" stroke-width="2" stroke="#000" y2="130" x2="80"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          { id: 'top', x: 60, y: 0, type: 'source' },
          { id: 'left', x: 40, y: 160, type: 'target' },
          { id: 'right', x: 80, y: 160, type: 'target' }
        ])
      }
    ];

    // Protección
    const proteccion = [
      {
        id: 'c179addb-150c-475a-8ae3-543a187e9728',
        name: 'Interruptor',
        description: 'Interruptor',
        category: 'proteccion',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 30, 40)">
                  <circle xmlns="http://www.w3.org/2000/svg" stroke="#000" stroke-width="1" r="4" fill="#000" cx="30" cy="40"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 90, 40)">
                  <circle xmlns="http://www.w3.org/2000/svg" stroke="#000" stroke-width="1" r="4" fill="#000" cx="90" cy="40"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 15, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" stroke="#000" y2="40" stroke-width="2" x1="0" x2="30"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 30)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" stroke="#000" y2="20" stroke-width="2" x1="30" x2="90"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 105, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" stroke="#000" y2="40" stroke-width="2" x1="90" x2="120"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 35)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="20" y="10" stroke="#000" stroke-width="2" fill="rgba(255, 255, 255, 0)" width="80" fill-opacity="0" height="50"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          {
            "id": "left",
            "type": "source",
            "x": 0,
            "y": 40
          },
          {
            "id": "right",
            "type": "target",
            "x": 120,
            "y": 40
          }
        ])
      },
      {
        id: '442c7305-e553-4ead-90bf-8c639c6cc1df',
        name: 'Interruptor Extraido',
        description: 'Interruptor',
        category: 'proteccion',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 100, 46)">
                  <rect xmlns="http://www.w3.org/2000/svg" fill="rgba(255, 255, 255, 0)" fill-opacity="0" height="50" x="60" width="80" y="21" stroke="#000" stroke-width="2"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 70, 50)">
                  <circle xmlns="http://www.w3.org/2000/svg" fill="#000" stroke="#000" stroke-width="1" cy="50" cx="70" r="4"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 130, 50)">
                  <circle xmlns="http://www.w3.org/2000/svg" fill="#000" stroke="#000" stroke-width="1" cy="50" cx="130" r="4"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 15, 100)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="0" stroke="#000" stroke-width="2" x2="30" y2="100" y1="100"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 100, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="70" stroke="#000" stroke-width="2" x2="130" y2="30" y1="50"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 186, 100)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="170" stroke="#000" stroke-width="2" x2="202" y2="100" y1="100"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 55, 50)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="40" stroke="#000" stroke-width="2" x2="70" y2="50" y1="50"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 145, 50)">
                  <line xmlns="http://www.w3.org/2000/svg" x1="130" stroke="#000" stroke-width="2" x2="160" y2="50" y1="50"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(270, 50, 100)">
                  <path xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="butt" d="M 30 100 A 20 20 0 0 1 70 100" stroke="#000" stroke-width="2"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(90, 150, 100)">
                  <path xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="butt" d="M 130 100 A 20 20 0 0 1 170 100" stroke="#000" stroke-width="2"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          {
            "id": "left",
            "type": "source",
            "x": 0,
            "y": 100
          },
          {
            "id": "right",
            "type": "target",
            "x": 200,
            "y": 100
          }
        ])
      },
      {
        id: 'eddb3c2a-c6ae-42d0-8d6d-3614c24b7139',
        name: 'Seccionador',
        description: 'Seccionador de línea',
        category: 'proteccion',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 30, 40)">
                  <circle xmlns="http://www.w3.org/2000/svg" stroke="#000" stroke-width="1" r="4" fill="#000" cx="30" cy="40"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 90, 40)">
                  <circle xmlns="http://www.w3.org/2000/svg" stroke="#000" stroke-width="1" r="4" fill="#000" cx="90" cy="40"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 15, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" stroke="#000" y2="40" stroke-width="2" x1="0" x2="30"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60, 30)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" stroke="#000" y2="20" stroke-width="2" x1="30" x2="90"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 105, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" stroke="#000" y2="40" stroke-width="2" x1="90" x2="120"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          {
            "id": "left",
            "type": "source",
            "x": 0,
            "y": 40
          },
          {
            "id": "right",
            "type": "target",
            "x": 120,
            "y": 40
          }
        ])
      }
    ];

    // Infraestructura
    const infraestructura = [
      {
        id: '41dbe6ce-7cd5-4c23-a5ca-3ac50bf69cea',
        name: 'Barra Simple',
        description: 'Barras de conexión',
        category: 'infraestructura',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" style="background: rgba(255, 255, 255, 0);" viewBox="0 0 200 200">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 39.5, 100)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="37.5" height="200" fill="#000" stroke-width="1" y="0" width="4" stroke="#000"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 120, 100)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="100" x2="200" stroke-width="2" x1="40" y2="100" stroke="#000"/>.
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          {
            "id": "h_1756826687664",
            "type": "target",
            "x": 40,
            "y": 200
          },
          {
            "id": "h_1756829757274",
            "type": "source",
            "x": 40,
            "y": 0
          },
          {
            "id": "h_1756829764787",
            "type": "target",
            "x": 200,
            "y": 100
          }
        ])
      },
      {
        id: 'af6a241f-25b3-4926-9cde-360dc22d20ad',
        name: 'Barra Doble',
        description: 'Barras de conexión',
        category: 'infraestructura',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 39.5, 100)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="37.5" y="0" width="4" height="200" fill="#000" stroke="#000" stroke-width="1"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 79.5, 100)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="77.5" y="0" width="4" height="200" fill="#000" stroke="#000" stroke-width="1"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 120, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="40" y1="40" stroke="#000" x2="200" stroke-width="2" x1="40"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 139, 160)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="160" y1="160" stroke="#000" x2="200" stroke-width="2" x1="78"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          {
            "id": "h_1756826687664",
            "type": "target",
            "x": 40,
            "y": 200
          },
          {
            "id": "h_1756826687995",
            "type": "source",
            "x": 40,
            "y": 0
          },
          {
            "id": "h_1756826670572",
            "type": "target",
            "x": 80,
            "y": 200
          },
          {
            "id": "h_1756826671210",
            "type": "source",
            "x": 80,
            "y": 0
          },
          {
            "id": "r_top",
            "type": "target",
            "x": 200,
            "y": 40
          },
          {
            "id": "b_right",
            "type": "target",
            "x": 200,
            "y": 160
          }
        ])
      },
      {
        id: 'ec8d9bea-25c8-44de-a4af-3035697e7457',
        name: 'Barra Triple',
        description: 'Barras de conexión',
        category: 'infraestructura',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" style="background: rgba(255, 255, 255, 0);" viewBox="0 0 200 200">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 20.5, 100)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="18.5" height="200" fill="#000" stroke-width="1" y="0" width="4" stroke="#000"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 60.5, 100)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="58.5" height="200" fill="#000" stroke-width="1" y="0" width="4" stroke="#000"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 100, 100)">
                  <rect xmlns="http://www.w3.org/2000/svg" x="98" height="200" fill="#000" stroke-width="1" y="0" width="4" stroke="#000"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 150, 160)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="160" x2="200" stroke-width="2" x1="100" y2="160" stroke="#000"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 110, 40)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="40" x2="200" stroke-width="2" x1="20" y2="40" stroke="#000"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 130, 100)">
                  <line xmlns="http://www.w3.org/2000/svg" y1="100" x2="200" stroke-width="2" x1="60" y2="100" stroke="#000"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          {
            "id": "h_1756826687664",
            "type": "target",
            "x": 20,
            "y": 200
          },
          {
            "id": "h_1756830053495",
            "type": "source",
            "x": 20,
            "y": 0
          },
          {
            "id": "h_1756830129231",
            "type": "target",
            "x": 60,
            "y": 200
          },
          {
            "id": "h_1756826687995",
            "type": "source",
            "x": 60,
            "y": 0
          },
          {
            "id": "h_1756826671210",
            "type": "source",
            "x": 100,
            "y": 0
          },
          {
            "id": "r_top",
            "type": "target",
            "x": 200,
            "y": 40
          },
          {
            "id": "h_1756826670572",
            "type": "target",
            "x": 100,
            "y": 200
          },
          {
            "id": "b_right",
            "type": "target",
            "x": 200,
            "y": 160
          },
          {
            "id": "h_1756830118484",
            "type": "target",
            "x": 200,
            "y": 100
          }
        ])
      }
    ];

    // Seguridad
    const seguridad = [
      {
        id: '67de6f6d-0f4e-4c46-abe6-6dc6fb5a885d',
        name: 'Candado',
        description: 'Dispositivo de bloqueo',
        category: 'seguridad',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" style="background: rgba(255, 255, 255, 0);" viewBox="0 0 60 60">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 30, 43.5)">
                  <rect xmlns="http://www.w3.org/2000/svg" stroke-width="2" fill="#62a0ea" width="40" stroke="#000" y="31" height="25" x="10"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 16, 24.5)">
                  <line xmlns="http://www.w3.org/2000/svg" stroke-width="2" y1="32" x1="16" stroke="#000" y2="17" x2="16"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 44, 24)">
                  <line xmlns="http://www.w3.org/2000/svg" stroke-width="2" y1="30" x1="44" stroke="#000" y2="18" x2="44"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 30, 20)">
                  <path xmlns="http://www.w3.org/2000/svg" stroke-width="2" fill="none" d="M 16 20 A 14 14 0 0 1 44 20" stroke="#000" stroke-linecap="butt"/>
              </g>
          </g>
      </svg>`,
        handles: "[]"
      },
      {
        id: '7328a097-72b5-4f47-9469-8b39a5646e30',
        name: 'Bloqueo',
        description: 'Zona de bloqueo',
        category: 'seguridad',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" style="background: rgba(255, 255, 255, 0);" viewBox="0 0 80 80">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 40, 40)">
                  <circle xmlns="http://www.w3.org/2000/svg" cx="40" stroke="#3584e4" stroke-width="2" cy="40" fill="rgba(255, 255, 255, 0)" r="38"/>
              </g>
          </g>
      </svg>`,
        handles: "[]"
      },
      {
        id: 'ca04f696-8e62-4250-82ef-be3f78d4eda9',
        name: 'Puesta a Tierra',
        description: 'Conexión a tierra',
        category: 'seguridad',
        created_at: '2025-09-09T14:19:32+00:00',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 20, 10)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="20" y1="0" stroke="#000" x2="20" stroke-width="2" x1="20"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 20, 20)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="20" y1="20" stroke="#000" x2="40" stroke-width="2" x1="0"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 20, 30)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="30" y1="30" stroke="#000" x2="28" stroke-width="2" x1="12"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 20, 35)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="35" y1="35" stroke="#000" x2="24" stroke-width="2" x1="16"/>
                  <g xmlns="http://www.w3.org/2000/svg"/>
              </g>
          </g>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 20, 25)">
                  <line xmlns="http://www.w3.org/2000/svg" y2="25" y1="25" stroke="#000" x2="36" stroke-width="2" x1="4"/>
              </g>
          </g>
      </svg>`,
        handles: JSON.stringify([
          { id: 'top', x: 20, y: 0, type: 'source' }
        ])
      }
    ];

    // Guardar todos los elementos en una transacción usando la tabla directa para evitar
    // llamadas a helpers que puedan re-inicializar la DB.
    const allElements = [...transformadores, ...proteccion, ...infraestructura, ...seguridad];
    try {
      await db.transaction('rw', db.svg_elements, async () => {
        for (const element of allElements) {
          // Evitar duplicados comprobando por nombre y categoría
          const exists = await db.svg_elements
            .where('name')
            .equalsIgnoreCase(element.name)
            .and(e => (e.category || 'basic') === (element.category || 'basic'))
            .first();
          if (exists) {
            continue;
          }

          const elem: SvgElement = {
            id: element.id,
            name: element.name,
            description: element.description || '',
            category: element.category || 'basic',
            svg: element.svg,
            handles: element.handles || '',
            created_at: element.created_at || nowIso(),
            created_by: 'pbarbeito',
            updated_at: element.created_at || nowIso(),
            updated_by: 'pbarbeito',
            synchronized: false,
            hidden: false,
            local: false
          };
          await db.svg_elements.add(elem);
        }
      });
  // elementos inicializados correctamente
    } catch (err) {
      console.error('Error inicializando elementos básicos:', err);
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}

// Format ISO timestamp '2025-09-09T12:41:48.864Z' -> '09/09/2025 12:41'
export const formatTimestamp = (iso?: string | null) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return iso;
  }
};