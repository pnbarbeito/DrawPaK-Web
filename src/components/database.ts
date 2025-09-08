import Dexie from 'dexie';
// NOTE: Removed DEFAULT_SYMBOLS; canonical seed is provided by
// `initializeBasicElementsOriginal()` which contains the authoritative set.

export interface Schema {
  id?: number;
  name: string;
  description?: string;
  nodes: string; // JSON string de los nodos
  edges: string; // JSON string de las conexiones
  created_at?: string;
  created_by?: string;
  updated_by?: string;
  updated_at?: string;
  local?: boolean; // true = only stored in browser DB
}

export interface SvgElement {
  id?: number;
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
}

// Dexie (IndexedDB) backed implementation for browser
// Preserves the same exported API as before so other components don't need changes.

class DrawPakDB extends Dexie {
  schemas!: Dexie.Table<Schema, number>;
  svg_elements!: Dexie.Table<SvgElement, number>;

  constructor() {
    super('drawpak');
    this.version(1).stores({
  schemas: '++id,name,updated_at,local',
  svg_elements: '++id,name,category,updated_at,local'
    });
    this.schemas = this.table('schemas');
    this.svg_elements = this.table('svg_elements');
  }
}

const db = new DrawPakDB();

// Promise used to ensure only one seeding runs at a time in this page session.
let seedingPromise: Promise<void> | null = null;

const SCHEMAS_KEY = 'drawpak:schemas';
const SVG_KEY = 'drawpak:svg_elements';
const MIGRATED_FLAG = 'drawpak:migratedToIndexedDB:v1';

function nowIso() { return new Date().toISOString(); }

async function migrateFromLocalStorageIfNeeded(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return;

    // If DB already has entries, assume previously migrated
    const [schemaCount, svgCount] = await Promise.all([db.schemas.count(), db.svg_elements.count()]);
    if (schemaCount > 0 || svgCount > 0) {
      localStorage.setItem(MIGRATED_FLAG, '1');
      return;
    }

    const rawSchemas = localStorage.getItem(SCHEMAS_KEY);
    const rawSvgs = localStorage.getItem(SVG_KEY);
    if (!rawSchemas && !rawSvgs) {
      localStorage.setItem(MIGRATED_FLAG, '1');
      return;
    }

    const parsedSchemas: Schema[] = rawSchemas ? JSON.parse(rawSchemas) : [];
    const parsedSvgs: SvgElement[] = rawSvgs ? JSON.parse(rawSvgs) : [];

    if (parsedSchemas.length === 0 && parsedSvgs.length === 0) {
      localStorage.setItem(MIGRATED_FLAG, '1');
      return;
    }

    await db.transaction('rw', db.schemas, db.svg_elements, async () => {
      for (const s of parsedSchemas) {
        // keep existing id if provided
        await db.schemas.put({ ...s });
      }
      for (const e of parsedSvgs) {
        await db.svg_elements.put({ ...e });
      }
    });

    // Remove legacy keys to avoid repeated migration; keep a flag
    try {
      localStorage.removeItem(SCHEMAS_KEY);
      localStorage.removeItem(SVG_KEY);
      localStorage.removeItem('drawpak:schemas:nextId');
      localStorage.removeItem('drawpak:svg_elements:nextId');
    } catch {
      // ignore
    }

    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch (e) {
    console.warn('Migration to IndexedDB failed:', e);
    // don't throw - fall back to empty DB
    localStorage.setItem(MIGRATED_FLAG, '1');
  }
}

export async function initDatabase(): Promise<boolean> {
  await db.open();
  await migrateFromLocalStorageIfNeeded();
  // Seed default symbols if needed
  await initializeBasicElements();
  return true;
}

export async function saveSchema(schema: Schema): Promise<number> {
  await initDatabase();
  const now = nowIso();
  const toSave: Schema = {
    ...schema,
    created_at: schema.created_at || now,
    created_by: schema.created_by || undefined,
  updated_by: schema.updated_by || schema.created_by || undefined,
  updated_at: now,
  local: typeof schema.local === 'boolean' ? schema.local : false
  };

  if (toSave.id && typeof toSave.id === 'number') {
    await db.schemas.put(toSave);
    return toSave.id;
  }

  const id = await db.schemas.add(toSave);
  return Number(id);
}

export async function updateSchema(id: number, schema: Partial<Schema>): Promise<void> {
  await initDatabase();
  const cur = await db.schemas.get(id);
  if (!cur) throw new Error('Esquema no encontrado');
  const updated: Schema = { ...cur, ...schema, updated_at: nowIso(), updated_by: schema.updated_by || cur.updated_by || cur.created_by, local: typeof schema.local === 'boolean' ? schema.local : cur.local } as Schema;
  await db.schemas.put(updated);
}

