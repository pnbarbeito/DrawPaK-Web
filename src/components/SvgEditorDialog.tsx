import React from 'react';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Checkbox, Typography, Select, MenuItem, FormControl, InputLabel, Slider, Tooltip, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SvgShapeEditor from './SvgShapeEditor';
import { syncSvgsWithBackend, formatTimestamp, updateSvgElement } from './database.ts';
import { notify } from './notifierBus';
// Replaced MUI icons with material symbol spans
type Props = {
  open: boolean;
  onClose: () => void;
  svgName: string;
  setSvgName: (v: string) => void;
  svgDescription: string;
  setSvgDescription: (v: string) => void;
  svgCategory: string;
  setSvgCategory: (v: string) => void;
  categories: string[];
  svgHandles: string;
  setSvgHandles: (v: string) => void;
  svgMarkup: string;
  setSvgMarkup: (v: string) => void;
  useEditor: boolean;
  setUseEditor: (v: boolean) => void;
  sanitizedSvg: string;
  svgElements: import('./database.ts').SvgElement[];
  // When saving, caller may accept an optional 'local' flag to control storage
  // local=true means do not store in cloud (store locally only)
  onSaveSvgElement: (local?: boolean) => void | Promise<void>;
};

type ImportedHandle = { id: string; x: number; y: number; type?: string };
type ImportedShape = {
  id: string;
  type: 'rect' | 'circle' | 'line' | 'semicircle';
  x?: number; y?: number; w?: number; h?: number; x1?: number; y1?: number; x2?: number; y2?: number; r?: number;
  fill?: boolean; fillColor?: string; strokeColor?: string; strokeWidth?: number; rotation?: number;
  handles?: ImportedHandle[];
};

