import React, { useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
} from 'reactflow';
import type { Node, OnConnect, Edge, ReactFlowInstance } from 'reactflow';
import DynamicPalette from './DynamicPalette';
import { nodeTypes, defaultEdgeOptions, snapGrid } from './reactFlowConfig.ts';
import { initDatabase, saveSchema, getAllSchemas, duplicateSchema, updateSchema, saveSvgElement, getAllSvgElements, getSvgCategories, syncSvgsWithBackend, syncSchemasWithBackend, reconcileUserLibrary, reconcileUserSchemas, clearAllSvgElements, deleteDatabase } from './database.ts';
import { useNotifier } from './useNotifier';
import type { Schema, SvgElement } from './database.ts';
import SvgEditorDialog from './SvgEditorDialog';
import NotifierRenderer from './Notifier';
// dynamic imports for large libraries (jsPDF, html-to-image) are loaded only when exporting
import type { PolygonPoint } from './PolygonNode';
// No Tauri runtime in web build — all file save actions use browser fallbacks.
import { Box, AppBar, Toolbar, IconButton, Typography, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, FormControlLabel, Checkbox, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import Popover from '@mui/material/Popover';
import { RgbaColorPicker } from 'react-colorful';

// Replaced MUI SVG icon components with material symbol spans
let id = 0;
const getId = (): string => `node_${id++}`;

const GRID_SIZE = 20;
function snapToGridPos(
  pos: { x: number; y: number },
  gridSize = GRID_SIZE,
) {
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize,
  };
}

// Función centralizada para encontrar una posición libre
function findFreePosition(
  desiredPosition: { x: number; y: number },
  nodes: Node<unknown>[],
  excludeNodeId?: string,
  gridSize = GRID_SIZE
): { x: number; y: number } {
  const isPositionOccupied = (pos: { x: number; y: number }) => {
    return nodes.some(node =>
      node.id !== excludeNodeId &&
      node.position.x === pos.x &&
      node.position.y === pos.y
    );
  };

  const position = snapToGridPos(desiredPosition, gridSize);

  // Si la posición deseada está libre, usarla
  if (!isPositionOccupied(position)) {
    return position;
  }

  // Buscar en espiral alrededor de la posición deseada
  const maxRadius = 10; // Máximo 10 celdas de radio
  for (let radius = 1; radius <= maxRadius; radius++) {
    // Probar posiciones en un patrón en espiral
    const directions = [
      { x: gridSize, y: 0 },      // derecha
      { x: 0, y: gridSize },      // abajo
      { x: -gridSize, y: 0 },     // izquierda
      { x: 0, y: -gridSize },     // arriba
      { x: gridSize, y: gridSize }, // diagonal inferior derecha
      { x: -gridSize, y: gridSize }, // diagonal inferior izquierda
      { x: -gridSize, y: -gridSize }, // diagonal superior izquierda
      { x: gridSize, y: -gridSize }   // diagonal superior derecha
    ];

    for (const direction of directions) {
      const candidatePos = {
        x: position.x + (direction.x * radius),
        y: position.y + (direction.y * radius)
      };

      if (!isPositionOccupied(candidatePos)) {
        return candidatePos;
      }
    }
  }

  // Si no se encuentra posición libre, devolver la original con un desplazamiento aleatorio
  return {
    x: position.x + (Math.random() * 4 - 2) * gridSize,
    y: position.y + (Math.random() * 4 - 2) * gridSize
  };
}