export async function getAllSchemas(): Promise<Schema[]> {
  await initDatabase();
  const all = await db.schemas.toArray();
  return all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getSchemaById(id: number): Promise<Schema | null> {
  await initDatabase();
  const s = await db.schemas.get(id);
  return s || null;
}

export async function deleteSchema(id: number): Promise<void> {
  await initDatabase();
  await db.schemas.delete(id);
}

export async function duplicateSchema(id: number, newName: string): Promise<number> {
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
export async function saveSvgElement(elem: SvgElement): Promise<number> {
  await initDatabase();
  const now = nowIso();
  const toSave: SvgElement = {
    ...elem,
    created_at: elem.created_at || now,
    created_by: elem.created_by || undefined,
  updated_by: elem.updated_by || elem.created_by || undefined,
  updated_at: now,
  local: typeof elem.local === 'boolean' ? elem.local : false
  };

  if (toSave.id && typeof toSave.id === 'number') {
    await db.svg_elements.put(toSave);
    return toSave.id;
  }

  const id = await db.svg_elements.add(toSave);
  return Number(id);
}

export async function updateSvgElement(id: number, elem: Partial<SvgElement>): Promise<void> {
  await initDatabase();
  const cur = await db.svg_elements.get(id);
  if (!cur) throw new Error('SVG element not found');
  const updated: SvgElement = { ...cur, ...elem, updated_at: nowIso(), updated_by: elem.updated_by || cur.updated_by || cur.created_by, local: typeof elem.local === 'boolean' ? elem.local : cur.local } as SvgElement;
  await db.svg_elements.put(updated);
}

export async function getAllSvgElements(): Promise<SvgElement[]> {
  await initDatabase();
  const all = await db.svg_elements.toArray();
  return all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getSvgElementById(id: number): Promise<SvgElement | null> {
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

export async function deleteSvgElement(id: number): Promise<void> {
  await initDatabase();
  await db.svg_elements.delete(id);
}

export async function clearAllSvgElements(): Promise<void> {
  await initDatabase();
  await db.svg_elements.clear();
}

export async function initializeBasicElements(): Promise<void> {
  // Use the original canonical seeder (initializeBasicElementsOriginal)
  // which contains the full set of elements originally provided.
  await initializeBasicElementsOriginal();
}

export async function reinitializeBasicElements(): Promise<void> {
  await clearAllSvgElements();
  await initializeBasicElements();
}

export async function initializeBasicElementsOriginal(): Promise<void> {
  // Evitar seeding concurrente en la misma sesión
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    // Verificar si ya existen elementos básicos (usar conteo directo para evitar reentradas)
    const count = await db.svg_elements.count();
    if (count > 0) {
      //console.log('Elementos básicos ya están inicializados');
      return;
    }

    //console.log('Inicializando elementos básicos desde symbols.data.tsx...');

    // Transformadores
    const transformadores = [
      {
        name: 'Transformador',
        description: 'Transformador básico',
        category: 'transformadores',
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
        name: 'Transformador Doble',
        description: 'Transformador con doble salida',
        category: 'transformadores',
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
        name: 'Interruptor',
        description: 'Interruptor',
        category: 'proteccion',
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
        name: 'Interruptor Extraido',
        description: 'Interruptor',
        category: 'proteccion',
        svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" style="background: rgba(255, 255, 255, 0);">
          <defs xmlns="http://www.w3.org/2000/svg"/>
          <g xmlns="http://www.w3.org/2000/svg">
              <g xmlns="http://www.w3.org/2000/svg" transform="rotate(0, 100, 46)">
                  <rect xmlns="http://www.w3.org/2000/svg" fill="rgba(255, 255, 255, 0)" height="50" x="60" width="80" y="21" stroke="#000" stroke-width="2"/>
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
        name: 'Seccionador',
        description: 'Seccionador de línea',
        category: 'proteccion',
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
        name: 'Barra Simple',
        description: 'Barras de conexión',
        category: 'infraestructura',
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
        name: 'Barra Doble',
        description: 'Barras de conexión',
        category: 'infraestructura',
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
        name: 'Barra Triple',
        description: 'Barras de conexión',
        category: 'infraestructura',
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
        name: 'Candado',
        description: 'Dispositivo de bloqueo',
        category: 'seguridad',
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
        name: 'Bloqueo',
        description: 'Zona de bloqueo',
        category: 'seguridad',
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
        name: 'Puesta a Tierra',
        description: 'Conexión a tierra',
        category: 'seguridad',
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
            //console.log(`Elemento ya existe, saltando: ${element.name} (${element.category})`);
            continue;
          }

          const elem: SvgElement = {
            name: element.name,
            description: element.description || '',
            category: element.category || 'basic',
            svg: element.svg,
            handles: element.handles || '',
            created_at: nowIso(),
            created_by: 'pbarbeito',
            updated_at: nowIso()
          };
          await db.svg_elements.add(elem);
          //console.log(`Elemento guardado: ${element.name} (${element.category})`);
        }
      });
      //console.log('Elementos básicos inicializados correctamente');
    } catch (err) {
      console.error('Error inicializando elementos básicos:', err);
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}