const SvgEditorDialog: React.FC<Props> = ({
  open, onClose, svgName, setSvgName, svgDescription, setSvgDescription,
  svgCategory, setSvgCategory, categories,
  svgHandles, setSvgHandles, svgMarkup, setSvgMarkup, useEditor, setUseEditor,
  sanitizedSvg, svgElements, onSaveSvgElement
}) => {
  // Internal status icon component for cards
  const StatusIcon: React.FC<{ element: import('./database.ts').SvgElement }> = ({ element }) => {
    const theme = useTheme();
    const isLocal = Boolean(element.local);
    const isSync = Boolean(element.synchronized);
    const iconName = isLocal ? 'cloud_off' : (isSync ? 'cloud_done' : 'cloud_alert');
    const color = isLocal ? theme.palette.error.main : (isSync ? theme.palette.success.main : theme.palette.warning.main);
    return (
      <span style={{ position: 'absolute', right: 8, top: 8, zIndex: 20 }}>
        <span className="material-symbols-rounded" style={{ color, fontSize: 25 }}>{iconName}</span>
      </span>
    );
  };

  const [editorReloadKey, setEditorReloadKey] = React.useState<number>(Date.now());
  const [dialogDisplayScale, setDialogDisplayScale] = React.useState<number | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [svgLocal, setSvgLocal] = React.useState<boolean>(false); // false = save to cloud by default
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [toDelete, setToDelete] = React.useState<import('./database.ts').SvgElement | null>(null);

  const STORAGE_KEY = 'svgShapeEditor.draft.v1';

  const handleClearAll = () => {
    try {
      // Limpiar campos externos
      setSvgName('');
      setSvgDescription('');
      setSvgCategory('custom');
      setSvgHandles('');
      setSvgMarkup('');

      // Eliminar borrador del editor gráfico y forzar remount
      localStorage.removeItem(STORAGE_KEY);
      setUseEditor(true);
      setEditorReloadKey(Date.now());
    } catch (e) {
      console.error('Error limpiando editor SVG', e);
    }
  };

  const copyElementToEditor = (el: import('./database.ts').SvgElement) => {
    // build a minimal draft payload compatible with SvgShapeEditor
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(el.svg || '', 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      let w = 120, h = 120;
      if (svgEl) {
        const vb = svgEl.getAttribute('viewBox');
        if (vb) {
          const parts = vb.split(/[ ,]+/).map((p) => parseFloat(p)).filter(n => !isNaN(n));
          if (parts.length === 4) { w = Math.abs(parts[2]) || w; h = Math.abs(parts[3]) || h; }
        } else {
          const wa = svgEl.getAttribute('width');
          const ha = svgEl.getAttribute('height');
          const pw = wa ? parseFloat(wa.toString().replace(/[^0-9.-]/g, '')) : NaN;
          const ph = ha ? parseFloat(ha.toString().replace(/[^0-9.-]/g, '')) : NaN;
          if (!isNaN(pw) && !isNaN(ph)) { w = pw; h = ph; }
        }
      }

      // parse handles (may be stored as stringified JSON)
      let handlesRaw: unknown = [];
      try { handlesRaw = el.handles ? (typeof el.handles === 'string' ? JSON.parse(el.handles) : el.handles) : []; } catch { handlesRaw = []; }

      // normalize handles to expected shape: { id, x, y, type }
      let handles: ImportedHandle[] = [];
      if (Array.isArray(handlesRaw)) {
        handles = (handlesRaw as unknown[]).map((h, idx) => {
          const ho = h as Record<string, unknown> | undefined;
          const id = (ho && typeof ho.id === 'string') ? ho.id : `h_${idx}`;
          const x = (ho && (typeof ho.x === 'number' || typeof ho.x === 'string')) ? Number((ho.x as unknown)) : 0;
          const y = (ho && (typeof ho.y === 'number' || typeof ho.y === 'string')) ? Number((ho.y as unknown)) : 0;
          const type = (ho && typeof ho.type === 'string') ? ho.type : 'source';
          return { id, x, y, type };
        });
      }

      // Try to parse SVG child elements into editable shapes (rect/circle/line)
      const shapes: ImportedShape[] = [];

      const parseTransformRotation = (el: Element | null) => {
        // Accumulate rotate(...) angles from the element and its ancestor chain.
        let total = 0;
        let node: Element | null = el;
        while (node) {
          const t = node.getAttribute('transform') || '';
          const m = t.match(/rotate\(([^)]+)\)/);
          if (m) {
            const parts = m[1].split(/[ ,]+/).map(p => parseFloat(p)).filter(n => !isNaN(n));
            if (parts.length > 0) total += parts[0] || 0;
          }
          node = node.parentElement as Element | null;
        }
        return total;
      };

      // rects
      Array.from(doc.querySelectorAll('rect')).forEach((rEl, idx) => {
        const x = parseFloat(rEl.getAttribute('x') || '0');
        const y = parseFloat(rEl.getAttribute('y') || '0');
        const wAttr = parseFloat(rEl.getAttribute('width') || '0');
        const hAttr = parseFloat(rEl.getAttribute('height') || '0');
        const fillAttr = rEl.getAttribute('fill');
        const stroke = rEl.getAttribute('stroke') || '#000';
        const strokeW = parseFloat(rEl.getAttribute('stroke-width') || '1');
        const rotation = parseTransformRotation(rEl);
        shapes.push({ id: `shape_import_rect_${el.id}_${idx}_${Date.now()}`, type: 'rect', x, y, w: wAttr, h: hAttr, fill: !!(fillAttr && fillAttr !== 'none'), fillColor: fillAttr || 'rgba(255,255,255,0)', strokeColor: stroke, strokeWidth: strokeW || 1, rotation: rotation || 0, handles: [] });
      });

      // circles
      Array.from(doc.querySelectorAll('circle')).forEach((cEl, idx) => {
        const cx = parseFloat(cEl.getAttribute('cx') || '0');
        const cy = parseFloat(cEl.getAttribute('cy') || '0');
        const r = parseFloat(cEl.getAttribute('r') || '0');
        const fillAttr = cEl.getAttribute('fill');
        const stroke = cEl.getAttribute('stroke') || '#000';
        const strokeW = parseFloat(cEl.getAttribute('stroke-width') || '1');
        const rotation = parseTransformRotation(cEl);
        shapes.push({ id: `shape_import_circle_${el.id}_${idx}_${Date.now()}`, type: 'circle', x: cx, y: cy, r, fill: !!(fillAttr && fillAttr !== 'none'), fillColor: fillAttr || 'rgba(255,255,255,0)', strokeColor: stroke, strokeWidth: strokeW || 1, rotation: rotation || 0, handles: [] });
      });

      // lines
      Array.from(doc.querySelectorAll('line')).forEach((lEl, idx) => {
        const x1 = parseFloat(lEl.getAttribute('x1') || '0');
        const y1 = parseFloat(lEl.getAttribute('y1') || '0');
        const x2 = parseFloat(lEl.getAttribute('x2') || '0');
        const y2 = parseFloat(lEl.getAttribute('y2') || '0');
        const stroke = lEl.getAttribute('stroke') || '#000';
        const strokeW = parseFloat(lEl.getAttribute('stroke-width') || '1');
        const rotation = parseTransformRotation(lEl);
        shapes.push({ id: `shape_import_line_${el.id}_${idx}_${Date.now()}`, type: 'line', x1, y1, x2, y2, fill: false, fillColor: 'none', strokeColor: stroke, strokeWidth: strokeW || 1, rotation: rotation || 0, handles: [] });
      });

      // polyline: parse numeric points robustly and treat first two points as a line if available
      Array.from(doc.querySelectorAll('polyline')).forEach((pEl, idx) => {
        const pts = (pEl.getAttribute('points') || '').trim();
        if (!pts) return;
        // extract all numbers and pair them
        const nums = pts.match(/[+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?/g)?.map(n => parseFloat(n)) || [];
        if (nums.length >= 4) {
          const x1 = nums[0];
          const y1 = nums[1];
          const x2 = nums[2];
          const y2 = nums[3];
          const stroke = pEl.getAttribute('stroke') || '#000';
          const strokeW = parseFloat(pEl.getAttribute('stroke-width') || '1');
          const rotation = parseTransformRotation(pEl);
          shapes.push({ id: `shape_import_polyline_${el.id}_${idx}_${Date.now()}`, type: 'line', x1, y1, x2, y2, fill: false, fillColor: 'none', strokeColor: stroke, strokeWidth: strokeW || 1, rotation: rotation || 0, handles: [] });
        }
      });

      // path: try to parse simple paths by extracting numeric coordinates and using first two points
      Array.from(doc.querySelectorAll('path')).forEach((pathEl, idx) => {
        const d = (pathEl.getAttribute('d') || '').trim();
        if (!d) return;
        // Try to detect an arc command (A or a) and map simple semicircle arcs to the editor's semicircle shape
        try {
          const cmdTokens = d.match(/[AaMmLlHhVvCcSsQqTtZz]|[+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?/g) || [];
          // find initial M (start point)
          let startX: number | null = null;
          let startY: number | null = null;
          for (let i = 0; i < cmdTokens.length; i++) {
            const t = cmdTokens[i];
            if ((t === 'M' || t === 'm') && i + 2 < cmdTokens.length) {
              startX = parseFloat(cmdTokens[i + 1]);
              startY = parseFloat(cmdTokens[i + 2]);
              break;
            }
          }

          // find first arc command
          let arcIdx = -1;
          for (let i = 0; i < cmdTokens.length; i++) {
            if (cmdTokens[i] === 'A' || cmdTokens[i] === 'a') { arcIdx = i; break; }
          }

          if (arcIdx !== -1 && startX !== null && startY !== null) {
            // A rx ry xAxisRot largeArcFlag sweepFlag x y
            const rx = parseFloat(cmdTokens[arcIdx + 1]);
            const ry = parseFloat(cmdTokens[arcIdx + 2]);
            const xAxisRot = parseFloat(cmdTokens[arcIdx + 3]) || 0;
            // flags (ignored for semicircle detection)
            let x2 = parseFloat(cmdTokens[arcIdx + 6]);
            let y2 = parseFloat(cmdTokens[arcIdx + 7]);

            // If the arc command was relative ('a'), endpoint is relative to start
            if (cmdTokens[arcIdx] === 'a') {
              x2 = startX + x2;
              y2 = startY + y2;
            }

            // If radii are equal and endpoints are roughly opposite points on circle -> semicircle
            const dx = x2 - startX;
            const dy = y2 - startY;
            const dist = Math.hypot(dx, dy);
            const tol = Math.max(1, Math.min(4, rx * 0.1));

            if (!isNaN(rx) && !isNaN(ry) && Math.abs(rx - ry) < 0.0001 && Math.abs(dist - 2 * rx) <= tol) {
              // center is midpoint for a simple semicircle
              const cx = (startX + x2) / 2;
              const cy = (startY + y2) / 2;
              const stroke = pathEl.getAttribute('stroke') || '#000';
              const strokeW = parseFloat(pathEl.getAttribute('stroke-width') || '1');
              // include x-axis-rotation from the arc command plus any ancestor rotate()
              const rotation = (parseTransformRotation(pathEl) || 0) + (xAxisRot || 0);
              shapes.push({ id: `shape_import_semi_${el.id}_${idx}_${Date.now()}`, type: 'semicircle', x: cx, y: cy, r: rx, fill: false, fillColor: 'none', strokeColor: stroke, strokeWidth: strokeW || 1, rotation: rotation || 0, handles: [] });
              return; // handled this path as semicircle
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // parsing failed, fall back to numeric extraction below
        }

        // fallback: extract numbers (handles various separators and scientific notation)
        const nums = d.match(/[+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?/g)?.map(n => parseFloat(n)) || [];
        if (nums.length >= 4) {
          const x1 = nums[0];
          const y1 = nums[1];
          const x2 = nums[2];
          const y2 = nums[3];
          const stroke = pathEl.getAttribute('stroke') || '#000';
          const strokeW = parseFloat(pathEl.getAttribute('stroke-width') || '1');
          const rotation = parseTransformRotation(pathEl);
          shapes.push({ id: `shape_import_path_${el.id}_${idx}_${Date.now()}`, type: 'line', x1, y1, x2, y2, fill: false, fillColor: 'none', strokeColor: stroke, strokeWidth: strokeW || 1, rotation: rotation || 0, handles: [] });
        }
      });

      // If we parsed at least one supported shape, assign handles to nearest shape center
      if (shapes.length > 0) {
        const distSq = (x1: number, y1: number, x2: number, y2: number) => (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
        const shapeCenter = (s: ImportedShape) => {
          if (s.type === 'rect') return { x: (s.x || 0) + ((s.w || 0) / 2), y: (s.y || 0) + ((s.h || 0) / 2) };
          if (s.type === 'circle') return { x: s.x || 0, y: s.y || 0 };
          if (s.type === 'line') return { x: ((s.x1 || 0) + (s.x2 || 0)) / 2, y: ((s.y1 || 0) + (s.y2 || 0)) / 2 };
          return { x: 0, y: 0 };
        };

        handles.forEach((h, idx) => {
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i < shapes.length; i++) {
            const c = shapeCenter(shapes[i]);
            const d = distSq(h.x || 0, h.y || 0, c.x, c.y);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          const target = shapes[bestIdx];
          target.handles = target.handles || [];
          target.handles.push({ id: h.id || `h_${idx}`, x: h.x || 0, y: h.y || 0, type: h.type || 'source' });
        });

        const payload = { shapes, canvasWidth: w, canvasHeight: h };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } else {
        // fallback: create a non-visible placeholder shape (w=0,h=0, no stroke) so handles are copied
        const shape = {
          id: `shape_import_${el.id}_${Date.now()}`,
          type: 'rect',
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          fill: false,
          fillColor: 'rgba(255,255,255,0)',
          strokeColor: 'none',
          strokeWidth: 0,
          rotation: 0,
          handles
        };

        const payload = { shapes: [shape], canvasWidth: w, canvasHeight: h };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
      // ensure editor is active and remount it so it reads from storage on mount
      setUseEditor(true);
      setEditorReloadKey(Date.now());
    } catch (e) {
      console.error('Error copiando elemento al editor', e);
      alert('Error copiando elemento al editor');
    }
  };
  // Normalize SVG string for preview/thumbnail: ensure viewBox, remove width/height, set requested display size
  const normalizeSvgForPreview = (svgStr: string | undefined, targetW: number, targetH: number) => {
    if (!svgStr) return '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgStr, 'image/svg+xml');
      const root = doc.documentElement as unknown as HTMLElement | null;
      if (!root || root.nodeName.toLowerCase() !== 'svg') return svgStr;
      const svgEl = root as unknown as SVGElement;

      // If no viewBox but width/height exist, derive viewBox
      const vb = svgEl.getAttribute('viewBox');
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      if (!vb && wAttr && hAttr) {
        const pw = parseFloat(wAttr);
        const ph = parseFloat(hAttr);
        if (!isNaN(pw) && !isNaN(ph) && pw > 0 && ph > 0) {
          svgEl.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
        }
      }

      // Remove existing width/height so the SVG is flexible, then set explicit thumbnail attributes
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.setAttribute('width', String(targetW));
      svgEl.setAttribute('height', String(targetH));
      svgEl.setAttribute('style', `width:${targetW}px;height:${targetH}px;display:block`);

      const serializer = new XMLSerializer();
      return serializer.serializeToString(svgEl);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return svgStr;
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth sx={{ borderRadius: 4 }}>
      <DialogTitle sx={{ textAlign: 'center', backgroundColor: '#263238', color: '#fff', fontSize: 18, fontWeight: 400, padding: '12px 16px' }}>
        Crear/Editar Elemento SVG
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Nombre"
          fullWidth
          variant="outlined"
          value={svgName}
          onChange={(e) => setSvgName(e.target.value)}
        />
        <TextField
          margin="dense"
          label="Descripción (opcional)"
          fullWidth
          variant="outlined"
          value={svgDescription}
          onChange={(e) => setSvgDescription(e.target.value)}
        />

        <FormControl margin="dense" fullWidth variant="outlined">
          <InputLabel>Categoría</InputLabel>
          <Select
            value={svgCategory}
            onChange={(e) => setSvgCategory(e.target.value)}
            label="Categoría"
          >
            <MenuItem value="custom">Personalizado</MenuItem>
            <MenuItem value="basic">Básico</MenuItem>
            <MenuItem value="flowchart">Diagrama de flujo</MenuItem>
            <MenuItem value="network">Red</MenuItem>
            <MenuItem value="uml">UML</MenuItem>
            <MenuItem value="eliminados">Eliminados</MenuItem>
            {categories.filter(cat => !['custom', 'basic', 'flowchart', 'network', 'uml'].includes(cat)).map(cat => (
              <MenuItem key={cat} value={cat}>{cat}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <FormControlLabel
            control={<Checkbox checked={useEditor} onChange={(e) => setUseEditor(e.target.checked)} />}
            label="Usar editor gráfico"
          />
          {/* Slider for visual display scale: visible only when editor is active */}
          {useEditor && (
            <>
              <Typography id="input-slider" sx={{ mr: 2 }}>
                Escala del editor:
              </Typography>
              <Box sx={{ width: 300 }}>
                <Slider
                  aria-label="Custom marks"
                  defaultValue={3}
                  getAriaValueText={() => (typeof dialogDisplayScale === 'number' ? dialogDisplayScale.toFixed(1) : '3')}
                  step={0.1}
                  min={0.5}
                  max={6}
                  value={typeof dialogDisplayScale === 'number' ? dialogDisplayScale : 3}
                  onChange={(_, v) => setDialogDisplayScale(typeof v === 'number' ? v : 3)}
                  marks={[
                    { value: 0.5, label: '0.5x' },
                    { value: 1, label: '1x' },
                    { value: 2, label: '2x' },
                    { value: 3, label: '3x' },
                    { value: 4, label: '4x' },
                    { value: 5, label: '5x' },
                    { value: 6, label: '6x' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>
            </>
          )}
        </Box>

        {useEditor ? (
          <>
            <Box style={{ marginTop: 8, border: '1px solid #ddd', padding: 8 }}>
              <SvgShapeEditor
                key={editorReloadKey}
                width={120}
                height={120}
                onChange={(res) => {
                  setSvgMarkup(typeof res.svg === 'string' ? res.svg : '');
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  try { setSvgHandles(JSON.stringify(res.handles || [])); } catch (e) { setSvgHandles('[]'); }
                }}
                displayScale={typeof dialogDisplayScale === 'number' ? dialogDisplayScale : undefined}
                onDisplayScaleChange={(n) => setDialogDisplayScale(n)}
              />
            </Box>
          </>
        ) : (
          <>
            <TextField
              margin="dense"
              label="Handles (JSON)"
              fullWidth
              variant="outlined"
              value={svgHandles}
              onChange={(e) => setSvgHandles(e.target.value)}
              helperText='Ej: [{"id":"h_1756916462310","x":30,"y":45,"type":"source"}]'
            />
            <TextField
              margin="dense"
              label="SVG markup"
              fullWidth
              variant="outlined"
              multiline
              rows={8}
              value={svgMarkup}
              onChange={(e) => setSvgMarkup(e.target.value)}
            />
            <Box style={{ marginTop: 8 }}>
              <Typography variant="subtitle2">Previsualización</Typography>
              <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 4, background: '#fff' }}>
                {sanitizedSvg ? (
                  <div dangerouslySetInnerHTML={{ __html: normalizeSvgForPreview(sanitizedSvg, 160, 160) }} />
                ) : svgMarkup ? (
                  <div dangerouslySetInnerHTML={{ __html: normalizeSvgForPreview(svgMarkup, 160, 160) }} />
                ) : (
                  <div style={{ color: '#888' }}>Sin contenido</div>
                )}
              </div>
            </Box>
          </>
        )}



        <Box style={{ marginTop: 12 }}>
          <Typography variant="subtitle2">Elementos guardados</Typography>
          <Box style={{ marginTop: 8 }}>
            {/* Filters: category + search */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Filtrar categoría</InputLabel>
                <Select
                  value={categoryFilter}
                  label="Filtrar categoría"
                  onChange={(e) => setCategoryFilter(String(e.target.value))}
                >
                  <MenuItem value="all">Todas</MenuItem>
                  <MenuItem value="eliminados">Eliminados</MenuItem>
                  {categories.map((cat) => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="Buscar por nombre o descripción"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ minWidth: 240, flex: 1 }}
              />
              <Tooltip title="Sincronizar con servidor">
                <IconButton size="small" color='success' onClick={() => {
                  void (async () => {
                    try {
                      await syncSvgsWithBackend();
                      // Notify other parts of the app to reload palette
                      window.dispatchEvent(new Event('svg-elements-updated'));
                    } catch (e) {
                      console.warn('Error sincronizando svgs con backend:', e);
                      window.dispatchEvent(new Event('svg-elements-updated'));
                    }
                  })();
                }} title="Sincronizar con servidor">
                  <span className="material-symbols-rounded" style={{ color: 'rgba(36, 168, 19, 1)' }}>cloud_sync</span>
                </IconButton>
              </Tooltip>
            </Box>

            {(() => {
              const q = (searchQuery || '').trim().toLowerCase();
              const filtered = svgElements.filter((el) => {
                // hidden handling: when viewing 'Eliminados' category show only hidden items;
                // otherwise exclude hidden items from normal listing
                if (categoryFilter === 'eliminados') {
                  if (!el.hidden) return false;
                } else {
                  if (el.hidden) return false;
                }

                // category filter: when 'eliminados' is active, ignore category filtering
                if (categoryFilter !== 'all' && categoryFilter !== 'eliminados') {
                  const cat = (el.category as string) || 'custom';
                  if (cat !== categoryFilter) return false;
                }

                if (!q) return true;
                const name = (el.name || '').toLowerCase();
                const desc = (el.description || '').toLowerCase();
                return name.includes(q) || desc.includes(q);
              });

              if (filtered.length === 0) {
                return <Typography variant="body2" style={{ color: '#666' }}>No hay elementos que coincidan</Typography>;
              }

              return (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {filtered.map((el) => (
                    <Box
                      key={el.id}
                      sx={{
                        position: 'relative',
                        width: '100%',
                        border: '1px solid #eee',
                        borderRadius: 2,
                        background: '#fff',
                        overflow: 'hidden',
                        transition: 'transform 150ms ease, box-shadow 150ms ease',
                        '&:hover': {
                          transform: 'translateY(-6px)',
                          boxShadow: 3,
                        }
                      }}
                    >
                      <StatusIcon element={el} />
                      <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0', padding: 8, boxSizing: 'border-box', background: '#fff' }}>
                        <div dangerouslySetInnerHTML={{ __html: normalizeSvgForPreview(el.svg || '', 96, 96) }} />
                      </div>
                      <Box sx={{ p: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center' }}>{el.name}</Typography>
                        <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>{el.description}</Typography>
                        <Typography variant="caption" sx={{ color: '#444', display: 'block', mt: 0.75 }}>Creado por: {el.created_by || 'desconocido'}</Typography>
                        <Typography variant="caption" sx={{ color: '#444', display: 'block', mt: 0.75 }}>Fecha: {formatTimestamp(el.created_at) || 'desconocido'}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                          <Button size="small" onClick={() => copyElementToEditor(el)}>Copiar al editor</Button>
                          {el.hidden ? (
                            <Button size="small" color="success" onClick={() => {
                              void (async () => {
                                if (!el.id) return;
                                try {
                                  await updateSvgElement(String(el.id), { hidden: false });
                                  try { notify({ message: `Elemento "${el.name}" restaurado`, severity: 'success' }); } catch { /* ignore */ }
                                } catch (err) {
                                  console.error('Failed to restore svg', el.id, err);
                                } finally {
                                  try { window.dispatchEvent(new Event('svg-elements-updated')); } catch { /* ignore */ }
                                }
                              })();
                            }}>Restaurar</Button>
                          ) : (
                            <Button size="small" color="error" onClick={() => { setToDelete(el); setConfirmOpen(true); }}>Eliminar</Button>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              );
            })()}
          </Box>
        </Box>
      </DialogContent>
      {/* Confirm delete dialog */}
      <Dialog open={confirmOpen} onClose={() => { setConfirmOpen(false); setToDelete(null); }}>
        <DialogTitle>Marcar como eliminado</DialogTitle>
        <DialogContent>
          <Typography>¿Deseas marcar como eliminado el elemento "{toDelete?.name}"? Esto lo ocultará en la paleta y editor; el servidor no será modificado.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmOpen(false); setToDelete(null); }} color="secondary">Cancelar</Button>
          <Button color="error" onClick={() => {
            void (async () => {
              if (!toDelete || !toDelete.id) {
                setConfirmOpen(false); setToDelete(null); return;
              }
              const id = String(toDelete.id);
              try {
                // Mark hidden=true locally. This is a browser-only flag; server is unchanged.
                try {
                  await updateSvgElement(id, { hidden: true });
                  try { notify({ message: `Elemento "${toDelete?.name}" marcado como eliminado`, severity: 'error' }); } catch { /* ignore */ }
                } catch (err) {
                  console.error('Failed to mark svg hidden', id, err);
                }
              } finally {
                try { window.dispatchEvent(new Event('svg-elements-updated')); } catch { /* ignore */ }
                setConfirmOpen(false); setToDelete(null);
              }
            })();
          }} startIcon={<span className="material-symbols-rounded">delete</span>}>Eliminar</Button>
        </DialogActions>
      </Dialog>
      <DialogActions>
        <FormControlLabel
          control={<Checkbox checked={svgLocal} onChange={(e) => setSvgLocal(e.target.checked)} />}
          label="No guardar en la nube"
        />
        <Button onClick={handleClearAll} color="error" startIcon={<span className="material-symbols-rounded">delete</span>}>Limpiar</Button>
        <Button onClick={onClose} color="warning" startIcon={<span className="material-symbols-rounded">close</span>}>Cancelar</Button>
        <Button
          onClick={() => {
            void (async () => {
              try {
                // call parent's save handler (may be sync or async)
                await Promise.resolve(onSaveSvgElement(svgLocal));
                // If save succeeded, clear the editor inputs and draft
                try { handleClearAll(); } catch { /* ignore */ }
              } catch (e) {
                console.error('Error saving SVG element', e);
              } finally {
                // notify others that svg elements changed so palettes can refresh
                try { window.dispatchEvent(new CustomEvent('svg-elements-updated')); } catch { /* ignore */ }
              }
            })();
          }}
          startIcon={<span className="material-symbols-rounded">save</span>}
          variant="contained"
        >Guardar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SvgEditorDialog;