function FlowApp(): React.ReactElement {
  // Tipado específico para los datos de nodo/edge en esta app
  type ElectNodeData = {
    label: string;
    rotation?: number;
    scale?: number;
    flipX?: boolean;
    flipY?: boolean;
    invertHandles?: boolean;
    symbolKey?: string;
    isDynamicSvg?: boolean;
    svg?: string;
    fontSize?: number;
    color?: string;
    handles?: string;
    backgroundColor?: string;
    primaryColor?: string;
    borderColor?: string;
    borderWidth?: number;
    // Polygon visual properties
    strokeWidth?: number;
    strokeColor?: string;
    fillColor?: string;
    fillOpacity?: number;
  };
  type ElectEdgeData = Record<string, unknown>;
  // Use React Flow's Edge type for correctness (id is required)
  type FlowEdge = Edge<ElectEdgeData>;

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ElectNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ElectEdgeData>([]);
  const notifier = useNotifier();

  // Ensure label nodes are always rendered on top by placing them at the end
  React.useEffect(() => {
    if (nodes.length === 0) return;
    const labels = nodes.filter(n => n.type === 'labelNode');
    if (labels.length === 0) return;
    const others = nodes.filter(n => n.type !== 'labelNode');
    const reordered = [...others, ...labels];
    const same = reordered.length === nodes.length && reordered.every((n, i) => n.id === nodes[i].id);
    if (!same) {
      // Update nodes to keep labels on top
      setNodes(reordered);
    }
  }, [nodes, setNodes]);

  // Color picker popover anchors
  const [bgPickerAnchor, setBgPickerAnchor] = React.useState<HTMLElement | null>(null);
  const [primaryPickerAnchor, setPrimaryPickerAnchor] = React.useState<HTMLElement | null>(null);
  const [labelBgPickerAnchor, setLabelBgPickerAnchor] = React.useState<HTMLElement | null>(null);
  const [labelBorderPickerAnchor, setLabelBorderPickerAnchor] = React.useState<HTMLElement | null>(null);
  const [labelTextColorAnchor, setLabelTextColorAnchor] = React.useState<HTMLElement | null>(null);
  const [polygonStrokePickerAnchor, setPolygonStrokePickerAnchor] = React.useState<HTMLElement | null>(null);
  const [polygonFillPickerAnchor, setPolygonFillPickerAnchor] = React.useState<HTMLElement | null>(null);
  // Username management: required before performing actions
  const [username, setUsername] = React.useState<string | null>(localStorage.getItem('dp_username'));
  const [usernameInput, setUsernameInput] = React.useState<string>('');
  const [showUsernameDialog, setShowUsernameDialog] = React.useState<boolean>(false);

  const isValidUsername = React.useCallback((u?: string | null) => {
    if (!u) return false;
    return /^[a-zA-Z0-9]{6,}$/.test(u);
  }, []);

  const requireValidUser = React.useCallback(() => {
    if (!isValidUsername(username)) {
      setUsernameInput('');
      setShowUsernameDialog(true);
      return false;
    }
    return true;
  }, [isValidUsername, username]);

  const handleUsernameSave = React.useCallback(async () => {
    if (!isValidUsername(usernameInput)) return;
    try {
      localStorage.setItem('dp_username', usernameInput);
      setUsername(usernameInput);
      setShowUsernameDialog(false);
      // Try to reconcile immediately for this username so local DB reflects server
      try {
        await reconcileUserLibrary(usernameInput);
      } catch (err) {
        console.warn('reconcileUserLibrary failed on username save:', err);
      }
      try {
        await reconcileUserSchemas(usernameInput);
      } catch (err) {
        console.warn('reconcileUserSchemas failed on username save:', err);
      }
      // reload the page so the UI picks up the new library state cleanly
      try { window.location.reload(); } catch { /* ignore */ }
    } catch (err) {
      console.error('handleUsernameSave failed', err);
    }
  }, [usernameInput, isValidUsername]);


  const handleUsernameCancel = React.useCallback(() => {
    // If no valid username yet, keep dialog open (force); otherwise close
    if (!isValidUsername(username)) {
      // keep dialog open, no-op
      return;
    }
    setShowUsernameDialog(false);
  }, [isValidUsername, username]);

  // Logout: borrar todos los datos locales (IndexedDB + localStorage relevantes) y recargar la app
  const handleLogout = React.useCallback(async () => {
    try {
      // Clear localStorage keys used by the app
      const keysToRemove = ['dp_username', 'username', 'drawpak-current-schema', 'drawpak-current-schema-id'];
      try {
        // remove any user_library updated_at keys
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('drawpak:user_library_updated_at:')) localStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
      for (const k of keysToRemove) localStorage.removeItem(k);

      // Clear IndexedDB via provided helpers: clear svg elements and reinitialize DB
      try {
        // clearAllSvgElements is exported and will open DB internally
        await clearAllSvgElements();
      } catch {
        console.warn('Failed to clear svg elements during logout');
      }

      // Also attempt to delete the entire IndexedDB database by name (drawpak)
      try {
        await deleteDatabase();
      } catch {
        // ignore
      }

      // Finally, reload the page to reset app state
      setTimeout(() => {
        try { window.location.reload(); } catch { /* ignore */ }
      }, 50);
    } catch (err) {
      console.error('Error during logout:', err);
      try { notifier.notify({ message: 'Error cerrando sesión', severity: 'error' }); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount ensure we prompt for username if missing/invalid
  React.useEffect(() => {
    if (!isValidUsername(username)) {
      setShowUsernameDialog(true);
    }
  }, [isValidUsername, username]);
  // Helpers: parse hex / rgba strings to an object usable by RgbaColorPicker
  function hexToRgb(hex: string) {
    const cleaned = hex.replace('#', '').trim();
    if (cleaned.length === 3) {
      const r = parseInt(cleaned[0] + cleaned[0], 16);
      const g = parseInt(cleaned[1] + cleaned[1], 16);
      const b = parseInt(cleaned[2] + cleaned[2], 16);
      return { r, g, b };
    }
    if (cleaned.length === 6) {
      const r = parseInt(cleaned.slice(0, 2), 16);
      const g = parseInt(cleaned.slice(2, 4), 16);
      const b = parseInt(cleaned.slice(4, 6), 16);
      return { r, g, b };
    }
    return { r: 0, g: 0, b: 0 };
  }

  function parseColorToRgba(obj: string | undefined, overrideAlpha?: number) {
    const fallback = { r: 255, g: 255, b: 255, a: 1 };
    if (!obj) return { ...fallback, a: typeof overrideAlpha === 'number' ? overrideAlpha : fallback.a };
    const s = obj.trim();
    let base = { ...fallback };
    if (s.startsWith('rgba')) {
      // rgba( r, g, b, a )
      const nums = s.replace(/rgba\(|\)/g, '').split(',').map(p => p.trim());
      if (nums.length >= 4) {
        const r = Number(nums[0]) || 0;
        const g = Number(nums[1]) || 0;
        const b = Number(nums[2]) || 0;
        const aRaw = Number(nums[3]);
        const a = Number.isFinite(aRaw) ? aRaw : 1;
        base = { r, g, b, a };
      } else {
        return { ...fallback, a: typeof overrideAlpha === 'number' ? overrideAlpha : fallback.a };
      }
    } else if (s.startsWith('rgb(')) {
      const nums = s.replace(/rgb\(|\)/g, '').split(',').map(p => p.trim());
      if (nums.length >= 3) {
        base = { r: Number(nums[0]) || 0, g: Number(nums[1]) || 0, b: Number(nums[2]) || 0, a: 1 };
      } else {
        return { ...fallback, a: typeof overrideAlpha === 'number' ? overrideAlpha : fallback.a };
      }
    } else {
      // assume hex
      const { r, g, b } = hexToRgb(s);
      base = { r, g, b, a: 1 };
    }
    return { ...base, a: typeof overrideAlpha === 'number' ? overrideAlpha : base.a };
  }

  function rgbaToString(c: { r: number; g: number; b: number; a?: number }) {
    const a = typeof c.a === 'number' ? c.a : 1;
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(a.toFixed(3))})`;
  }

  // Clipboard para copiar/pegar nodos
  const [clipboard, setClipboard] = React.useState<{ nodes: Node<ElectNodeData>[]; edges: FlowEdge[] } | null>(null);

  // Runtime type guards for parsed JSON structures
  function isNodeObject(obj: unknown): obj is Node<ElectNodeData> {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    const pos = o.position as Record<string, unknown> | undefined;
    return typeof o.id === 'string' && !!pos && typeof pos.x === 'number' && typeof pos.y === 'number';
  }

  function isEdgeObject(obj: unknown): obj is Edge<ElectEdgeData> {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    return typeof o.source === 'string' && typeof o.target === 'string' && typeof o.id === 'string';
  }

  // Estado para la selección de área de exportación
  const [isSelectingExportArea, setIsSelectingExportArea] = React.useState(false);
  const [exportArea, setExportArea] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDrawingArea, setIsDrawingArea] = React.useState(false);
  const [areaStart, setAreaStart] = React.useState<{ x: number; y: number } | null>(null);
  // Control para mostrar/ocultar el overlay de selección (podemos esconderlo temporalmente al exportar)
  const [showSelectionOverlay, setShowSelectionOverlay] = React.useState(true);
  // Tipo de export pendiente cuando se activa la selección de área: 'png' | 'pdf' | null
  const [pendingExportType, setPendingExportType] = React.useState<'png' | 'pdf' | null>(null);
  // Orientación para exportar a PDF cuando pendingExportType === 'pdf'
  const [exportPDFOrientation, setExportPDFOrientation] = React.useState<'portrait' | 'landscape'>('portrait');
  const [showBackground, setShowBackground] = React.useState(true);
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null);

  // Estado para historial de deshacer/rehacer
  const [history, setHistory] = React.useState<Array<{ nodes: Node<ElectNodeData>[]; edges: FlowEdge[] }>>([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [isUndoRedoAction, setIsUndoRedoAction] = React.useState(false);

  // Estado para gestión de esquemas
  const [showSchemasDialog, setShowSchemasDialog] = React.useState(false);
  const [showSvgDialog, setShowSvgDialog] = React.useState(false);
  const [svgElements, setSvgElements] = React.useState<SvgElement[]>([]);
  const [svgCategories, setSvgCategories] = React.useState<string[]>([]);
  const [svgName, setSvgName] = React.useState('');

  // Estado para polígonos
  const [isDrawingPolygon, setIsDrawingPolygon] = React.useState(false);
  const [currentPolygonPoints, setCurrentPolygonPoints] = React.useState<PolygonPoint[]>([]);
  const [mousePosition, setMousePosition] = React.useState<PolygonPoint | null>(null);
  const [svgDescription, setSvgDescription] = React.useState('');
  const [svgCategory, setSvgCategory] = React.useState('custom');
  const [svgMarkup, setSvgMarkup] = React.useState('');
  const [svgHandles, setSvgHandles] = React.useState('');
  const [sanitizedSvg, setSanitizedSvg] = React.useState('');
  const [useEditor, setUseEditor] = React.useState(true);

  // nodeTypes and defaultEdgeOptions are defined outside components in reactFlowConfig
  // so they can be used directly without memoization
  // Ensure stable references for ReactFlow by memoizing imported configuration
  const stableNodeTypes = React.useMemo(() => nodeTypes, []);
  const stableDefaultEdgeOptions = React.useMemo(() => defaultEdgeOptions, []);
  const theme = useTheme();

  // Effect: when an edge is selected and connects two symbolNode nodes,
  // color it gray; restore original color when unselected or endpoints change.
  React.useEffect(() => {
    if (!nodes || !edges) return;

    const nodeTypeById = new Map<string, string>();
    for (const n of nodes) nodeTypeById.set(n.id, n.type || '');

    let changed = false;
    const updated = edges.map((e) => {
      const srcType = nodeTypeById.get(e.source) || '';
      const tgtType = nodeTypeById.get(e.target) || '';
      const shouldBeGray = Boolean(e.selected && srcType === 'symbolNode' && tgtType === 'symbolNode');

      const styleObj = (e.style as Record<string, unknown> | undefined) || undefined;
      const defaultStroke = (stableDefaultEdgeOptions.style as Record<string, unknown> | undefined)?.stroke as string | undefined;
      const currentStroke = (styleObj && (styleObj.stroke as string | undefined)) || defaultStroke || '#000000';

      if (shouldBeGray) {
        if (currentStroke !== '#9e9e9e') {
          changed = true;
          return { ...e, style: { ...(e.style || {}), stroke: '#9e9e9e' } };
        }
        return e;
      }

      // If it shouldn't be gray but currently is, restore to default
      if (styleObj && (styleObj.stroke as string | undefined) === '#9e9e9e') {
        changed = true;
        return { ...e, style: { ...(e.style || {}), stroke: defaultStroke || '#000000' } };
      }
      return e;
    });

    if (changed) {
      setEdges(updated);
    }
  }, [edges, nodes, setEdges, stableDefaultEdgeOptions]);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!svgMarkup) {
        if (mounted) setSanitizedSvg('');
        return;
      }
      try {
        const DOMPurifyModule = await import('dompurify');
        const mod = DOMPurifyModule as unknown;
        const asModule = mod as { default?: unknown; sanitize?: unknown };
        const maybeDefault = asModule.default;
        const sanitizer = (maybeDefault ?? asModule) as { sanitize?: (...args: unknown[]) => unknown };
        const safe = sanitizer.sanitize ? String(sanitizer.sanitize(svgMarkup, { USE_PROFILES: { svg: true } })) : svgMarkup;
        if (mounted) setSanitizedSvg(safe);
      } catch (e) {
        console.warn('dompurify not available, using raw svg markup for preview', e);
        if (mounted) setSanitizedSvg(svgMarkup);
      }
    })();
    return () => { mounted = false; };
  }, [svgMarkup]);
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [schemas, setSchemas] = React.useState<Schema[]>([]);
  const [schemaSearch, setSchemaSearch] = React.useState('');
  const [schemaFilter, setSchemaFilter] = React.useState<'activos' | 'eliminados' | 'todos' | 'locales' | 'propios'>('activos');
  const [schemaName, setSchemaName] = React.useState('');
  const [schemaDescription, setSchemaDescription] = React.useState('');
  const [schemaLocal, setSchemaLocal] = React.useState(false); // false = save to cloud by default
  const [isTemplate, setIsTemplate] = React.useState(false);
  const [currentSchemaId, setCurrentSchemaId] = React.useState<string | null>(null); // ID del esquema actual en edición
  const [currentSchemaName, setCurrentSchemaName] = React.useState<string>(''); // Nombre del esquema actual en edición
  const [currentSchemaDescription, setCurrentSchemaDescription] = React.useState<string>(''); // Descripción del esquema actual en edición
  const [currentSchemaLocal, setCurrentSchemaLocal] = React.useState<boolean>(false); // false = save to cloud by default
  const [isHandlingNewSchema, setIsHandlingNewSchema] = React.useState(false); // Para prevenir ejecuciones múltiples
  const [showNewSchemaConfirm, setShowNewSchemaConfirm] = React.useState(false); // Diálogo de confirmación para nuevo esquema

  // Dialog state for schema delete/restore confirmations (replace window.confirm)
  const [schemaConfirmOpen, setSchemaConfirmOpen] = React.useState<boolean>(false);
  const [schemaConfirmAction, setSchemaConfirmAction] = React.useState<'delete' | 'restore' | null>(null);
  const [schemaToAct, setSchemaToAct] = React.useState<{ id: string; name: string } | null>(null);

  // Inicializar la base de datos al cargar la aplicación
  React.useEffect(() => {
    void (async () => {
      try {
        await initDatabase();
        // Ejecutar sincronización con backend después de inicializar DB en cada recarga
        try {
          await syncSvgsWithBackend();
        } catch (e) {
          console.warn('syncSvgsWithBackend fallo (no bloqueante):', e);
        }
        try {
          await syncSchemasWithBackend();
        } catch (e) {
          console.warn('syncSchemasWithBackend fallo (no bloqueante):', e);
        }
        // Reconcile user library automatically if we have a username configured.
        const storedUser = localStorage.getItem('dp_username') || localStorage.getItem('username') || null;
        if (storedUser) {
          try {
            await reconcileUserLibrary(storedUser);
          } catch (e) {
            console.warn('reconcileUserLibrary failed:', e);
          }
          try {
            await reconcileUserSchemas(storedUser);
          } catch (e) {
            console.warn('reconcileUserSchemas failed:', e);
          }
        }
      } catch (error) {
        console.error('Error inicializando la base de datos:', error);
      }
    })();
  }, []);

  // cargar elementos svg guardados
  const loadSvgElements = useCallback(async () => {
    try {
      const elems = await getAllSvgElements();
      setSvgElements(elems);
    } catch (e) {
      console.error('Error cargando svg elements', e);
    }
  }, []);

  // cargar categorías disponibles
  const loadSvgCategories = useCallback(async () => {
    try {
      const categories = await getSvgCategories();
      setSvgCategories(categories);
    } catch (e) {
      console.error('Error cargando categorías', e);
    }
  }, []);

  // Escuchar eventos externos para recargar SVGs y categorías (por ejemplo después de marcar hidden=true)
  React.useEffect(() => {
    const onUpdated = () => {
      void loadSvgElements();
      void loadSvgCategories();
    };
    window.addEventListener('svg-elements-updated', onUpdated as EventListener);
    return () => window.removeEventListener('svg-elements-updated', onUpdated as EventListener);
  }, [loadSvgElements, loadSvgCategories]);

  // Usamos el editor interno SvgShapeEditor en lugar de cargar librerías externas
  React.useEffect(() => {
    if (showSvgDialog) {
      // aseguramos que el toggle de uso de editor gráfico esté activo por defecto
      setUseEditor(true);
    }
  }, [showSvgDialog]);

  // Funciones para manejar esquemas
  const loadSchemas = useCallback(async () => {
    try {
      const allSchemas = await getAllSchemas();
      setSchemas(allSchemas);
    } catch (error) {
      console.error('Error cargando esquemas:', error);
    }
  }, []);

  const handleManualSyncSchemas = useCallback(async () => {
    try {
      const user = localStorage.getItem('dp_username') || localStorage.getItem('username') || null;
      if (!user) {
        try { notifier.notify({ message: 'Configura un nombre de usuario antes de sincronizar.', severity: 'warning' }); } catch { /* ignore */ }
        return;
      }
      await reconcileUserSchemas(user);
      await loadSchemas();
      try { notifier.notify({ message: 'Sincronización de esquemas completada', severity: 'success' }); } catch { /* ignore */ }
    } catch (err) {
      console.error('Error sincronizando esquemas manualmente:', err);
      try { notifier.notify({ message: 'Error al sincronizar esquemas', severity: 'error' }); } catch { /* ignore */ }
    }
  }, [loadSchemas, notifier]);



  const handleSaveSchema = useCallback(async () => {
    try {
      // Si hay un esquema actual en edición, actualizarlo directamente
      if (currentSchemaId) {
        await updateSchema(currentSchemaId, {
          name: schemaName,
          description: schemaDescription,
          nodes: JSON.stringify(nodes),
          edges: JSON.stringify(edges),
          updated_by: username || localStorage.getItem('dp_username') || 'unknown',
          local: schemaLocal
        });

        // Actualizar localStorage y estado local
        setCurrentSchemaName(schemaName);
        setCurrentSchemaDescription(schemaDescription);
        setCurrentSchemaLocal(schemaLocal);
        saveToLocalStorage(nodes, edges, currentSchemaId, schemaName);

        await loadSchemas();
        setShowSaveDialog(false);
        return;
      }

      // Si no hay esquema actual, pedir nombre para crear uno nuevo
      if (!schemaName.trim()) {
        try { notifier.notify({ message: 'Por favor ingresa un nombre para el esquema', severity: 'warning' }); } catch { /* ignore */ }
        return;
      }

      const creator = username || localStorage.getItem('dp_username') || 'unknown';
      const newSchemaId = await saveSchema({
        name: schemaName,
        description: schemaDescription,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        created_by: creator,
        updated_by: creator,
        local: schemaLocal
      });

      // Establecer el nuevo esquema como actual
      setCurrentSchemaId(newSchemaId);
      setSchemaName('');
      setCurrentSchemaName(schemaName);
      setCurrentSchemaDescription(schemaDescription);
      setCurrentSchemaLocal(schemaLocal);
      // Actualizar localStorage con el nuevo ID
      saveToLocalStorage(nodes, edges, newSchemaId, schemaName);

      setShowSaveDialog(false);
      setSchemaName('');
      setSchemaDescription('');
      setIsTemplate(false);
      await loadSchemas();
    } catch (error) {
      console.error('Error guardando esquema:', error);
      try { notifier.notify({ message: 'Error al guardar el esquema', severity: 'error' }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaName, schemaDescription, nodes, edges, isTemplate, loadSchemas, currentSchemaId, setCurrentSchemaId, schemaLocal, username, notifier]);

  // Guardar elemento SVG en DB
  const handleSaveSvgElement = useCallback(async (localFlag?: boolean) => {
    try {
      if (!svgName.trim()) {
        try { notifier.notify({ message: 'Ingresa un nombre para el elemento SVG', severity: 'warning' }); } catch { /* ignore */ }
        return;
      }

      // Sanitizar markup antes de guardar
      // dompurify se importará dinámicamente para evitar problemas en build web
      // DOMPurify may provide a sanitize function; keep a permissive runtime guard
      let DOMPurify: { sanitize?: (...args: unknown[]) => unknown } | null = null;
      try {
        const dm = await import('dompurify');
        const m = dm as unknown;
        const asModule = m as { default?: unknown; sanitize?: unknown };
        DOMPurify = (asModule.default ?? asModule) as { sanitize?: (...args: unknown[]) => unknown };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        // fallback: no sanitizar (en entornos controlados esto no debería pasar)
        console.warn('dompurify no disponible, guardando sin sanitizar');
      }

      // Primera sanitización/entrada
      let sanitized = DOMPurify && DOMPurify.sanitize ? String(DOMPurify.sanitize(svgMarkup, { USE_PROFILES: { svg: true } })) : svgMarkup;

      // Limpieza adicional: eliminar elementos de la UI del editor antes de persistir
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitized || '', 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          // remover nodos de editor si quedaron (handles temporales y rects de redimension)
          svgEl.querySelectorAll('[data-editor-handle="true"], [data-editor-resize="true"]').forEach(n => n.remove());

          // intentar asegurar un viewBox útil: si no tiene, pero tiene width/height, derivarlo
          const hasViewBox = svgEl.hasAttribute('viewBox') && svgEl.getAttribute('viewBox')?.trim() !== '';
          const wAttr = svgEl.getAttribute('width');
          const hAttr = svgEl.getAttribute('height');
          if (!hasViewBox && wAttr && hAttr) {
            const pw = parseFloat(wAttr.toString().replace(/[^0-9.-]/g, ''));
            const ph = parseFloat(hAttr.toString().replace(/[^0-9.-]/g, ''));
            if (!isNaN(pw) && !isNaN(ph) && pw > 0 && ph > 0) {
              svgEl.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
            }
          }

          // eliminar width/height para que el SVG sea escalable (guardamos viewBox cuando sea posible)
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');

          const serializer = new XMLSerializer();
          sanitized = serializer.serializeToString(svgEl);
        } else {
          // si no encontramos <svg>, no convertir
          // sanitized permanece como estaba
        }
      } catch (e) {
        console.warn('Error limpiando SVG antes de guardar:', e);
      }

      const elem: SvgElement = {
        name: svgName,
        description: svgDescription,
        category: svgCategory,
        svg: sanitized,
        handles: svgHandles || ''
      };

      const creator = username || localStorage.getItem('dp_username') || 'unknown';
      await saveSvgElement({ ...elem, created_by: creator, updated_by: creator, local: typeof localFlag === 'boolean' ? localFlag : false });
      setShowSvgDialog(false);
      setSvgName('');
      setSvgDescription('');
      setSvgCategory('custom');
      setSvgMarkup('');
      setSvgHandles('');
      await loadSvgElements();
    } catch (e) {
      console.error('Error guardando svg element', e);
      try { notifier.notify({ message: 'Error guardando elemento SVG', severity: 'error' }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgName, svgDescription, svgMarkup, svgHandles, loadSvgElements, notifier]);

  // Función para manejar el clic del botón guardar
  const handleSaveButtonClick = useCallback(() => {
    // Si hay un esquema actual, pre-llenar los campos con los datos actuales
    if (currentSchemaId) {
      // find current schema in loaded schemas to populate fields
      const found = schemas.find(s => s.id === currentSchemaId);
      if (found) {
        setSchemaName(found.name || currentSchemaName || '');
        setSchemaDescription(found.description || '');
        setSchemaLocal(typeof found.local === 'boolean' ? found.local : false);
      } else {
        setSchemaName(currentSchemaName || '');
      }
    } else {
      // Preparar campos para nuevo esquema
      setSchemaName('');
      setSchemaDescription('');
    }

    // Siempre abrir el diálogo para permitir editar nombre/descripción
    setShowSaveDialog(true);
  }, [currentSchemaId, currentSchemaName, schemas]);

  const handleLoadSchema = useCallback(async (schema: Schema) => {
    try {
      const parsedNodesRaw = JSON.parse(schema.nodes) as unknown;
      const parsedEdgesRaw = JSON.parse(schema.edges) as unknown;

      // Validate parsed structures are arrays and contain expected shapes
      const parsedNodes = Array.isArray(parsedNodesRaw) ? (parsedNodesRaw as Array<unknown>).filter(isNodeObject) : [];
      const parsedEdges = Array.isArray(parsedEdgesRaw) ? (parsedEdgesRaw as Array<unknown>).filter(isEdgeObject) : [];

      setNodes(parsedNodes);
      setEdges(parsedEdges);
      setShowSchemasDialog(false);

      // Establecer el ID del esquema actual para futuras actualizaciones
      setCurrentSchemaId(schema.id || null);
      setCurrentSchemaName(schema.name || '');
      setCurrentSchemaDescription(schema.description || '');
      setCurrentSchemaLocal(typeof schema.local === 'boolean' ? schema.local : false);

      // Guardar en localStorage con el ID del esquema
      saveToLocalStorage(parsedNodes, parsedEdges, schema.id || null, schema.name);

      // Sincronizar el contador de ID con los nodos cargados
      let maxId = 0;
      for (const node of parsedNodes) {
        const match = node.id?.toString().match(/node_(\d+)/);
        if (match) {
          maxId = Math.max(maxId, Number(match[1]));
        }
      }
      id = maxId + 1;
    } catch (error) {
      console.error('Error cargando esquema:', error);
      try { notifier.notify({ message: 'Error al cargar el esquema', severity: 'error' }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes, setEdges, setCurrentSchemaId, setCurrentSchemaName, notifier]);

  // Función para importar elementos de un esquema al esquema actual
  const handleImportSchema = useCallback(async (schema: Schema) => {
    try {
      const parsedNodes = JSON.parse(schema.nodes);
      const parsedEdges = JSON.parse(schema.edges);

      // Crear un mapa de IDs antiguos a nuevos para evitar conflictos
      const nodeIdMap = new Map<string, string>();

      // Generar nuevos IDs para los nodos importados y encontrar posiciones libres
      const sourceNodes = Array.isArray(parsedNodes) ? parsedNodes : [];
      const sourceEdges = Array.isArray(parsedEdges) ? parsedEdges : [];

      const newNodes = sourceNodes.map((node) => {
        const newId = `node_${id++}`;
        nodeIdMap.set(node.id, newId);

        // Usar findFreePosition para evitar colisiones
        const desiredPosition = {
          x: node.position.x + 100, // Offset inicial
          y: node.position.y + 100
        };
        const freePosition = findFreePosition(desiredPosition, nodes);

        return {
          ...node,
          id: newId,
          selected: false, // Deseleccionar nodos importados
          position: freePosition
        } as Node<ElectNodeData>;
      });

      // Actualizar IDs en las conexiones importadas
      const newEdges = sourceEdges
        .filter((edge) => nodeIdMap.has(edge.source) && nodeIdMap.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: `edge_${nodeIdMap.get(edge.source)!}_${nodeIdMap.get(edge.target)!}`,
          source: nodeIdMap.get(edge.source)!,
          target: nodeIdMap.get(edge.target)!,
          selected: false
        } as Edge<ElectEdgeData>));

      // Agregar los nuevos elementos al esquema actual
      const updatedNodes = [...nodes, ...newNodes];
      const updatedEdges = [...edges, ...newEdges];

      setNodes(updatedNodes);
      setEdges(updatedEdges);
      setShowSchemasDialog(false);

    } catch (error) {
      console.error('Error importando esquema:', error);
      try { notifier.notify({ message: 'Error al importar el esquema', severity: 'error' }); } catch { /* ignore */ }
    }
  }, [nodes, edges, setNodes, setEdges, notifier]);

  // JSX: schema confirm dialog (replace window.confirm usages)
  // We'll render it alongside other dialogs; it uses schemaConfirmOpen/schemaToAct/schemaConfirmAction
  const SchemaConfirmDialog = (
    <Dialog open={schemaConfirmOpen} onClose={() => { setSchemaConfirmOpen(false); setSchemaToAct(null); setSchemaConfirmAction(null); }}>
      <DialogTitle sx={{ textAlign: 'center', backgroundColor: '#263238', color: '#fff', fontSize: 18, fontWeight: 400, padding: '12px 16px' }}>
        {schemaConfirmAction === 'delete' ? 'Marcar como eliminado' : 'Restaurar esquema'}
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Typography>
          {schemaConfirmAction === 'delete'
            ? `¿Deseas marcar como eliminado el esquema "${schemaToAct?.name}"? Esto lo ocultará en la lista y en el editor.`
            : `¿Deseas restaurar el esquema "${schemaToAct?.name}"?`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setSchemaConfirmOpen(false); setSchemaToAct(null); setSchemaConfirmAction(null); }} color="secondary">Cancelar</Button>
        <Button color={schemaConfirmAction === 'delete' ? 'error' : 'success'} onClick={() => { void performSchemaConfirm(); }}>
          {schemaConfirmAction === 'delete' ? 'Eliminar' : 'Restaurar'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const handleDeleteSchema = useCallback((schemaId: string, schemaName: string) => {
    // Open controlled confirmation dialog instead of window.confirm
    setSchemaToAct({ id: schemaId, name: schemaName });
    setSchemaConfirmAction('delete');
    setSchemaConfirmOpen(true);
  }, []);

  const handleRestoreSchema = useCallback((schemaId: string, schemaName: string) => {
    // Open controlled confirmation dialog instead of window.confirm
    setSchemaToAct({ id: schemaId, name: schemaName });
    setSchemaConfirmAction('restore');
    setSchemaConfirmOpen(true);
  }, []);

  // Perform the confirmed action (delete/restore) for schemas
  const performSchemaConfirm = useCallback(async () => {
    if (!schemaToAct || !schemaConfirmAction) {
      setSchemaConfirmOpen(false);
      setSchemaToAct(null);
      setSchemaConfirmAction(null);
      return;
    }

    try {
      const updater = username || localStorage.getItem('dp_username') || 'unknown';
      if (schemaConfirmAction === 'delete') {
        await updateSchema(schemaToAct.id, { hidden: true, updated_by: updater });
        try { notifier.notify({ message: `Esquema "${schemaToAct.name}" marcado como eliminado`, severity: 'error' }); } catch { /* ignore */ }
      } else {
        await updateSchema(schemaToAct.id, { hidden: false, updated_by: updater });
        try { notifier.notify({ message: `Esquema "${schemaToAct.name}" restaurado`, severity: 'success' }); } catch { /* ignore */ }
      }
      await loadSchemas();
    } catch (error) {
      console.error('Error realizando la acción sobre el esquema:', error);
      try { notifier.notify({ message: 'Error procesando la acción sobre el esquema', severity: 'error' }); } catch { /* ignore */ }
    } finally {
      setSchemaConfirmOpen(false);
      setSchemaToAct(null);
      setSchemaConfirmAction(null);
    }
  }, [schemaConfirmAction, schemaToAct, username, loadSchemas, notifier]);

  const handleDuplicateSchema = useCallback(async (schemaId: string, originalName: string) => {
    const newName = prompt(`Ingresa el nombre para la copia de "${originalName}":`, `${originalName} (copia)`);
    if (newName && newName.trim()) {
      try {
        await duplicateSchema(schemaId, newName.trim());
        await loadSchemas();
      } catch (error) {
        console.error('Error duplicando esquema:', error);
        try { notifier.notify({ message: 'Error al duplicar el esquema', severity: 'error' }); } catch { /* ignore */ }
      }
    }
  }, [loadSchemas, notifier]);

  // Constantes para localStorage
  const STORAGE_KEY = 'drawpak-current-schema';
  const CURRENT_SCHEMA_KEY = 'drawpak-current-schema-id';
  const CURRENT_SCHEMA_NAME = 'drawpak-current-schema-name';
  const CURRENT_SCHEMA_DESC = 'drawpak-current-schema-description';
  const CURRENT_SCHEMA_LOCAL = 'drawpak-current-schema-local';

  // Funciones de persistencia
  const saveToLocalStorage = useCallback((currentNodes: Node<ElectNodeData>[], currentEdges: Edge<ElectEdgeData>[], schemaId: string | null = null, schemaName: string = '') => {
    try {
      // Attempt to measure current canvas size from wrapper if available
      let canvasWidth: number | null = null;
      let canvasHeight: number | null = null;
      try {
        if (reactFlowWrapper.current) {
          const rect = reactFlowWrapper.current.getBoundingClientRect();
          canvasWidth = Math.round(rect.width);
          canvasHeight = Math.round(rect.height);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        // ignore measurement errors
      }

      const schemaData = {
        nodes: currentNodes,
        edges: currentEdges,
        timestamp: Date.now(),
        currentSchemaId: schemaId || currentSchemaId,
        currentSchemaName: schemaName || currentSchemaName || '',
        currentSchemaDescription: schemaDescription || currentSchemaDescription || '',
        currentSchemaLocal: typeof schemaLocal === 'boolean' ? schemaLocal : currentSchemaLocal,
        canvasWidth: canvasWidth,
        canvasHeight: canvasHeight
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(schemaData));

      // Guardar también el ID del esquema actual por separado
      if (schemaId !== null) {
        localStorage.setItem(CURRENT_SCHEMA_KEY, String(schemaId));
        localStorage.setItem(CURRENT_SCHEMA_NAME, String(schemaName));
        localStorage.setItem(CURRENT_SCHEMA_DESC, String(schemaDescription || ''));
        localStorage.setItem(CURRENT_SCHEMA_LOCAL, String(schemaLocal || false));
      } else {
        localStorage.removeItem(CURRENT_SCHEMA_KEY);
        localStorage.removeItem(CURRENT_SCHEMA_NAME);
        localStorage.removeItem(CURRENT_SCHEMA_DESC);
        localStorage.removeItem(CURRENT_SCHEMA_LOCAL);
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error guardando en localStorage:', error);
    }
  }, [currentSchemaDescription, currentSchemaId, currentSchemaLocal, currentSchemaName, schemaDescription, schemaLocal]);

  const loadFromLocalStorage = useCallback(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      const savedSchemaId = localStorage.getItem(CURRENT_SCHEMA_KEY);
      const savedSchemaName = localStorage.getItem(CURRENT_SCHEMA_NAME);
      const savedSchemaDesc = localStorage.getItem(CURRENT_SCHEMA_DESC);
      const savedSchemaLocal = localStorage.getItem(CURRENT_SCHEMA_LOCAL);
      if (savedData) {
        const schemaData = JSON.parse(savedData);

        // Establecer el ID del esquema actual si existe
        if (savedSchemaId) {
          setCurrentSchemaId(savedSchemaId);
          setCurrentSchemaName(savedSchemaName || '');
          setCurrentSchemaDescription(savedSchemaDesc || '');
          setCurrentSchemaLocal(savedSchemaLocal === 'false');
        } else if (schemaData.currentSchemaId) {
          setCurrentSchemaId(schemaData.currentSchemaId);
          setCurrentSchemaName(schemaData.currentSchemaName || '');
          setCurrentSchemaDescription(schemaData.currentSchemaDescription || '');
          setCurrentSchemaLocal(typeof schemaData.currentSchemaLocal === 'boolean' ? schemaData.currentSchemaLocal : false);
        }

        // Establecer el nombre y la descripción del esquema actual si existen
        if (savedSchemaName) {
          setCurrentSchemaName(savedSchemaName);
        }
        if (savedSchemaDesc) {
          setSchemaDescription(savedSchemaDesc);
        }
        if (savedSchemaLocal) {
          setSchemaLocal(savedSchemaLocal === 'true');
        }

        // Determinar valor para currentSchemaLocal en el objeto retornado
        const resolvedCurrentSchemaLocal = typeof schemaData.currentSchemaLocal === 'boolean'
          ? schemaData.currentSchemaLocal
          : (savedSchemaLocal ? savedSchemaLocal === 'true' : false);

        return {
          nodes: schemaData.nodes || [],
          edges: schemaData.edges || [],
          currentSchemaId: savedSchemaId || schemaData.currentSchemaId || null,
          currentSchemaName: schemaData.currentSchemaName || '',
          currentSchemaDescription: schemaData.currentSchemaDescription || '',
          currentSchemaLocal: resolvedCurrentSchemaLocal,
          canvasWidth: typeof schemaData.canvasWidth === 'number' ? schemaData.canvasWidth : null,
          canvasHeight: typeof schemaData.canvasHeight === 'number' ? schemaData.canvasHeight : null
        };
      }
    } catch (error) {
      console.error('Error cargando desde localStorage:', error);
    }
    return { nodes: [], edges: [], currentSchemaId: null, currentSchemaName: '', currentSchemaLocal: false };
  }, []);

  // Cargar esquema al inicializar la aplicación
  React.useEffect(() => {
    const { nodes: savedNodes, edges: savedEdges, currentSchemaId: savedSchemaId, currentSchemaName: savedSchemaName, currentSchemaDescription: savedSchemaDescription, currentSchemaLocal: savedSchemaLocal } = loadFromLocalStorage();
    if (savedNodes.length > 0 || savedEdges.length > 0) {
      setNodes(savedNodes);
      setEdges(savedEdges);

      // Establecer el ID del esquema actual si existe
      if (savedSchemaId) {
        setCurrentSchemaId(savedSchemaId);
      }

      // Establecer el nombre del esquema actual si existe
      if (savedSchemaName) {
        setCurrentSchemaName(savedSchemaName);
      }

      if (savedSchemaDescription) {
        setCurrentSchemaDescription(savedSchemaDescription);
      }

      if (typeof savedSchemaLocal === 'boolean') {
        setCurrentSchemaLocal(savedSchemaLocal);
      }

      // Sincronizar el contador de ID con los nodos cargados
      let maxId = 0;
      for (const node of savedNodes) {
        const match = node.id?.toString().match(/node_(\d+)/);
        if (match) {
          maxId = Math.max(maxId, Number(match[1]));
        }
      }
      id = maxId + 1;

      // Inicializar historial con el estado cargado (después de un breve delay)
      setTimeout(() => {
        const initialState = {
          nodes: JSON.parse(JSON.stringify(savedNodes)),
          edges: JSON.parse(JSON.stringify(savedEdges))
        };
        setHistory([initialState]);
        setHistoryIndex(0);
        lastNodesRef.current = JSON.stringify(savedNodes);
        lastEdgesRef.current = JSON.stringify(savedEdges);
      }, 100);
    } else {
      // Si no hay datos guardados, inicializar historial vacío
      setHistory([]);
      setHistoryIndex(-1);
    }
  }, [loadFromLocalStorage, setNodes, setEdges]);

  // Guardar automáticamente cuando cambien los nodos o edges
  React.useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      // Solo guardar el ID del esquema si realmente hay uno activo
      // Si currentSchemaId es null, significa que es un esquema nuevo
      saveToLocalStorage(nodes, edges, currentSchemaId, currentSchemaName);
    } else {
      // Si no hay nodos ni edges, limpiar localStorage
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(CURRENT_SCHEMA_KEY);
      } catch (error) {
        console.error('Error limpiando localStorage:', error);
      }
    }
  }, [nodes, edges, saveToLocalStorage, currentSchemaId, currentSchemaName]);

  // Funciones de historial para deshacer/rehacer
  const saveToHistory = useCallback((currentNodes: Node<ElectNodeData>[], currentEdges: Edge<ElectEdgeData>[]) => {
    setHistory(prevHistory => {
      // Crear una copia profunda del estado actual
      const newState = {
        nodes: JSON.parse(JSON.stringify(currentNodes)) as Node<ElectNodeData>[],
        edges: JSON.parse(JSON.stringify(currentEdges)) as Edge<ElectEdgeData>[]
      };

      // Verificar si el estado actual es diferente al último en el historial
      if (prevHistory.length > 0) {
        const lastState = prevHistory[prevHistory.length - 1];
        if (JSON.stringify(lastState.nodes) === JSON.stringify(newState.nodes) &&
          JSON.stringify(lastState.edges) === JSON.stringify(newState.edges)) {
          return prevHistory; // No hay cambios, no guardar
        }
      }

      // Si estamos en medio del historial, descartar todo lo que está después del índice actual
      const currentHistoryIndex = historyIndex;
      const newHistory = prevHistory.slice(0, currentHistoryIndex + 1);
      newHistory.push(newState);

      // Limitar el historial a los últimos 50 estados para evitar problemas de memoria
      if (newHistory.length > 50) {
        newHistory.shift();
        setHistoryIndex(prev => Math.max(0, prev - 1));
        return newHistory;
      }

      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setIsUndoRedoAction(true);
      const previousState = history[historyIndex - 1];

      // Limpiar cualquier timeout pendiente de guardar historial
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      setNodes(previousState.nodes);
      setEdges(previousState.edges);
      setHistoryIndex(historyIndex - 1);

      // Actualizar las referencias para evitar que se guarde nuevamente
      lastNodesRef.current = JSON.stringify(previousState.nodes);
      lastEdgesRef.current = JSON.stringify(previousState.edges);

      // Resetear la bandera después de un breve delay
      setTimeout(() => setIsUndoRedoAction(false), 50);
    }
  }, [historyIndex, history, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setIsUndoRedoAction(true);
      const nextState = history[historyIndex + 1];

      // Limpiar cualquier timeout pendiente de guardar historial
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);

      // Actualizar las referencias para evitar que se guarde nuevamente
      lastNodesRef.current = JSON.stringify(nextState.nodes);
      lastEdgesRef.current = JSON.stringify(nextState.edges);

      // Resetear la bandera después de un breve delay
      setTimeout(() => setIsUndoRedoAction(false), 50);
    }
  }, [historyIndex, history, setNodes, setEdges]);

  // Guardar en historial cuando cambien los nodos o edges (pero no durante undo/redo)
  const lastNodesRef = React.useRef<string>('');
  const lastEdgesRef = React.useRef<string>('');
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (isUndoRedoAction) return;

    const nodesStr = JSON.stringify(nodes);
    const edgesStr = JSON.stringify(edges);

    // Solo guardar si realmente hay cambios
    if (nodesStr !== lastNodesRef.current || edgesStr !== lastEdgesRef.current) {
      // Limpiar timeout anterior si existe
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce para evitar demasiadas entradas en el historial
      saveTimeoutRef.current = setTimeout(() => {
        // Verificar otra vez si no estamos en una operación de undo/redo
        if (!isUndoRedoAction) {
          if (nodes.length > 0 || edges.length > 0 || lastNodesRef.current !== '' || lastEdgesRef.current !== '') {
            saveToHistory(nodes, edges);
          }
          lastNodesRef.current = nodesStr;
          lastEdgesRef.current = edgesStr;
        }
      }, 100); // Reducir el tiempo de debounce a 100ms
    }

    // Cleanup del timeout al desmontar
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, saveToHistory, isUndoRedoAction]);

  // Agregar atajos de teclado para undo/redo
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the SVG editor dialog is open, let the dialog handle keyboard events
      if (showSvgDialog) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

  const onConnect: OnConnect = useCallback((params) => {
    // Ensure connections align with grid by using SmoothStep lines
    const newEdge = {
      ...params,
      type: 'smoothstep',
      style: {
        strokeWidth: 2,
        stroke: '#000000' // Color negro por defecto
      },
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [setEdges]);

  const handleDelete = useCallback(() => {
    // Remove selected nodes and edges. Also remove edges connected to removed nodes.
    let removedNodeIds: string[] = [];
    setNodes((nds) => {
      removedNodeIds = nds.filter((n) => n.selected).map((n) => n.id);
      return nds.filter((n) => !n.selected);
    });

    setEdges((eds) => eds.filter((e) => !e.selected && !removedNodeIds.includes(e.source) && !removedNodeIds.includes(e.target)));
  }, [setNodes, setEdges]);

  const handleClearAll = useCallback(() => {

    // Clear all nodes and edges
    setNodes([]);
    setEdges([]);
    // Reset ID counter
    id = 0;
    // Limpiar el esquema actual
    setCurrentSchemaId(null);
    setCurrentSchemaName('');
    // Reset schema local flags so the "No guardar en la nube" checkbox is re-enabled
    try {
      setCurrentSchemaLocal(false);
      setSchemaLocal(false);
      localStorage.removeItem(CURRENT_SCHEMA_LOCAL);
    } catch {
      // ignore
    }
    // Limpiar también el localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CURRENT_SCHEMA_KEY);
      // localStorage cleaned
    } catch (error) {
      console.error('Error limpiando localStorage:', error);
    }
    // Limpiar historial
    setHistory([]);
    setHistoryIndex(-1);
    // handleClearAll completed
  }, [setNodes, setEdges, setCurrentSchemaId, setCurrentSchemaName]);

  const handleNewSchema = useCallback(() => {
    if (isHandlingNewSchema) {
      return;
    }

    // Solo mostrar confirmación si hay contenido
    if (nodes.length > 0 || edges.length > 0) {
      // Mostrar confirmación si existe contenido
      setShowNewSchemaConfirm(true);
    } else {
      // Si no hay contenido, limpiar directamente
      handleClearAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length, currentSchemaId, currentSchemaName, handleClearAll, isHandlingNewSchema]);

  const confirmNewSchema = useCallback(() => {
    setShowNewSchemaConfirm(false);
    setIsHandlingNewSchema(false);
    handleClearAll();
  }, [handleClearAll]);

  const cancelNewSchema = useCallback(() => {
    setShowNewSchemaConfirm(false);
    setIsHandlingNewSchema(false);
  }, []);

  // Funciones de copiar y pegar
  const copySelectedElements = useCallback(() => {
    const selectedNodes = nodes.filter(node => node.selected);
    const selectedNodeIds = selectedNodes.map(node => node.id);
    const selectedEdges = edges.filter(edge =>
      selectedNodeIds.includes(edge.source) && selectedNodeIds.includes(edge.target)
    );

    if (selectedNodes.length > 0) {
      setClipboard({ nodes: selectedNodes, edges: selectedEdges });
    }
  }, [nodes, edges, setClipboard]);

  const pasteElements = useCallback(() => {
    if (!clipboard || clipboard.nodes.length === 0) return;

    // Mapeo para nuevos IDs
    const idMapping: Record<string, string> = {};

    // Crear nuevos nodos con IDs únicos y posiciones libres
    const newNodes = clipboard.nodes.map(node => {
      const newId = getId();
      idMapping[node.id] = newId;

      // Posición deseada (desplazada de la original)
      const desiredPosition = {
        x: node.position.x + GRID_SIZE * 2,
        y: node.position.y + GRID_SIZE * 2
      };

      // Encontrar una posición libre
      const freePosition = findFreePosition(desiredPosition, nodes);

      return {
        ...node,
        id: newId,
        position: freePosition,
        selected: true // Seleccionar los elementos pegados
      };
    });

    // Crear nuevas conexiones entre los nodos copiados
    const newEdges = clipboard.edges.map(edge => ({
      ...edge,
      id: `edge_${Date.now()}_${Math.random()}`,
      source: idMapping[edge.source],
      target: idMapping[edge.target]
    }));

    // Deseleccionar elementos existentes y agregar los nuevos
    setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
    setEdges(eds => eds.concat(newEdges));

    // pasted nodes and edges
  }, [clipboard, setNodes, setEdges, nodes]);

  // Efectos para aplicar estilos dinámicos del cursor
  React.useEffect(() => {
    const styleId = 'polygon-cursor-style';
    let existingStyle = document.getElementById(styleId) as HTMLStyleElement;

    if (!existingStyle) {
      existingStyle = document.createElement('style');
      existingStyle.id = styleId;
      document.head.appendChild(existingStyle);
    }

    if (isDrawingPolygon) {
      existingStyle.textContent = `
        .polygon-drawing-mode .react-flow__pane,
        .polygon-drawing-mode .react-flow__container,
        .polygon-drawing-mode .react-flow__renderer,
        .polygon-drawing-mode {
          cursor: crosshair !important;
        }
        /* Allow clicking through nodes/edges while drawing polygon */
        .polygon-drawing-mode .react-flow__node,
        .polygon-drawing-mode .react-flow__edge {
          pointer-events: none !important;
        }
      `;
    } else {
      existingStyle.textContent = '';
    }

    return () => {
      // Limpiar estilos al desmontar o cambiar
      if (existingStyle && !isDrawingPolygon) {
        existingStyle.textContent = '';
      }
    };
  }, [isDrawingPolygon, isValidUsername, username, requireValidUser]);


  // Debug para el diálogo de guardar
  React.useEffect(() => {
    // showSaveDialog state watcher (no-op in production)
  }, [showSaveDialog]);

  // Funciones para manejo de polígonos
  const togglePolygonMode = useCallback(() => {
    if (!requireValidUser()) return;
    setIsDrawingPolygon(prev => !prev);
    // Si estamos saliendo del modo polígono, limpiar puntos temporales
    if (isDrawingPolygon) {
      setCurrentPolygonPoints([]);
      setMousePosition(null);
    }
  }, [isDrawingPolygon, requireValidUser]);

  const addPolygonPoint = useCallback((event: React.MouseEvent) => {
    if (!isDrawingPolygon || !reactFlowWrapper.current || !reactFlowInstance.current) return;
    if (!isValidUsername(username)) {
      setShowUsernameDialog(true);
      return;
    }

    const rect = reactFlowWrapper.current.getBoundingClientRect();

    // Coordenadas relativas al contenedor ReactFlow
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;

    // Usar el método project de ReactFlow que considera el zoom y pan actual
    const position = reactFlowInstance.current.project({
      x: clientX,
      y: clientY
    });

    if (position) {
      // Snap to grid
      const snappedPosition = snapToGridPos(position, GRID_SIZE);

      setCurrentPolygonPoints(prev => [...prev, snappedPosition]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawingPolygon]);

  const finishPolygon = useCallback(() => {
    if (currentPolygonPoints.length >= 2) {
      // Crear nuevo nodo polígono
      const polygonId = `polygon_${Date.now()}`;

      // Calcular posici f3n del nodo (esquina superior izquierda del bounding box)
      const minX = Math.min(...currentPolygonPoints.map(p => p.x));
      const minY = Math.min(...currentPolygonPoints.map(p => p.y));

      // Use the same padding as PolygonNode and snap/round the node position
      // so the initial placement exactly matches the rendered SVG coordinates.
      const PADDING = 10;
      const rawPos = { x: minX - PADDING, y: minY - PADDING };
      // Snap to grid and round to integer coordinates to avoid fractional offsets
      const snappedPos = snapToGridPos({ x: Math.round(rawPos.x), y: Math.round(rawPos.y) }, GRID_SIZE);
      const nodePosX = snappedPos.x;
      const nodePosY = snappedPos.y;

      const newPolygonNode: Node = {
        id: polygonId,
        type: 'polygonNode',
        position: { x: nodePosX, y: nodePosY },
        data: {
          points: currentPolygonPoints,
          strokeColor: '#2196F3',
          strokeWidth: 2,
          strokeDasharray: '5,5',
          fillColor: '#2196F3',
          fillOpacity: 0.1
        },
        selectable: true,
        deletable: true
      };

      // Insert polygon at the beginning so it renders behind other nodes
      setNodes(nds => [newPolygonNode, ...nds]);
    }

    // Limpiar estado
    setCurrentPolygonPoints([]);
    setMousePosition(null);
    setIsDrawingPolygon(false);
  }, [currentPolygonPoints, setNodes]);

  const cancelPolygon = useCallback(() => {
    setCurrentPolygonPoints([]);
    setIsDrawingPolygon(false);
    setMousePosition(null);
  }, []);

  const handlePolygonMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDrawingPolygon || !reactFlowWrapper.current || !reactFlowInstance.current) return;

    const rect = reactFlowWrapper.current.getBoundingClientRect();
    const position = reactFlowInstance.current.project({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });

    if (position) {
      // Snap to grid
      const snappedPosition = snapToGridPos(position, GRID_SIZE);
      setMousePosition(snappedPosition);
    }
  }, [isDrawingPolygon]);

  // ...existing code... (exportWithoutBackground moved inside export callbacks)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // If the SVG editor dialog is open, don't handle global shortcuts here
      if (showSvgDialog) return;
      // If focus is inside an editable field, don't intercept Delete/Backspace so the user can edit text
      const active = document.activeElement as HTMLElement | null;
      const isEditable = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      );

      // Delete or Backspace -> only when not editing text
      if (!isEditable && (event.key === 'Delete' || event.key === 'Backspace')) {
        // Prevent navigation on Backspace
        event.preventDefault();
        handleDelete();
        return;
      }

      // Ctrl+C para copiar -> if not editing
      if (!isEditable && event.ctrlKey && event.key === 'c') {
        event.preventDefault();
        copySelectedElements();
        return;
      }

      // Ctrl+V para pegar -> if not editing
      if (!isEditable && event.ctrlKey && event.key === 'v') {
        event.preventDefault();
        pasteElements();
        return;
      }

      // Manejo de teclas para polígonos
      if (isDrawingPolygon) {
        if (event.key === 'Enter') {
          event.preventDefault();
          finishPolygon();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelPolygon();
          return;
        }
      }
    };

    // use capture phase so other layers (like ReactFlow) don't stop the event before we see it
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleDelete, copySelectedElements, pasteElements, isDrawingPolygon, finishPolygon, cancelPolygon]);



  // Drag handlers for palette items
  const onDragStart = (event: React.DragEvent, symbolKey: string, svgElement?: SvgElement) => {
    event.dataTransfer.setData('application/reactflow', symbolKey);
    if (svgElement) {
      event.dataTransfer.setData('application/svgelement', JSON.stringify(svgElement));
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      if (!requireValidUser()) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const symbolKey = event.dataTransfer.getData('application/reactflow');
      if (!symbolKey) return;

      const svgElementData = event.dataTransfer.getData('application/svgelement');
      let svgElement: SvgElement | null = null;

      // onDrop received

      try {
        if (svgElementData) {
          svgElement = JSON.parse(svgElementData);
          // parsed svgElement
        }
      } catch (e) {
        console.warn('Error parsing SVG element data:', e);
      }

      const domPosition = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      // Convert DOM coords to React Flow coords taking zoom/offset into account
      const flowPos = (reactFlowInstance.current && typeof reactFlowInstance.current.project === 'function')
        ? reactFlowInstance.current.project(domPosition)
        : domPosition;

      // Encontrar una posición libre usando la función centralizada
      const position = findFreePosition(flowPos, nodes);

      const newNode: Node<ElectNodeData> = {
        id: getId(),
        position,
        type: 'symbolNode',
        data: svgElement ? {
          symbolKey,
          label: svgElement.name,
          svg: svgElement.svg,
          handles: svgElement.handles,
          isDynamicSvg: true,
          primaryColor: 'rgba(0,0,0,1)',
          backgroundColor: 'rgba(255,255,255,0)'
        } : {
          symbolKey,
          label: symbolKey,
          isDynamicSvg: false,
          primaryColor: 'rgba(0,0,0,1)',
          backgroundColor: 'rgba(255,255,255,0)'
        },
      };

      // creating new node

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, nodes, requireValidUser],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handlers para la selección de área de exportación
  const handleCanvasMouseDown = useCallback((event: React.MouseEvent) => {
    if (!isSelectingExportArea || !reactFlowWrapper.current) return;

    // Prevenir el comportamiento por defecto de ReactFlow
    event.preventDefault();
    event.stopPropagation();

    const rect = reactFlowWrapper.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setAreaStart({ x, y });
    setIsDrawingArea(true);
    setExportArea(null);
  }, [isSelectingExportArea]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isSelectingExportArea || !isDrawingArea || !areaStart || !reactFlowWrapper.current) return;

    // Prevenir el comportamiento por defecto de ReactFlow
    event.preventDefault();
    event.stopPropagation();

    const rect = reactFlowWrapper.current.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    const x = Math.min(areaStart.x, currentX);
    const y = Math.min(areaStart.y, currentY);
    const width = Math.abs(currentX - areaStart.x);
    const height = Math.abs(currentY - areaStart.y);

    setExportArea({ x, y, width, height });
  }, [isSelectingExportArea, isDrawingArea, areaStart]);

  const handleCanvasMouseUp = useCallback((event: React.MouseEvent) => {
    if (!isSelectingExportArea || !isDrawingArea) return;

    // Prevenir el comportamiento por defecto de ReactFlow
    event.preventDefault();
    event.stopPropagation();

    setIsDrawingArea(false);
    setAreaStart(null);
  }, [isSelectingExportArea, isDrawingArea]);

  // Función para iniciar la selección de área
  const startAreaSelection = useCallback((forType: 'png' | 'pdf' | null = 'png') => {
    setPendingExportType(forType);
    setIsSelectingExportArea(true);
    setExportArea(null);
    setShowSelectionOverlay(true);
  }, []);

  // Función para cancelar la selección de área
  const cancelAreaSelection = useCallback(() => {
    setIsSelectingExportArea(false);
    setExportArea(null);
    setIsDrawingArea(false);
    setAreaStart(null);
    setShowSelectionOverlay(true);
    setPendingExportType(null);
  }, []);

  // Nueva función de exportación PNG con área seleccionada
  const exportSelectedAreaPNG = useCallback(async () => {
    if (!exportArea || !reactFlowWrapper.current) {
      try { notifier.notify({ message: 'Primero selecciona un área para exportar', severity: 'warning' }); } catch { /* ignore */ }
      return;
    }

    try {
      // Capturar toda la viewport sin fondo de puntos
      // Inline exportWithoutBackground: toggle background off, await a frame, run export, restore background
      // Ocultamos la cuadrícula y el overlay de selección antes de la captura
      setShowBackground(false);
      setShowSelectionOverlay(false);
      await new Promise(resolve => requestAnimationFrame(resolve));
      let fullDataUrl: string | null = null;
      try {
        const { toPng: dynamicToPng } = await import('html-to-image');
        fullDataUrl = await dynamicToPng(reactFlowWrapper.current, {
          cacheBust: true,
          backgroundColor: '#ffffff'
        });
      } finally {
        // Restaurar UI
        setShowBackground(true);
        setShowSelectionOverlay(true);
      }

      if (!fullDataUrl) return;

      // Crear un canvas temporal para capturar solo el área seleccionada
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Configurar el canvas con las dimensiones del área seleccionada
      const ratio = window.devicePixelRatio || 1;
      canvas.width = exportArea.width * ratio;
      canvas.height = exportArea.height * ratio;
      canvas.style.width = exportArea.width + 'px';
      canvas.style.height = exportArea.height + 'px';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Rellenar el fondo con blanco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportArea.width, exportArea.height);

      // Crear una imagen con toda la viewport
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = fullDataUrl;
      });

      // Dibujar solo la parte seleccionada en el canvas
      ctx.drawImage(
        img,
        exportArea.x, exportArea.y, exportArea.width, exportArea.height, // área fuente
        0, 0, exportArea.width, exportArea.height // área destino
      );

      // Convertir a PNG y descargar
      const croppedDataUrl = canvas.toDataURL('image/png');

      // Fallback: descarga del navegador
      const a = document.createElement('a');
      a.href = croppedDataUrl;
      a.download = 'area_selected.png';
      a.click();

      cancelAreaSelection();
    } catch (error) {
      console.error('Error exporting selected area:', error);
      try { notifier.notify({ message: 'Error al exportar el área seleccionada', severity: 'error' }); } catch { /* ignore */ }
    }
  }, [exportArea, cancelAreaSelection, notifier]);

  const exportSelectedAreaPDF = useCallback(async () => {
    if (!exportArea || !reactFlowWrapper.current) {
      try { notifier.notify({ message: 'Primero selecciona un área para exportar', severity: 'warning' }); } catch { /* ignore */ }
      return;
    }

    try {
      // Ocultar UI
      setShowBackground(false);
      setShowSelectionOverlay(false);
      await new Promise(resolve => requestAnimationFrame(resolve));
      let fullDataUrl: string | null = null;
      try {
        const { toPng: dynamicToPng } = await import('html-to-image');
        fullDataUrl = await dynamicToPng(reactFlowWrapper.current, {
          cacheBust: true,
          backgroundColor: '#ffffff'
        });
      } finally {
        setShowBackground(true);
        setShowSelectionOverlay(true);
      }

      if (!fullDataUrl) return;

      // Crop to selected area (similar to PNG flow)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = exportArea.width * ratio;
      canvas.height = exportArea.height * ratio;
      canvas.style.width = exportArea.width + 'px';
      canvas.style.height = exportArea.height + 'px';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportArea.width, exportArea.height);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = fullDataUrl;
      });

      ctx.drawImage(
        img,
        exportArea.x, exportArea.y, exportArea.width, exportArea.height,
        0, 0, exportArea.width, exportArea.height
      );

      const croppedDataUrl = canvas.toDataURL('image/png');

      // Prepare PDF A4
      // We'll dynamically import heavy libs (html-to-image / jsPDF) only when needed so they can be code-split
      const orientation = exportPDFOrientation === 'landscape' ? 'landscape' : 'portrait';
      // A4 size in mm
      const A4_W_MM = 210;
      const A4_H_MM = 297;
      const pdfW = orientation === 'landscape' ? A4_H_MM : A4_W_MM;
      const pdfH = orientation === 'landscape' ? A4_W_MM : A4_H_MM;

      // Convert image pixel dimensions to mm assuming 96 DPI for CSS px (best-effort)
      const cssPxPerInch = 96; // assumption
      const pxToMm = (px: number) => (px * 25.4) / cssPxPerInch;

      const imgW_mm = pxToMm(canvas.width / (window.devicePixelRatio || 1));
      const imgH_mm = pxToMm(canvas.height / (window.devicePixelRatio || 1));

      // Fit image into A4 while preserving aspect ratio
      let drawW = pdfW;
      let drawH = (imgH_mm * pdfW) / imgW_mm;
      if (drawH > pdfH) {
        drawH = pdfH;
        drawW = (imgW_mm * pdfH) / imgH_mm;
      }

      const x = (pdfW - drawW) / 2;
      const y = (pdfH - drawH) / 2;

      try {
        const [{ default: jsPDF }] = await Promise.all([
          import('jspdf')
        ]);
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
        pdf.addImage(croppedDataUrl, 'PNG', x, y, drawW, drawH);
        const arrayBuffer = pdf.output('arraybuffer');
        const bytes = new Uint8Array(arrayBuffer);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram_a4.pdf';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to load jsPDF dynamically', err);
        try { notifier.notify({ message: 'No se pudo generar el PDF: librería faltante', severity: 'error' }); } catch { /* ignore */ }
      }

      cancelAreaSelection();
    } catch (error) {
      console.error('Error exporting selected area to PDF:', error);
      try { notifier.notify({ message: 'Error al exportar el área seleccionada a PDF', severity: 'error' }); } catch { /* ignore */ }
    }
  }, [exportArea, exportPDFOrientation, cancelAreaSelection, notifier]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node<ElectNodeData>) => {
    // Encontrar una posición libre para el nodo arrastrado
    const freePosition = findFreePosition(node.position as { x: number; y: number }, nodes, node.id);

    // Ensure exact integer coordinates
    freePosition.x = Math.round(freePosition.x);
    freePosition.y = Math.round(freePosition.y);

    setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: freePosition } : n)));

    // Force update of all edges to ensure they align properly
    setEdges((eds) => [...eds]);
  }, [setNodes, setEdges, nodes]);



  // Selection controls for rotate/scale
  const selectedNode = nodes.find((n) => n.selected);
  const updateSelectedNodeData = (patch: Partial<ElectNodeData>) => {
    if (!selectedNode) return;

    // Si estamos invirtiendo handles, romper todas las conexiones del elemento
    if (patch.invertHandles !== undefined) {
      const nodeId = selectedNode.id;

      // Eliminar todas las conexiones que involucren este nodo
      setEdges((currentEdges) =>
        currentEdges.filter((edge) =>
          edge.source !== nodeId && edge.target !== nodeId
        )
      );
    }

    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...(patch) } } : n)));
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <AppBar position="static">
        <Toolbar variant="dense">
          <Box component="img" src="/logo.svg" alt="DrawPaK logo" sx={{ width: 36, height: 36, mr: 1 }} />
          <IconButton color="inherit" onClick={handleNewSchema} title="Nuevo esquema">
            <span className="material-symbols-rounded">add</span>
          </IconButton>
          <IconButton color="inherit" onClick={undo} disabled={historyIndex <= 0} title={`Deshacer (Ctrl+Z) - ${historyIndex}/${history.length}`}>
            <span className="material-symbols-rounded">undo</span>
          </IconButton>
          <IconButton color="inherit" onClick={redo} disabled={historyIndex >= history.length - 1} title={`Rehacer (Ctrl+Y) - ${historyIndex}/${history.length}`}>
            <span className="material-symbols-rounded">redo</span>
          </IconButton>
          <IconButton color="inherit" onClick={handleSaveButtonClick} title={currentSchemaId ? "Actualizar esquema" : "Guardar esquema"}>
            <span className="material-symbols-rounded">save</span>
          </IconButton>
          <IconButton color="inherit" onClick={() => { void loadSchemas(); setShowSchemasDialog(true); }} title="Cargar esquema">
            <span className="material-symbols-rounded">folder_open</span>
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, textAlign: 'center' }}>
            Editor de esquemas{currentSchemaName ? `: ${currentSchemaName}` : ': Nuevo'}
            {lastSaved && (
              <Typography variant="caption" display="block" sx={{ fontSize: '0.6rem', opacity: 0.7 }}>
                Guardado automáticamente: {lastSaved.toLocaleTimeString()}
              </Typography>
            )}
          </Typography>
          <IconButton color="inherit" onClick={() => { void loadSvgElements(); void loadSvgCategories(); setShowSvgDialog(true); }} title="Elementos SVG">
            <span className="material-symbols-rounded">edit</span>
          </IconButton>
          <IconButton color="inherit" onClick={() => {
            // Añadir una etiqueta en el centro de la vista actual
            const center = reactFlowInstance.current ? reactFlowInstance.current.project({ x: (reactFlowWrapper.current?.clientWidth || 800) / 2, y: (reactFlowWrapper.current?.clientHeight || 600) / 2 }) : { x: 100, y: 100 };
            const position = findFreePosition(center, nodes);
            const newLabelNode = {
              id: getId(),
              position,
              type: 'labelNode',
              data: { label: 'Nueva etiqueta', fontSize: 14, color: '#000000', backgroundColor: 'rgba(255,255,255,0)', borderColor: '#000000', borderWidth: 0 }
            } as Node<ElectNodeData>;
            setNodes((nds) => nds.concat(newLabelNode));
          }} title="Añadir etiqueta">
            <span className="material-symbols-rounded">label</span>
          </IconButton>
          <IconButton
            color="inherit"
            onClick={togglePolygonMode}
            title={isDrawingPolygon ? "Salir del modo polígono (Esc para cancelar)" : "Dibujar polígono (clic para puntos, Enter para terminar)"}
            sx={{
              backgroundColor: isDrawingPolygon ? 'rgba(255,255,255,0.2)' : 'transparent',
              '&:hover': {
                backgroundColor: isDrawingPolygon ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'
              }
            }}
          >
            <span className="material-symbols-rounded">polyline</span>
          </IconButton>
          {!isSelectingExportArea ? (
            <>
              <IconButton color="inherit" onClick={() => startAreaSelection('png')} title="Seleccionar área para exportar PNG">
                <span className="material-symbols-rounded">crop_free</span>
              </IconButton>
              <IconButton color="inherit" onClick={() => startAreaSelection('pdf')} title="Seleccionar área para exportar PDF">
                <span className="material-symbols-rounded">picture_as_pdf</span>
              </IconButton>
            </>
          ) : (
            <>
              <IconButton color="inherit" onClick={() => {
                void (async () => {
                  if (pendingExportType === 'pdf') {
                    await exportSelectedAreaPDF();
                  } else {
                    await exportSelectedAreaPNG();
                  }
                })();
              }} title="Exportar área seleccionada" disabled={!exportArea}>
                <span className="material-symbols-rounded">check</span>
              </IconButton>
              <IconButton color="inherit" onClick={cancelAreaSelection} title="Cancelar selección">
                <span className="material-symbols-rounded">close</span>
              </IconButton>
            </>
          )}
          {/* Username display and logout */}
          <Typography variant="subtitle2" sx={{ marginLeft: 2, marginRight: 1 }}>
            {username ? `Usuario: ${username}` : ''}
          </Typography>
          <IconButton color="inherit" onClick={() => { void handleLogout(); }} title="Cerrar sesión (borrar datos locales)">
            <span className="material-symbols-rounded">logout</span>
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box
        ref={reactFlowWrapper}
        sx={{
          flex: 1,
          position: 'relative',
          cursor: isSelectingExportArea ? 'crosshair' : isDrawingPolygon ? 'crosshair' : 'default',
          overflow: 'auto'
        }}
        onMouseDown={isSelectingExportArea ? handleCanvasMouseDown : undefined}
        onMouseMove={isSelectingExportArea ? handleCanvasMouseMove : undefined}
        onMouseUp={isSelectingExportArea ? handleCanvasMouseUp : undefined}
      >
        <ReactFlowProvider>
          <ReactFlow
            style={{
              width: '100%',
              height: '100%'
            }}
            className={isDrawingPolygon ? 'polygon-drawing-mode' : ''}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={addPolygonPoint}
            onPaneMouseMove={handlePolygonMouseMove}
            snapToGrid={true}
            snapGrid={snapGrid}
            connectionLineType={ConnectionLineType.SmoothStep}
            defaultEdgeOptions={stableDefaultEdgeOptions}
            nodeTypes={stableNodeTypes}
            onInit={(rfi) => { reactFlowInstance.current = rfi; }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            fitView
            attributionPosition="bottom-left"
            connectOnClick={false}
            elementsSelectable={!isSelectingExportArea && !isDrawingPolygon}
            panOnDrag={!isSelectingExportArea && !isDrawingPolygon}
            zoomOnScroll={!isSelectingExportArea}
            zoomOnPinch={!isSelectingExportArea}
            zoomOnDoubleClick={!isSelectingExportArea}
          >
            <MiniMap />
            <Controls />
            {showBackground && <Background gap={GRID_SIZE} />}
          </ReactFlow>
        </ReactFlowProvider>

        {/* Overlay para mostrar el área de selección */}
        {isSelectingExportArea && exportArea && showSelectionOverlay && (
          <Box
            sx={{
              position: 'absolute',
              left: exportArea.x,
              top: exportArea.y,
              width: exportArea.width,
              height: exportArea.height,
              border: '1px dashed #2196f3',
              backgroundColor: 'rgba(33, 150, 243, 0.1)',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
        )}

        {/* Instrucciones para la selección de área */}
        {isSelectingExportArea && showSelectionOverlay && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              p: 2,
              borderRadius: 1,
              textAlign: 'center',
              zIndex: 1001,
              pointerEvents: 'none'
            }}
          >
            <Typography variant="h6" sx={{ mb: 1 }}>
              Seleccionar área para exportar
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Arrastra para dibujar un rectángulo sobre el área que quieres exportar
            </Typography>
            {/* orientation controls: allow clicks without blocking drawing (container pointerEvents none) */}
            {pendingExportType === 'pdf' && (
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', pointerEvents: 'auto' }}>
                <Button
                  variant={exportPDFOrientation === 'portrait' ? 'contained' : 'outlined'}
                  size="small"
                  sx={{ color: 'white' }}
                  onClick={() => setExportPDFOrientation('portrait')}
                >
                  Vertical
                </Button>
                <Button
                  variant={exportPDFOrientation === 'landscape' ? 'contained' : 'outlined'}
                  size="small"
                  sx={{ color: 'white' }}
                  onClick={() => setExportPDFOrientation('landscape')}
                >
                  Horizontal
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Overlay para mostrar vista previa del polígono */}
        {isDrawingPolygon && currentPolygonPoints.length > 0 && reactFlowWrapper.current && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          >
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible'
              }}
            >
              {/* Líneas conectando los puntos del polígono */}
              {currentPolygonPoints.map((point, index) => {
                if (index === 0) return null;
                const prevPoint = currentPolygonPoints[index - 1];
                const reactFlowRect = reactFlowWrapper.current?.getBoundingClientRect();
                if (!reactFlowRect || !reactFlowInstance.current) return null;

                const screenPoint1 = reactFlowInstance.current.flowToScreenPosition(prevPoint);
                const screenPoint2 = reactFlowInstance.current.flowToScreenPosition(point);

                return (
                  <line
                    key={`line-${index}`}
                    x1={screenPoint1.x - reactFlowRect.left}
                    y1={screenPoint1.y - reactFlowRect.top}
                    x2={screenPoint2.x - reactFlowRect.left}
                    y2={screenPoint2.y - reactFlowRect.top}
                    stroke="#2196F3"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                );
              })}

              {/* Línea de previsualización desde el último punto hasta el cursor */}
              {currentPolygonPoints.length > 0 && mousePosition && reactFlowInstance.current && (
                (() => {
                  const lastPoint = currentPolygonPoints[currentPolygonPoints.length - 1];
                  const reactFlowRect = reactFlowWrapper.current?.getBoundingClientRect();
                  if (!reactFlowRect) return null;

                  const screenPoint1 = reactFlowInstance.current.flowToScreenPosition(lastPoint);
                  const screenPoint2 = reactFlowInstance.current.flowToScreenPosition(mousePosition);

                  return (
                    <line
                      x1={screenPoint1.x - reactFlowRect.left}
                      y1={screenPoint1.y - reactFlowRect.top}
                      x2={screenPoint2.x - reactFlowRect.left}
                      y2={screenPoint2.y - reactFlowRect.top}
                      stroke="#2196F3"
                      strokeWidth="2"
                      strokeDasharray="3,3"
                      opacity="0.7"
                    />
                  );
                })()
              )}

              {/* Puntos del polígono */}
              {currentPolygonPoints.map((point, index) => {
                const reactFlowRect = reactFlowWrapper.current?.getBoundingClientRect();
                if (!reactFlowRect || !reactFlowInstance.current) return null;

                const screenPoint = reactFlowInstance.current.flowToScreenPosition(point);

                return (
                  <circle
                    key={`point-${index}`}
                    cx={screenPoint.x - reactFlowRect.left}
                    cy={screenPoint.y - reactFlowRect.top}
                    r="4"
                    fill="#2196F3"
                    stroke="white"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>
          </Box>
        )}

        {/* Instrucciones para dibujar polígonos */}
        {isDrawingPolygon && (
          <Box
            sx={{
              position: 'absolute',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(33, 150, 243, 0.2)',
              color: 'black',
              p: 2,
              borderRadius: 1,
              textAlign: 'center',
              zIndex: 1001,
              pointerEvents: 'none'
            }}
          >
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Modo Polígono Activo</strong>
            </Typography>
            <Typography variant="caption" display="block">
              • Clic para añadir puntos
            </Typography>
            <Typography variant="caption" display="block">
              • Enter para terminar polígono (min. 2 puntos)
            </Typography>
            <Typography variant="caption" display="block">
              • Escape para cancelar
            </Typography>
            {currentPolygonPoints.length > 0 && (
              <Typography variant="caption" display="block" sx={{ mt: 1, fontWeight: 'bold' }}>
                Puntos: {currentPolygonPoints.length}
              </Typography>
            )}
          </Box>
        )}
      </Box>
      <DynamicPalette onDragStart={onDragStart} />
      {selectedNode ? (
        <Box sx={{ position: 'absolute', right: 12, top: 72, padding: 2, backgroundColor: 'rgba(0, 0, 0, 0.6)', border: '1px solid #ddd', borderRadius: 6, zIndex: 1300 }}>
          <Typography variant="h6" sx={{ fontSize: 14, fontWeight: 600, marginBottom: 2, textAlign: 'center', color: 'white' }}>
            Edición
          </Typography>

          {selectedNode.type === 'labelNode' ? (
            // Controls for label nodes
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, color: 'white', width: 260 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded">rotate_left</span>}
                  onClick={() => updateSelectedNodeData({ rotation: (selectedNode.data?.rotation ?? 0) - 90 })}
                >
                  90°
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded">rotate_right</span>}
                  onClick={() => updateSelectedNodeData({ rotation: (selectedNode.data?.rotation ?? 0) + 90 })}
                >
                  90°
                </Button>
              </Box>
              <TextField
                size="small"
                label="Texto"
                value={selectedNode.data?.label ?? ''}
                onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                sx={{
                  borderColor: 'white',
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: 'white',
                    },
                    '&:hover fieldset': {
                      borderColor: 'white',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'white',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'white',
                  },
                  '& .MuiInputBase-input': {
                    color: 'white',
                  },
                }}
              />
              <TextField
                size="small"
                type="number"
                label="Tamaño de fuente"
                value={selectedNode.data?.fontSize ?? 14}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (isNaN(v)) return;
                  updateSelectedNodeData({ fontSize: v });
                }}
                sx={{
                  borderColor: 'white',
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: 'white',
                    },
                    '&:hover fieldset': {
                      borderColor: 'white',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'white',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'white',
                  },
                  '& .MuiInputBase-input': {
                    color: 'white',
                  },
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-evenly' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => setLabelBgPickerAnchor(e.currentTarget)}
                    sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.backgroundColor ?? 'transparent', border: '1px solid rgba(0,0,0,0.2)' }}
                  />
                  <Typography sx={{ color: 'white', fontSize: 12 }}>Relleno</Typography>
                  <Popover
                    open={!!labelBgPickerAnchor}
                    anchorEl={labelBgPickerAnchor}
                    onClose={() => setLabelBgPickerAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  >
                    <Box sx={{ p: 1 }}>
                      <RgbaColorPicker
                        color={parseColorToRgba(selectedNode.data?.backgroundColor ?? 'rgba(255,255,255,0)')}
                        onChange={(c) => updateSelectedNodeData({ backgroundColor: rgbaToString(c) })}
                      />
                    </Box>
                  </Popover>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => setLabelBorderPickerAnchor(e.currentTarget)}
                    sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.borderColor ?? 'transparent', border: '1px solid rgba(0,0,0,0.2)' }}
                  />
                  <Typography sx={{ color: 'white', fontSize: 12 }}>Color línea</Typography>
                  <Popover
                    open={!!labelBorderPickerAnchor}
                    anchorEl={labelBorderPickerAnchor}
                    onClose={() => setLabelBorderPickerAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  >
                    <Box sx={{ p: 1 }}>
                      <RgbaColorPicker
                        color={parseColorToRgba(selectedNode.data?.borderColor ?? '#000000')}
                        onChange={(c) => updateSelectedNodeData({ borderColor: rgbaToString(c) })}
                      />
                    </Box>
                  </Popover>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-evenly' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => setLabelTextColorAnchor(e.currentTarget)}
                    sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.color ?? 'transparent', border: '1px solid rgba(0,0,0,0.2)' }}
                  />
                  <Typography sx={{ color: 'white', fontSize: 12 }}>Color texto</Typography>
                  <Popover
                    open={!!labelTextColorAnchor}
                    anchorEl={labelTextColorAnchor}
                    onClose={() => setLabelTextColorAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  >
                    <Box sx={{ p: 1 }}>
                      <RgbaColorPicker
                        color={parseColorToRgba(selectedNode.data?.color ?? '#000000')}
                        onChange={(c) => updateSelectedNodeData({ color: rgbaToString(c) })}
                      />
                    </Box>
                  </Popover>
                </Box>
                <TextField
                  size="small"
                  type="number"
                  label="Ancho línea"
                  value={selectedNode.data?.borderWidth ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (isNaN(v)) return;
                    updateSelectedNodeData({ borderWidth: v });
                  }}
                  sx={{
                    width: 100,
                    borderColor: 'white',
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: 'white',
                      },
                      '&:hover fieldset': {
                        borderColor: 'white',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'white',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'white',
                    },
                    '& .MuiInputBase-input': {
                      color: 'white',
                    },
                  }}
                />
              </Box>
            </Box>
          ) : selectedNode.type === 'polygonNode' ? (
            // Controls dedicated for polygon nodes (only polygon properties)
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, color: 'white', width: 260 }}>
              <TextField
                size="small"
                type="number"
                label="Ancho línea"
                value={selectedNode.data?.strokeWidth ?? 2}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (isNaN(v)) return;
                  updateSelectedNodeData({ strokeWidth: v });
                }}
                sx={{
                  width: '100%',
                  borderColor: 'white',
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: 'white',
                    },
                    '&:hover fieldset': {
                      borderColor: 'white',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'white',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: 'white',
                  },
                  '& .MuiInputBase-input': {
                    color: 'white',
                  },
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(e) => setPolygonStrokePickerAnchor(e.currentTarget)}
                  sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.strokeColor ?? '#2196F3', border: '1px solid rgba(0,0,0,0.2)' }}
                />
                <Typography sx={{ color: 'white', fontSize: 12 }}>Color línea</Typography>
                <Popover
                  open={!!polygonStrokePickerAnchor}
                  anchorEl={polygonStrokePickerAnchor}
                  onClose={() => setPolygonStrokePickerAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                >
                  <Box sx={{ p: 1 }}>
                    <RgbaColorPicker
                      color={parseColorToRgba(selectedNode.data?.strokeColor ?? '#2196F3')}
                      onChange={(c) => updateSelectedNodeData({ strokeColor: rgbaToString(c) })}
                    />
                  </Box>
                </Popover>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(e) => setPolygonFillPickerAnchor(e.currentTarget)}
                  sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.fillColor ?? 'rgba(33,150,243,0.1)', border: '1px solid rgba(0,0,0,0.2)' }}
                />
                <Typography sx={{ color: 'white', fontSize: 12 }}>Relleno</Typography>
                <Popover
                  open={!!polygonFillPickerAnchor}
                  anchorEl={polygonFillPickerAnchor}
                  onClose={() => setPolygonFillPickerAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                >
                  <Box sx={{ p: 1 }}>
                    <RgbaColorPicker
                      color={parseColorToRgba(selectedNode.data?.fillColor ?? '#2196F3', selectedNode.data?.fillOpacity)}
                      onChange={(c) => {
                        // Store rgb color in fillColor and alpha separately in fillOpacity
                        const { r, g, b, a } = c as { r: number; g: number; b: number; a?: number };
                        updateSelectedNodeData({ fillColor: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`, fillOpacity: typeof a === 'number' ? a : 1 });
                      }}
                    />
                  </Box>
                </Popover>
              </Box>
            </Box>
          ) : (
            // Controls for symbol (graphic) nodes — preserved from previous UI
            <>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded">rotate_left</span>}
                  onClick={() => updateSelectedNodeData({ rotation: (selectedNode.data?.rotation ?? 0) - 90 })}
                >
                  90°
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded">rotate_right</span>}
                  onClick={() => updateSelectedNodeData({ rotation: (selectedNode.data?.rotation ?? 0) + 90 })}
                >
                  90°
                </Button>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1, width: 220 }}>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded">flip</span>}
                  onClick={() => updateSelectedNodeData({ flipX: !(selectedNode.data?.flipX ?? false) })}
                >
                  Flip X
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded" style={{ transform: 'rotate(90deg)' }}>flip</span>}
                  onClick={() => updateSelectedNodeData({ flipY: !(selectedNode.data?.flipY ?? false) })}
                >
                  Flip Y
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1, color: 'white' }}>
                <TextField
                  type="number"
                  size="small"
                  slotProps={{
                    htmlInput: {
                      min: 0.5,
                      max: 2,
                      step: 0.05,
                    }
                  }}
                  sx={{
                    borderColor: 'white',
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: 'white',
                      },
                      '&:hover fieldset': {
                        borderColor: 'white',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'white',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'white',
                    },
                    '& .MuiInputBase-input': {
                      color: 'white',
                    },
                  }}
                  fullWidth
                  label="Escala"
                  value={selectedNode.data?.scale ?? 1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (isNaN(v)) return;
                    updateSelectedNodeData({ scale: v });
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {/* Background color button + popover */}
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => setBgPickerAnchor(e.currentTarget)}
                    sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.backgroundColor ?? 'rgba(255, 255, 255, 0)', border: '1px solid rgba(0,0,0,0.2)' }}
                  />
                  <Typography sx={{ color: 'white', fontSize: 12 }}>Relleno</Typography>
                  <Popover
                    open={!!bgPickerAnchor}
                    anchorEl={bgPickerAnchor}
                    onClose={() => setBgPickerAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  >
                    <Box sx={{ p: 1 }}>
                      <RgbaColorPicker
                        color={parseColorToRgba(selectedNode.data?.backgroundColor)}
                        onChange={(c) => updateSelectedNodeData({ backgroundColor: rgbaToString(c) })}
                      />
                    </Box>
                  </Popover>

                  {/* Primary color button + popover */}
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => setPrimaryPickerAnchor(e.currentTarget)}
                    sx={{ minWidth: 32, width: 32, height: 32, padding: 0, backgroundColor: selectedNode.data?.primaryColor ?? 'rgba(0, 0, 0, 1)', border: '1px solid rgba(0,0,0,0.2)' }}
                  />
                  <Typography sx={{ color: 'white', fontSize: 12 }}>Color línea</Typography>
                  <Popover
                    open={!!primaryPickerAnchor}
                    anchorEl={primaryPickerAnchor}
                    onClose={() => setPrimaryPickerAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  >
                    <Box sx={{ p: 1 }}>
                      <RgbaColorPicker
                        color={parseColorToRgba(selectedNode.data?.primaryColor)}
                        onChange={(c) => updateSelectedNodeData({ primaryColor: rgbaToString(c) })}
                      />
                    </Box>
                  </Popover>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={<span className="material-symbols-rounded">swap_horiz</span>}
                  onClick={() => updateSelectedNodeData({ invertHandles: !(selectedNode.data?.invertHandles ?? false) })}
                >
                  Invertir handles
                </Button>
              </Box>
            </>
          )}
        </Box>
      ) : null}

      {/* Diálogo de confirmación para nuevo esquema */}
      <Dialog open={showNewSchemaConfirm} onClose={cancelNewSchema} maxWidth="sm">
        <DialogTitle sx={{ textAlign: 'center', backgroundColor: '#263238', color: '#fff', fontSize: 18, fontWeight: 400, padding: '12px 16px' }}>Crear Nuevo Esquema</DialogTitle>
    <DialogContent sx={{ mt: 2 }}>
          <Typography>
            ¿Estás seguro de que quieres crear un nuevo esquema? Se perderán todos los cambios no guardados.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelNewSchema}>Cancelar</Button>
          <Button onClick={confirmNewSchema} variant="contained" color="error">
            Crear Nuevo
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo para pedir nombre de usuario (requerido) */}
      <Dialog open={showUsernameDialog} onClose={handleUsernameCancel} maxWidth="xs">
        <DialogTitle sx={{ textAlign: 'center', backgroundColor: '#263238', color: '#fff', fontSize: 18, fontWeight: 400, padding: '12px 16px' }}>Nombre de usuario requerido</DialogTitle>
  <DialogContent sx={{ mt: 2 }}>
          <Typography sx={{ mb: 1 }}>Introduce un nombre de usuario alfanumérico (mínimo 6 caracteres).</Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Nombre de usuario"
            fullWidth
            variant="outlined"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value.toLowerCase().trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') { void handleUsernameSave(); } }}
            helperText={usernameInput && !isValidUsername(usernameInput) ? 'Debe ser alfanumérico y al menos 6 caracteres' : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { void handleUsernameSave(); }} variant="contained">Aceptar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo para guardar esquema */}
      <Dialog open={showSaveDialog} onClose={() => setShowSaveDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', backgroundColor: '#263238', color: '#fff', fontSize: 18, fontWeight: 400, padding: '12px 16px' }}>Guardar Esquema</DialogTitle>
  <DialogContent sx={{ mt: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Nombre del esquema"
            fullWidth
            variant="outlined"
            value={schemaName}
            onChange={(e) => setSchemaName(e.target.value)}
            //sx={{ mb: 2 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            margin="dense"
            label="Descripción (opcional)"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={schemaDescription}
            onChange={(e) => setSchemaDescription(e.target.value)}
            //sx={{ mb: 2 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={schemaLocal}
                onChange={(e) => setSchemaLocal(e.target.checked)}
                disabled={Boolean(currentSchemaId || currentSchemaLocal)}
              />
            }
            label="No guardar en la nube"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSaveDialog(false)}>Cancelar</Button>
          <Button onClick={() => { void handleSaveSchema(); }} variant="contained">
            {currentSchemaId ? 'Actualizar' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo para cargar esquemas */}
      <Dialog open={showSchemasDialog} onClose={() => setShowSchemasDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', backgroundColor: '#263238', color: '#fff', fontSize: 18, fontWeight: 400, padding: '12px 16px' }}>Esquemas Guardados</DialogTitle>
        <DialogContent sx={{mt: 2}}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl  sx={{ minWidth: 160 }}>
              <InputLabel id="schema-filter-label">Mostrar</InputLabel>
              <Select
                labelId="schema-filter-label"
                value={schemaFilter}
                label="Mostrar"
                onChange={(e: SelectChangeEvent) => setSchemaFilter(e.target.value as 'activos' | 'eliminados' | 'todos' | 'locales' | 'propios')}
              >
                <MenuItem value="activos">Activos</MenuItem>
                <MenuItem value="eliminados">Eliminados</MenuItem>
                <MenuItem value="todos">Todos</MenuItem>
                <MenuItem value="locales">Locales</MenuItem>
                <MenuItem value="propios">Propios</MenuItem>
              </Select>
            </FormControl>
            <TextField
              margin="dense"
              label="Buscar por nombre o descripción"
              fullWidth
              variant="outlined"
              value={schemaSearch}
              onChange={(e) => setSchemaSearch(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

          </Box>
          <List>
            {(() => {
              const q = schemaSearch.trim().toLowerCase();
              const filteredBySearch = q
                ? schemas.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
                : schemas;

              const filtered = filteredBySearch.filter(s => {
                switch (schemaFilter) {
                  case 'activos':
                    return s.hidden !== true;
                  case 'eliminados':
                    return s.hidden === true;
                  case 'todos':
                    return true;
                  case 'locales':
                    return s.local === true;
                  case 'propios':
                    return (s.created_by || '') === (username || localStorage.getItem('dp_username') || '');
                  default:
                    return true;
                }
              });

              if (filtered.length === 0) {
                return (
                  <ListItem>
                    <ListItemText primary={q ? 'No se encontraron resultados' : 'No hay esquemas guardados'} />
                  </ListItem>
                );
              }

              return filtered.map((schema) => {
                const isLocalSchema = Boolean(schema.local);
                const isSyncSchema = Boolean(schema.synchronized);
                const schemaIconName = isLocalSchema ? 'cloud_off' : (isSyncSchema ? 'cloud_done' : 'cloud_alert');
                const schemaIconColor = isLocalSchema ? theme.palette.error.main : (isSyncSchema ? theme.palette.success.main : theme.palette.warning.main);

                return (
                  <ListItem
                    key={schema.id}
                    secondaryAction={(
                      <>
                        <IconButton
                          edge="end"
                          color='primary'
                          onClick={() => { void handleLoadSchema(schema); }}
                          title="Cargar esquema (reemplaza actual)"
                          sx={{ mr: 1 }}
                        >
                          <span className="material-symbols-rounded">edit</span>
                        </IconButton>
                        <IconButton
                          edge="end"
                          color='primary'
                          onClick={() => { void handleImportSchema(schema); }}
                          title="Importar elementos al esquema actual"
                          sx={{ mr: 1 }}
                        >
                          <span className="material-symbols-rounded">merge_type</span>
                        </IconButton>
                        <IconButton
                          edge="end"
                          color='primary'
                          onClick={() => { void handleDuplicateSchema(schema.id!, schema.name); }}
                          title="Duplicar esquema"
                          sx={{ mr: 1 }}
                        >
                          <span className="material-symbols-rounded">content_copy</span>
                        </IconButton>
                        {schema.hidden === true ? (
                          <IconButton
                            edge="end"
                            color="success"
                            onClick={() => { void handleRestoreSchema(schema.id!, schema.name); }}
                            title="Restaurar esquema"
                          >
                            <span className="material-symbols-rounded">restore_from_trash</span>
                          </IconButton>
                        ) : (
                          <IconButton
                            edge="end"
                            color='error'
                            onClick={() => { void handleDeleteSchema(schema.id!, schema.name); }}
                            title="Eliminar esquema"
                          >
                            <span className="material-symbols-rounded">delete</span>
                          </IconButton>
                        )}
                      </>
                    )}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                      <span className="material-symbols-rounded" style={{ color: schemaIconColor, fontSize: 20 }}>{schemaIconName}</span>
                    </Box>
                    <ListItemText
                      primary={schema.name}
                      secondary={(
                        <>
                          {schema.description ? <Typography component="span" display="block">{schema.description}</Typography> : null}
                          <Typography component="span" sx={{ whiteSpace: 'pre-line' }}>
                            Creado: {new Date(schema.created_at || '').toLocaleString()} • Usuario: {schema.created_by ?? '—'}
                          </Typography>
                        </>
                      )}
                    />
                  </ListItem>
                );
              })
            })()}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { void handleManualSyncSchemas(); }} color="primary">Sincronizar</Button>
          <Button onClick={() => setShowSchemasDialog(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <React.Suspense fallback={null}>
        <SvgEditorDialog
          open={showSvgDialog}
          onClose={() => setShowSvgDialog(false)}
          svgName={svgName}
          setSvgName={setSvgName}
          svgDescription={svgDescription}
          setSvgDescription={setSvgDescription}
          svgCategory={svgCategory}
          setSvgCategory={setSvgCategory}
          categories={svgCategories}
          svgHandles={svgHandles}
          setSvgHandles={setSvgHandles}
          svgMarkup={svgMarkup}
          setSvgMarkup={setSvgMarkup}
          useEditor={useEditor}
          setUseEditor={setUseEditor}
          sanitizedSvg={sanitizedSvg}
          svgElements={svgElements}
          onSaveSvgElement={handleSaveSvgElement}
        />
      </React.Suspense>
      {SchemaConfirmDialog}
      <NotifierRenderer />
      <Box sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1200 }}>
        <Typography
          component="a"
          href="https://github.com/pnbarbeito/DrawPaK-Web"
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
          sx={{ color: 'rgba(37, 34, 34, 0.85)', textDecoration: 'none' }}
        >
          Publicado bajo licencia Apache-2.0 - © 2025 Pablo N. Barbeito
        </Typography>
      </Box>
    </Box>
  );
}

export default FlowApp;
