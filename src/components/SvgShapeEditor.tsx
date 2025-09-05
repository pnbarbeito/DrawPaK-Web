import React, { useRef, useState, useEffect } from 'react';
import { Box, Button, TextField, Checkbox, FormControlLabel, Slider, Typography } from '@mui/material';
// Replaced MUI icons with material symbol spans
type Handle = { id: string; x: number; y: number; type?: 'source' | 'target' };
type BaseShape = {
  id: string;
  type: 'rect' | 'circle' | 'line' | 'semicircle';
  fill?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  rotation?: number; // degrees
  handles: Handle[];
};

type RectShape = BaseShape & { type: 'rect'; x: number; y: number; w: number; h: number };
type CircleShape = BaseShape & { type: 'circle'; x: number; y: number; r: number };
type SemiCircleShape = BaseShape & { type: 'semicircle'; x: number; y: number; r: number };
type LineShape = BaseShape & { type: 'line'; x1: number; y1: number; x2: number; y2: number };
type Shape = RectShape | CircleShape | SemiCircleShape | LineShape;

type Props = {
  width?: number;
  height?: number;
  onChange?: (result: { svg: string; handles: (Handle & { shapeId?: string })[] }) => void;
  displayScale?: number; // optional controlled scale from parent
  onDisplayScaleChange?: (n: number) => void;
};

// GRID is the snapping resolution inside the editor (px)
const GRID = 5;
// GRID_SIZE visual grid to match diagram GRID (px)
const GRID_SIZE = 20;

const defaultRect = (id: string): RectShape => ({ id, type: 'rect', x: 20, y: 20, w: 60, h: 40, fill: true, fillColor: 'rgba(255, 255, 255, 0)', fillOpacity: 0, strokeColor: '#000', strokeWidth: 2, rotation: 0, handles: [] });
const defaultCircle = (id: string): CircleShape => ({ id, type: 'circle', x: 60, y: 60, r: 30, fill: true, fillColor: 'rgba(255, 255, 255, 0)', fillOpacity: 0, strokeColor: '#000', strokeWidth: 2, rotation: 0, handles: [] });
const defaultSemi = (id: string): SemiCircleShape => ({ id, type: 'semicircle', x: 60, y: 60, r: 30, fill: false, fillColor: 'none', fillOpacity: 1, strokeColor: '#000', strokeWidth: 2, rotation: 0, handles: [] });
const defaultLine = (id: string): LineShape => ({ id, type: 'line', x1: 60, y1: 80, x2: 60, y2: 40, fill: false, fillColor: '#000000', fillOpacity: 1, strokeColor: '#000', strokeWidth: 2, rotation: 0, handles: [] });

const DISPLAY_SCALE = 3;
const STORAGE_KEY = 'svgShapeEditor.draft.v1';

const SvgShapeEditor: React.FC<Props> = ({ width = 120, height = 120, onChange, displayScale }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStartTime = useRef<number>(0);
  const justFinishedDrag = useRef<boolean>(false);
  const clipboardRef = useRef<Shape[] | null>(null);
  const windowListenersAttached = useRef<boolean>(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedHandleId, setSelectedHandleId] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(width);
  const [canvasHeight, setCanvasHeight] = useState<number>(height);
  const [displayScaleState, setDisplayScaleState] = useState<number>(DISPLAY_SCALE);
  // determine effective display scale: prefer controlled prop when provided
  const effectiveDisplayScale = typeof displayScale === 'number' ? displayScale : displayScaleState;
  // Note: parent may control displayScale via props; internal state is used when uncontrolled.
  // grid is always visible in the editor but must not be persisted with the exported SVG
  // Ref to keep an up-to-date dragState for global event handlers (avoid stale closures)
  const dragStateRef = useRef<null | {
    mode: 'move' | 'handle' | 'resize';
    shapeId: string;
    handleId?: string;
    corner?: 'nw' | 'ne' | 'se' | 'sw' | 'p1' | 'p2' | 'radius';
    offsetX?: number;
    offsetY?: number;
  }>(null);

  const updateDragState = (v: null | {
    mode: 'move' | 'handle' | 'resize';
    shapeId: string;
    handleId?: string;
    corner?: 'nw' | 'ne' | 'se' | 'sw' | 'p1' | 'p2' | 'radius';
    offsetX?: number;
    offsetY?: number;
  }) => {
    dragStateRef.current = v;
  };

  const snap = (v: number) => Math.round(v / GRID) * GRID;

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { shapes?: Shape[]; canvasWidth?: number; canvasHeight?: number; displayScale?: number };
        if (Array.isArray(parsed.shapes)) setShapes(parsed.shapes as Shape[]);
        if (typeof parsed.canvasWidth === 'number') setCanvasWidth(parsed.canvasWidth);
        if (typeof parsed.canvasHeight === 'number') setCanvasHeight(parsed.canvasHeight);
        // only initialize internal state when parent is not controlling displayScale
        if (typeof parsed.displayScale === 'number' && typeof displayScale !== 'number') setDisplayScaleState(parsed.displayScale);
      }
    } catch {
      // ignore parse errors
    }
  }, [displayScale]);

  // Save draft to localStorage (debounced)
  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      try {
        // persist displayScale only if internal (uncontrolled)
        const payload: { shapes: Shape[]; canvasWidth: number; canvasHeight: number; displayScale?: number } = { shapes, canvasWidth, canvasHeight };
        if (typeof displayScale !== 'number') payload.displayScale = displayScaleState;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
      saveTimerRef.current = null;
    }, 400);
    return () => { if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; } };
  }, [shapes, canvasWidth, canvasHeight, displayScale, displayScaleState]);

  useEffect(() => {
    if (!onChange) return;
    if (!svgRef.current) return;
    // Clone and normalize export so width/height are logical (not the visual scaled ones)
    try {
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      // Ensure logical coordinate system is present and strip physical size attributes
      clone.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      // Remove editor-only elements so exported SVG does not include UI artifacts
      try {
        const editorHandles = Array.from(clone.querySelectorAll('[data-editor-handle="true"]'));
        editorHandles.forEach(n => n.parentNode?.removeChild(n));
        const editorResizers = Array.from(clone.querySelectorAll('[data-editor-resize="true"]'));
        editorResizers.forEach(n => n.parentNode?.removeChild(n));
        // remove grid rects and patterns used only by the editor
        const editorGrids = Array.from(clone.querySelectorAll('[data-editor-grid="true"]'));
        editorGrids.forEach(n => n.parentNode?.removeChild(n));
        const patterns = Array.from(clone.querySelectorAll('pattern#editor-grid, pattern#editor-grid-strong'));
        patterns.forEach(n => n.parentNode?.removeChild(n));
      } catch {
        // ignore
      }
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(clone);
      const handles = shapes.flatMap(s => s.handles.map(h => ({ id: h.id, x: h.x, y: h.y, type: h.type })));
      onChange({ svg: svgStr, handles });
    } catch {
      const svgStr = svgRef.current.outerHTML;
      // fallback: try to remove editor handles from original DOM before serializing
      try {
        const cloned = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
        const root = cloned.documentElement;
        // ensure viewBox exists and remove width/height
        root.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
        root.removeAttribute('width');
        root.removeAttribute('height');
        const editorHandles = Array.from(cloned.querySelectorAll('[data-editor-handle="true"]'));
        editorHandles.forEach(n => n.parentNode?.removeChild(n));
        const editorResizers = Array.from(cloned.querySelectorAll('[data-editor-resize="true"]'));
        editorResizers.forEach(n => n.parentNode?.removeChild(n));
        const editorGrids = Array.from(cloned.querySelectorAll('[data-editor-grid="true"]'));
        editorGrids.forEach(n => n.parentNode?.removeChild(n));
        const patterns = Array.from(cloned.querySelectorAll('pattern#editor-grid, pattern#editor-grid-strong'));
        patterns.forEach(n => n.parentNode?.removeChild(n));
        const serializer = new XMLSerializer();
        const cleaned = serializer.serializeToString(root);
        const handles = shapes.flatMap(s => s.handles.map(h => ({ id: h.id, x: h.x, y: h.y, type: h.type })));
        onChange({ svg: cleaned, handles });
        return;
      } catch {
        const handles = shapes.flatMap(s => s.handles.map(h => ({ id: h.id, x: h.x, y: h.y, type: h.type })));
        onChange({ svg: svgStr, handles });
      }
    }
  }, [shapes, onChange, canvasWidth, canvasHeight]);

  const addRect = () => {
    const id = `shape_${Date.now()}`;
    setShapes(prev => [...prev, defaultRect(id)]);
    setSelected(id);
  };

  const addCircle = () => {
    const id = `shape_${Date.now()}`;
    setShapes(prev => [...prev, defaultCircle(id)]);
    setSelected(id);
  };
  const addSemi = () => {
    const id = `shape_${Date.now()}`;
    setShapes(prev => [...prev, defaultSemi(id)]);
    setSelected(id);
  };

  const addLine = () => {
    const id = `shape_${Date.now()}`;
    const ln = defaultLine(id);
    setShapes(prev => [...prev, ln]);
    setSelected(id);
  };

  const onMouseDownLineEndpoint = (e: React.MouseEvent, shape: LineShape, which: 'p1' | 'p2') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelected(shape.id);
    updateDragState({ mode: 'resize', shapeId: shape.id, corner: which });
    if (!windowListenersAttached.current) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      windowListenersAttached.current = true;
    }
  };

  const onMouseDownCircleResize = (e: React.MouseEvent, shape: CircleShape | SemiCircleShape) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelected(shape.id);
    updateDragState({ mode: 'resize', shapeId: shape.id, corner: 'radius' });
    if (!windowListenersAttached.current) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      windowListenersAttached.current = true;
    }
  };

  const deleteSelectedShape = () => {
    if (!selected) return;
    setShapes(prev => prev.filter(s => s.id !== selected));
    setSelected(null);
  };

  // Delete selected shape when user presses Delete or Backspace (but not when typing in inputs)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      try {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName?.toLowerCase() || '';
        const isEditable = active?.isContentEditable || ['input', 'textarea', 'select'].includes(tag);
        if (isEditable) return;
      } catch {
        // ignore
      }

      // Delete / Backspace -> remove selected shape
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          setShapes(prev => prev.filter(s => s.id !== selected));
          setSelected(null);
        }
        return;
      }

      // Copy (Ctrl/Cmd + C)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (selected) {
          e.preventDefault();
          const shape = shapes.find(s => s.id === selected);
          if (shape) {
            // deep clone shape and handles
            const cloneShape: Shape = JSON.parse(JSON.stringify(shape)) as Shape;
            clipboardRef.current = [cloneShape];

          }
        }
        return;
      }

      // Paste (Ctrl/Cmd + V)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        const cb = clipboardRef.current;
        if (!cb || cb.length === 0) return;
        e.preventDefault();
        // Paste all shapes in clipboard (usually single)
        setShapes(prev => {
          const newOnes: Shape[] = cb.map(orig => {
            const newid = `shape_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            // deep clone
            const s = JSON.parse(JSON.stringify(orig)) as Shape;
            // remap id
            s.id = newid;
            // offset position a bit so pasted item is visible
            if (s.type === 'rect') { s.x = (s.x || 0) + 10; s.y = (s.y || 0) + 10; }
            if (s.type === 'circle' || s.type === 'semicircle') { (s as CircleShape | SemiCircleShape).x = ((s as CircleShape | SemiCircleShape).x || 0) + 10; (s as CircleShape | SemiCircleShape).y = ((s as CircleShape | SemiCircleShape).y || 0) + 10; }
            if (s.type === 'line') { (s as LineShape).x1 = ((s as LineShape).x1 || 0) + 10; (s as LineShape).y1 = ((s as LineShape).y1 || 0) + 10; (s as LineShape).x2 = ((s as LineShape).x2 || 0) + 10; (s as LineShape).y2 = ((s as LineShape).y2 || 0) + 10; }
            // remap handles ids
            if (Array.isArray(s.handles)) {
              s.handles = s.handles.map((h: Handle) => ({ ...h, id: `h_${Date.now()}_${Math.floor(Math.random() * 10000)}` }));
            }
            return s as Shape;
          });
          // select the last pasted shape
          const last = newOnes[newOnes.length - 1];
          setTimeout(() => setSelected(last.id), 10);
          return [...prev, ...newOnes];
        });
        return;
      }

      // Arrow keys -> move selected element by 1 unit
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        try {
          const active = document.activeElement as HTMLElement | null;
          const tag = active?.tagName?.toLowerCase() || '';
          const isEditable = active?.isContentEditable || ['input', 'textarea', 'select'].includes(tag);
          if (isEditable) return; // don't move while editing inputs
        } catch {
          // ignore
        }
        e.preventDefault();
        const map: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        const [dx, dy] = map[e.key];
        if (!selected) return;
        setShapes(prev => prev.map(s => {
          if (s.id !== selected) return s;
          if (s.type === 'rect') {
            return { ...s, x: s.x + dx, y: s.y + dy, handles: s.handles.map(h => ({ ...h, x: h.x + dx, y: h.y + dy })) };
          }
          if (s.type === 'circle' || s.type === 'semicircle') {
            const cs = s as CircleShape | SemiCircleShape;
            return { ...s, x: cs.x + dx, y: cs.y + dy, handles: s.handles.map(h => ({ ...h, x: h.x + dx, y: h.y + dy })) } as typeof s;
          }
          if (s.type === 'line') {
            return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, handles: s.handles.map(h => ({ ...h, x: h.x + dx, y: h.y + dy })) };
          }
          return s;
        }));
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, shapes]);

  const addHandleToSelected = () => {
    if (!selected) return;
    setShapes(prev => prev.map(s => {
      if (s.id !== selected) return s;
      const hid = `h_${Date.now()}`;
      let hx = 0, hy = 0;
      if (s.type === 'rect') { hx = snap(s.x + s.w / 2); hy = snap(s.y + s.h / 2); }
      else if (s.type === 'circle' || s.type === 'semicircle') { hx = snap((s as CircleShape | SemiCircleShape).x); hy = snap((s as CircleShape | SemiCircleShape).y); }
      else if (s.type === 'line') { hx = snap((s.x1 + s.x2) / 2); hy = snap((s.y1 + s.y2) / 2); }
      return { ...s, handles: [...(s.handles || []), { id: hid, x: hx, y: hy, type: 'source' }] };
    }));
  };

  // mouse helpers
  const clientToSvgPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  };

  const onMouseDownShape = (e: React.MouseEvent, shape: Shape) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const svgP = clientToSvgPoint(e.clientX, e.clientY);
    if (!svgP) return;

    // Resetear bandera al iniciar nuevo drag
    justFinishedDrag.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartTime.current = Date.now();

    setSelected(shape.id);
    // offset for move
    if (shape.type === 'rect') updateDragState({ mode: 'move', shapeId: shape.id, offsetX: svgP.x - shape.x, offsetY: svgP.y - shape.y });
    else if (shape.type === 'circle' || shape.type === 'semicircle') updateDragState({ mode: 'move', shapeId: shape.id, offsetX: svgP.x - (shape as CircleShape | SemiCircleShape).x, offsetY: svgP.y - (shape as CircleShape | SemiCircleShape).y });
    else if (shape.type === 'line') {
      // For lines, we need a reference point. Let's use x1, y1 as the anchor for the offset.
      updateDragState({ mode: 'move', shapeId: shape.id, offsetX: svgP.x - shape.x1, offsetY: svgP.y - shape.y1 });
    }


    // attach global listeners so dragging keeps working even if pointer leaves the svg
    if (!windowListenersAttached.current) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      windowListenersAttached.current = true;
    }
  };

  const onMouseDownHandle = (e: React.MouseEvent, shapeId: string, handleId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    updateDragState({ mode: 'handle', shapeId, handleId });
    if (!windowListenersAttached.current) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      windowListenersAttached.current = true;
    }
  };

  const onMouseDownResizeCorner = (e: React.MouseEvent, shape: RectShape, corner: 'nw' | 'ne' | 'se' | 'sw') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelected(shape.id);

    updateDragState({ mode: 'resize', shapeId: shape.id, corner, offsetX: 0, offsetY: 0 });
    if (!windowListenersAttached.current) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      windowListenersAttached.current = true;
    }
  };

  // Global mouse handlers (used while dragging so we don't lose events when pointer leaves svg)
  const handleWindowMouseMove = (e: MouseEvent) => {
    const svgP = clientToSvgPoint(e.clientX, e.clientY);
    if (!svgP) return;

    // Marcar que hubo movimiento real para prevenir clicks que deseleccionen
    justFinishedDrag.current = true;


    setShapes(prev => prev.map(s => {
      const currentDrag = dragStateRef.current;
      if (s.id !== (currentDrag && currentDrag.shapeId)) return s;

      if (currentDrag?.mode === 'handle' && currentDrag.handleId) {
        return { ...s, handles: s.handles.map(h => h.id === currentDrag.handleId ? { ...h, x: snap(svgP.x), y: snap(svgP.y) } : h) };
      }

      if (currentDrag?.mode === 'move') {
        if (s.type === 'rect') {
          const newX = snap(svgP.x - (currentDrag.offsetX || 0));
          const newY = snap(svgP.y - (currentDrag.offsetY || 0));
          return { ...s, x: newX, y: newY } as RectShape;
        }
        if (s.type === 'circle' || s.type === 'semicircle') {
          const newX = snap(svgP.x - (currentDrag.offsetX || 0));
          const newY = snap(svgP.y - (currentDrag.offsetY || 0));
          return { ...s, x: newX, y: newY } as CircleShape;
        }
        if (s.type === 'line') {
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          const newX1 = snap(svgP.x - (currentDrag.offsetX || 0));
          const newY1 = snap(svgP.y - (currentDrag.offsetY || 0));
          return { ...s, x1: newX1, y1: newY1, x2: newX1 + dx, y2: newY1 + dy } as LineShape;
        }
      }

      if (currentDrag?.mode === 'resize' && s.type === 'rect') {
        const x1 = s.x;
        const y1 = s.y;
        const x2 = s.x + s.w;
        const y2 = s.y + s.h;
        let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
        if (currentDrag.corner === 'nw') { nx1 = snap(svgP.x); ny1 = snap(svgP.y); }
        if (currentDrag.corner === 'ne') { nx2 = snap(svgP.x); ny1 = snap(svgP.y); }
        if (currentDrag.corner === 'se') { nx2 = snap(svgP.x); ny2 = snap(svgP.y); }
        if (currentDrag.corner === 'sw') { nx1 = snap(svgP.x); ny2 = snap(svgP.y); }
        const nw = Math.max(8, nx2 - nx1);
        const nh = Math.max(8, ny2 - ny1);
        const nx = Math.min(nx1, nx2);
        const ny = Math.min(ny1, ny2);
        return { ...s, x: nx, y: ny, w: nw, h: nh } as RectShape;
      }
      // resize handling for circle radius
      if (currentDrag?.mode === 'resize' && (s.type === 'circle' || s.type === 'semicircle')) {
        const cs = s as CircleShape;
        if (currentDrag.corner === 'radius') {
          const dx = svgP.x - cs.x;
          const dy = svgP.y - cs.y;
          const nr = Math.max(4, snap(Math.sqrt(dx * dx + dy * dy)));
          return { ...cs, r: nr } as CircleShape;
        }
      }

      // resize handling for line endpoints p1/p2
      if (currentDrag?.mode === 'resize' && s.type === 'line') {
        const ls = s as LineShape;
        if (currentDrag.corner === 'p1') {
          const nx1 = snap(svgP.x);
          const ny1 = snap(svgP.y);
          const newHandles = ls.handles.map((h, idx) => idx === 0 ? { ...h, x: nx1, y: ny1 } : h);
          return { ...ls, x1: nx1, y1: ny1, handles: newHandles } as LineShape;
        }
        if (currentDrag.corner === 'p2') {
          const nx2 = snap(svgP.x);
          const ny2 = snap(svgP.y);
          const newHandles = ls.handles.map((h, idx) => idx === 1 ? { ...h, x: nx2, y: ny2 } : h);
          return { ...ls, x2: nx2, y2: ny2, handles: newHandles } as LineShape;
        }
      }
      // resize handling for circle radius
      if (currentDrag?.mode === 'resize' && (s.type === 'circle' || s.type === 'semicircle')) {
        const cs = s as CircleShape;
        if (currentDrag.corner === 'radius') {
          // compute new radius based on mouse distance to center
          const dx = svgP.x - cs.x;
          const dy = svgP.y - cs.y;
          const nr = Math.max(4, snap(Math.sqrt(dx * dx + dy * dy)));
          return { ...cs, r: nr } as CircleShape;
        }
      }

      // resize handling for line endpoints p1/p2
      if (currentDrag?.mode === 'resize' && s.type === 'line') {
        const ls = s as LineShape;
        if (currentDrag.corner === 'p1') {
          const nx1 = snap(svgP.x);
          const ny1 = snap(svgP.y);
          const newHandles = ls.handles.map((h, idx) => idx === 0 ? { ...h, x: nx1, y: ny1 } : h);
          return { ...ls, x1: nx1, y1: ny1, handles: newHandles } as LineShape;
        }
        if (currentDrag.corner === 'p2') {
          const nx2 = snap(svgP.x);
          const ny2 = snap(svgP.y);
          const newHandles = ls.handles.map((h, idx) => idx === 1 ? { ...h, x: nx2, y: ny2 } : h);
          return { ...ls, x2: nx2, y2: ny2, handles: newHandles } as LineShape;
        }
      }

      return s;
    }));
  };

  const handleWindowMouseUp = () => {
    // If drag already cleared, ignore this event (prevents double-up handling)
    if (!dragStateRef.current) return;
    const draggedShapeId = dragStateRef.current?.shapeId;
    updateDragState(null);
    dragStartPos.current = null;

    // cleanup global listeners
    if (windowListenersAttached.current) {
      try { window.removeEventListener('mousemove', handleWindowMouseMove); } catch { /* ignore */ }
      try { window.removeEventListener('mouseup', handleWindowMouseUp); } catch { /* ignore */ }
      windowListenersAttached.current = false;
    }

    // If we were dragging, ensure the item remains selected
    if (draggedShapeId && justFinishedDrag.current) {
      setSelected(draggedShapeId);
      setTimeout(() => { justFinishedDrag.current = false; }, 100);
    } else {
      justFinishedDrag.current = false;
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStateRef.current) return;
    const svgP = clientToSvgPoint(e.clientX, e.clientY);
    if (!svgP) return;

    // Marcar que hubo movimiento real para prevenir clicks que deseleccionen
    justFinishedDrag.current = true;


    setShapes(prev => prev.map(s => {
      const currentDrag = dragStateRef.current;
      if (s.id !== currentDrag?.shapeId) return s;
      if (currentDrag?.mode === 'handle' && currentDrag.handleId) {
        return { ...s, handles: s.handles.map(h => h.id === currentDrag.handleId ? { ...h, x: snap(svgP.x), y: snap(svgP.y) } : h) };
      }

      if (currentDrag?.mode === 'move') {
        if (s.type === 'rect') {
          const newX = snap(svgP.x - (currentDrag.offsetX || 0));
          const newY = snap(svgP.y - (currentDrag.offsetY || 0));
          return { ...s, x: newX, y: newY } as RectShape;
        }
        if (s.type === 'circle') {
          const newX = snap(svgP.x - (currentDrag.offsetX || 0));
          const newY = snap(svgP.y - (currentDrag.offsetY || 0));
          return { ...s, x: newX, y: newY } as CircleShape;
        }
        if (s.type === 'line') {
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          const newX1 = snap(svgP.x - (currentDrag.offsetX || 0));
          const newY1 = snap(svgP.y - (currentDrag.offsetY || 0));
          return { ...s, x1: newX1, y1: newY1, x2: newX1 + dx, y2: newY1 + dy } as LineShape;
        }
      }

      if (currentDrag?.mode === 'resize' && s.type === 'rect') {
        const x1 = s.x;
        const y1 = s.y;
        const x2 = s.x + s.w;
        const y2 = s.y + s.h;
        let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
        if (currentDrag.corner === 'nw') { nx1 = snap(svgP.x); ny1 = snap(svgP.y); }
        if (currentDrag.corner === 'ne') { nx2 = snap(svgP.x); ny1 = snap(svgP.y); }
        if (currentDrag.corner === 'se') { nx2 = snap(svgP.x); ny2 = snap(svgP.y); }
        if (currentDrag.corner === 'sw') { nx1 = snap(svgP.x); ny2 = snap(svgP.y); }
        const nw = Math.max(8, nx2 - nx1);
        const nh = Math.max(8, ny2 - ny1);
        const nx = Math.min(nx1, nx2);
        const ny = Math.min(ny1, ny2);
        return { ...s, x: nx, y: ny, w: nw, h: nh } as RectShape;
      }

      return s;
    }));
  };

  const onMouseUp = () => {
    const draggedShapeId = dragStateRef.current?.shapeId;
    updateDragState(null);
    dragStartPos.current = null;


    // cleanup global listeners immediately to avoid window handlers running after SVG up
    if (windowListenersAttached.current) {
      try { window.removeEventListener('mousemove', handleWindowMouseMove); } catch { /* ignore */ }
      try { window.removeEventListener('mouseup', handleWindowMouseUp); } catch { /* ignore */ }
      windowListenersAttached.current = false;
    }

    // Si estábamos arrastrando algo, asegurar que siga seleccionado
    if (draggedShapeId && justFinishedDrag.current) {
      // Forzar que el elemento siga seleccionado después del drag
      setSelected(draggedShapeId);
      setTimeout(() => { justFinishedDrag.current = false; }, 100);
    } else {
      justFinishedDrag.current = false;
    }
  };

  const toggleHandleType = (shapeId: string, handleId: string) => {
    setShapes(prev => prev.map(s => {
      if (s.id !== shapeId) return s;
      return { ...s, handles: s.handles.map(h => h.id === handleId ? { ...h, type: h.type === 'source' ? 'target' : 'source' } : h) };
    }));
  };

  const setHandleType = (shapeId: string, handleId: string, type: 'source' | 'target') => {
    setShapes(prev => prev.map(s => {
      if (s.id !== shapeId) return s;
      return { ...s, handles: s.handles.map(h => h.id === handleId ? { ...h, type } : h) };
    }));
  };

  const deleteHandle = (shapeId: string, handleId: string) => {
    setShapes(prev => prev.map(s => s.id === shapeId ? { ...s, handles: s.handles.filter(h => h.id !== handleId) } : s));
  };

  // Z-order helpers: lower index = back, higher index = front
  const bringToFront = (id: string) => {
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const item = prev[idx];
      const next = prev.slice(0, idx).concat(prev.slice(idx + 1));
      return [...next, item];
    });
    setTimeout(exportSvg, 50);
  };

  const sendToBack = (id: string) => {
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx <= 0) return prev;
      const item = prev[idx];
      const next = prev.slice(0, idx).concat(prev.slice(idx + 1));
      return [item, ...next];
    });
    setTimeout(exportSvg, 50);
  };

  const moveUp = (id: string) => {
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const copy = prev.slice();
      const tmp = copy[idx + 1];
      copy[idx + 1] = copy[idx];
      copy[idx] = tmp;
      return copy;
    });
    setTimeout(exportSvg, 50);
  };

  const moveDown = (id: string) => {
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx <= 0) return prev;
      const copy = prev.slice();
      const tmp = copy[idx - 1];
      copy[idx - 1] = copy[idx];
      copy[idx] = tmp;
      return copy;
    });
    setTimeout(exportSvg, 50);
  };

  const updateSelectedProp = (patch: Partial<Shape>) => {
    if (!selected) return;
    setShapes(prev => prev.map(s => {
      if (s.id !== selected) return s;
      // apply patch
      const updated = ({ ...s, ...patch }) as Shape;
      // If it's a line, and endpoints were changed, keep first two handles synced to endpoints
      if (s.type === 'line') {
        const ls = updated as LineShape;
        if (Array.isArray(s.handles) && s.handles.length >= 2) {
          const newHandles = s.handles.map((h, idx) => {
            if (idx === 0) return { ...h, x: ls.x1, y: ls.y1 };
            if (idx === 1) return { ...h, x: ls.x2, y: ls.y2 };
            return h;
          });
          (updated as LineShape | RectShape | CircleShape | SemiCircleShape | LineShape).handles = newHandles;
        }
      }
      return updated;
    }));
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    try {
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      const editorHandles = Array.from(clone.querySelectorAll('[data-editor-handle="true"]'));
      editorHandles.forEach(n => n.parentNode?.removeChild(n));
      const editorResizers = Array.from(clone.querySelectorAll('[data-editor-resize="true"]'));
      editorResizers.forEach(n => n.parentNode?.removeChild(n));
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(clone);
      const handles = shapes.flatMap(s => s.handles.map(h => ({ id: h.id, x: h.x, y: h.y, type: h.type })));
      if (onChange) onChange({ svg: svgStr, handles });
    } catch {
      const outer = svgRef.current.outerHTML;
      const handles = shapes.flatMap(s => s.handles.map(h => ({ id: h.id, x: h.x, y: h.y, type: h.type })));
      if (onChange) onChange({ svg: outer, handles });
    }
  };

  const selectedShape = shapes.find(s => s.id === selected) as Shape | undefined;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
        <Box>
          <Button variant="contained" startIcon={<span className="material-symbols-rounded">add_box</span>} onClick={addRect}>Rectángulo</Button>
        </Box>
        <Box>
          <Button variant="contained" startIcon={<span className="material-symbols-rounded">radio_button_unchecked</span>} onClick={addCircle}>Círculo</Button>
        </Box>
        <Box>
          <Button variant="contained" startIcon={<span className="material-symbols-rounded">line_curve</span>} onClick={addSemi}>Semicírculo</Button>
        </Box>
        <Box>
          <Button variant="contained" startIcon={<span className="material-symbols-rounded">horizontal_rule</span>} onClick={addLine}>Línea</Button>
        </Box>
        <Box>
          <Button variant="outlined" color="error" startIcon={<span className="material-symbols-rounded">delete</span>} onClick={deleteSelectedShape} disabled={!selected}>Borrar</Button>
        </Box>
        <Box>
          <Button variant="outlined" onClick={addHandleToSelected} startIcon={<span className="material-symbols-rounded">cable</span>} disabled={!selected}>Añadir handle</Button>
        </Box>
        {/* Z-order controls moved into the selected-shape properties panel */}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <TextField label="Ancho" type="number" size="small" value={canvasWidth} onChange={(e) => setCanvasWidth(Number(e.target.value) || 100)} sx={{ width: 100, mr: 1 }} />
          <TextField label="Alto" type="number" size="small" value={canvasHeight} onChange={(e) => setCanvasHeight(Number(e.target.value) || 100)} sx={{ width: 100 }} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ border: '1px solid #ddd', width: (canvasWidth) * effectiveDisplayScale, height: (canvasHeight) * effectiveDisplayScale, overflow: 'hidden' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            width={canvasWidth * effectiveDisplayScale}
            height={canvasHeight * effectiveDisplayScale}
            style={{ background: 'rgba(255, 255, 255, 0.0)' }}
            onMouseDown={(e) => {
              const target = e.target as EventTarget | null;
              if (target === svgRef.current) {
                setTimeout(() => {
                  setSelected(null);
                  updateDragState(null);
                }, 10);
              }
            }}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* grid pattern defs */}
            <defs>
              <pattern id="editor-grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#ddd" strokeWidth="0.5" />
              </pattern>
              <pattern id="editor-grid-strong" width={GRID_SIZE * 5} height={GRID_SIZE * 5} patternUnits="userSpaceOnUse">
                <rect width={GRID_SIZE * 5} height={GRID_SIZE * 5} fill="none" />
                <path d={`M ${GRID_SIZE * 5} 0 L 0 0 0 ${GRID_SIZE * 5}`} fill="none" stroke="#e6e6e6" strokeWidth="1" />
              </pattern>
            </defs>

            <rect data-editor-grid="true" x={0} y={0} width={canvasWidth} height={canvasHeight} fill="url(#editor-grid)" />
            {shapes.map(s => (
              <g key={s.id}>
                {s.type === 'rect' && (() => {
                  const rs = s as RectShape;
                  const cx = rs.x + rs.w / 2;
                  const cy = rs.y + rs.h / 2;
                  return (
                    <g transform={`rotate(${rs.rotation || 0}, ${cx}, ${cy})`}>
                      <rect
                        x={rs.x}
                        y={rs.y}
                        width={rs.w}
                        height={rs.h}
                        fill={rs.fill ? rs.fillColor : 'none'}
                        fillOpacity={typeof rs.fillOpacity === 'number' ? rs.fillOpacity : undefined}
                        stroke={rs.strokeColor}
                        strokeWidth={rs.strokeWidth}
                        onMouseDown={(e) => onMouseDownShape(e, rs)}
                      />
                      {selected === rs.id && (
                        <g>
                          <rect data-editor-resize="true" x={rs.x - 3} y={rs.y - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownResizeCorner(e, rs, 'nw')} />
                          <rect data-editor-resize="true" x={rs.x + rs.w - 3} y={rs.y - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownResizeCorner(e, rs, 'ne')} />
                          <rect data-editor-resize="true" x={rs.x + rs.w - 3} y={rs.y + rs.h - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownResizeCorner(e, rs, 'se')} />
                          <rect data-editor-resize="true" x={rs.x - 3} y={rs.y + rs.h - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownResizeCorner(e, rs, 'sw')} />
                        </g>
                      )}
                    </g>
                  );
                })()}

                {s.type === 'circle' && (() => {
                  const cs = s as CircleShape;
                  const cx = cs.x;
                  const cy = cs.y;
                  return (
                    <g transform={`rotate(${cs.rotation || 0}, ${cx}, ${cy})`}>
                      <circle
                        cx={cs.x}
                        cy={cs.y}
                        r={cs.r}
                        fill={cs.fill ? cs.fillColor : 'none'}
                        fillOpacity={typeof cs.fillOpacity === 'number' ? cs.fillOpacity : undefined}
                        stroke={cs.strokeColor}
                        strokeWidth={cs.strokeWidth}
                        onMouseDown={(e) => onMouseDownShape(e, cs)}
                      />
                      {selected === cs.id && (
                        <g>
                          {/* resize square on circle rightmost point */}
                          <rect data-editor-resize="true" x={cs.x + cs.r - 3} y={cs.y - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownCircleResize(e, cs)} />
                        </g>
                      )}
                    </g>
                  );
                })()}

                {s.type === 'semicircle' && (() => {
                  const ss = s as SemiCircleShape;
                  const cx = ss.x;
                  const cy = ss.y;
                  // semicircle drawn as an open arc from left to right (no closing line)
                  const d = `M ${ss.x - ss.r} ${ss.y} A ${ss.r} ${ss.r} 0 0 1 ${ss.x + ss.r} ${ss.y}`;
                  return (
                    <g transform={`rotate(${ss.rotation || 0}, ${cx}, ${cy})`}>
                      <path d={d} fill={'none'} stroke={ss.strokeColor} strokeWidth={ss.strokeWidth} strokeLinecap="butt" onMouseDown={(e) => onMouseDownShape(e, ss)} />
                      {selected === ss.id && (
                        <g>
                          {/* resize square on semicircle rightmost point */}
                          <rect data-editor-resize="true" x={ss.x + ss.r - 3} y={ss.y - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownCircleResize(e, ss)} />
                        </g>
                      )}
                    </g>
                  );
                })()}

                {s.type === 'line' && (() => {
                  const ls = s as LineShape;
                  const cx = (ls.x1 + ls.x2) / 2;
                  const cy = (ls.y1 + ls.y2) / 2;
                  return (
                    <g transform={`rotate(${ls.rotation || 0}, ${cx}, ${cy})`}>
                      <line
                        x1={ls.x1}
                        y1={ls.y1}
                        x2={ls.x2}
                        y2={ls.y2}
                        stroke={ls.strokeColor}
                        strokeWidth={ls.strokeWidth}
                        onMouseDown={(e) => onMouseDownShape(e, ls)}
                      />
                      {selected === ls.id && (
                        <g>
                          <rect data-editor-resize="true" x={ls.x1 - 3} y={ls.y1 - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownLineEndpoint(e, ls, 'p1')} />
                          <rect data-editor-resize="true" x={ls.x2 - 3} y={ls.y2 - 3} width={6} height={6} fill="#fff" stroke="#666" onMouseDown={(e) => onMouseDownLineEndpoint(e, ls, 'p2')} />
                        </g>
                      )}
                    </g>
                  );
                })()}

                {s.handles.map(h => (
                  <circle
                    key={h.id}
                    cx={h.x}
                    cy={h.y}
                    r={6}
                    fill={h.type === 'source' ? '#22c55e' : '#ef4444'}
                    stroke="#111"
                    data-editor-handle="true"
                    onMouseDown={(e) => onMouseDownHandle(e, s.id, h.id)}
                    onClick={(e) => { e.stopPropagation(); setSelectedHandleId(h.id); setSelected(s.id); }}
                    onDoubleClick={(e) => { e.stopPropagation(); toggleHandleType(s.id, h.id); setSelectedHandleId(h.id); setSelected(s.id); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteHandle(s.id, h.id); setSelectedHandleId(null); }}
                    style={{ cursor: 'grab' }}
                  />
                ))}
              </g>
            ))}
          </svg>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flex: '1 1 50%', minWidth: 260 }}>
          <Box sx={{ flex: '1 1 50%', minWidth: 220 }}>
            <Typography variant="subtitle1">Propiedades</Typography>
            {/* Scale control is provided by parent dialog; no slider here */}
            {/* grid always visible in editor (not persisted) */}
            {!selected && <Typography variant="body2" color="text.secondary">Selecciona una forma para editar sus propiedades</Typography>}
            {selected && selectedShape && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption">Tipo: {selectedShape.type}</Typography>
                {/* Fill toggle and color */}
                <FormControlLabel control={<Checkbox checked={!!selectedShape.fill} onChange={(e) => updateSelectedProp({ fill: e.target.checked })} />} label="Relleno" />
                <TextField type="color" label="Color de relleno" size="small" sx={{ width: 140 }} value={selectedShape.fillColor || '#000000'} onChange={(e) => updateSelectedProp({ fillColor: e.target.value })} />
                <Box>
                  <Typography variant="caption">Opacidad de relleno</Typography>
                  <Slider min={0} max={1} step={0.01} value={typeof selectedShape.fillOpacity === 'number' ? selectedShape.fillOpacity : 1} onChange={(_, v) => updateSelectedProp({ fillOpacity: Array.isArray(v) ? v[0] : v as number })} />
                </Box>
                <Box>
                  <TextField type="color" label="Color de trazo" size="small" sx={{ width: 140 }} value={selectedShape.strokeColor || '#000000'} onChange={(e) => updateSelectedProp({ strokeColor: e.target.value })} />
                </Box>
                <Box>
                  <Typography variant="caption">Ancho de trazo</Typography>
                  <Slider min={0} max={10} value={selectedShape.strokeWidth ?? 1} onChange={(_, v) => updateSelectedProp({ strokeWidth: Array.isArray(v) ? v[0] : v as number })} />
                </Box>
                <Box>
                  <TextField type="number" label="Rotación (°)" value={selectedShape.rotation ?? 0} onChange={(e) => updateSelectedProp({ rotation: Number(e.target.value) || 0 })} />
                </Box>
              </Box>
            )}
          </Box>
          <Box sx={{ flex: '1 1 50%', minWidth: 220 }}>
            {/* right properties column */}
            {(!selected || !selectedShape) && <Box sx={{ mt: 1 }} />}
            {selected && selectedShape && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Selected handle controls */}
                <Box>
                  <Typography variant="subtitle2">Handles</Typography>
                  {selectedShape.handles.length === 0 && <Typography variant="body2" color="text.secondary">No tiene handles</Typography>}
                  {selectedShape.handles.length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                      {selectedShape.handles.map(h => (
                        <Box key={h.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Button size="small" variant={selectedHandleId === h.id ? 'contained' : 'outlined'} onClick={() => { setSelectedHandleId(h.id); setSelected(selectedShape.id); }}>{h.id}</Button>
                          <Button size="small" onClick={() => toggleHandleType(selectedShape.id, h.id)} color={h?.type === 'source' ? 'success' : 'error'} variant="outlined">{(h?.type ?? '').toUpperCase()}</Button>
                          <Button size="small" color="error" onClick={() => deleteHandle(selectedShape.id, h.id)}>Eliminar</Button>
                        </Box>
                      ))}
                      {selectedHandleId && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption">Tipo del handle seleccionado</Typography>
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Button
                              variant={(() => {
                                const h = selectedShape.handles.find(x => x.id === selectedHandleId);
                                return h?.type === 'source' ? 'contained' : 'outlined';
                              })()}
                              color="success"
                              onClick={() => { const hid = selectedHandleId; if (!hid) return; setHandleType(selectedShape.id, hid, 'source'); }}
                            >SOURCE</Button>
                            <Button
                              variant={(() => {
                                const h = selectedShape.handles.find(x => x.id === selectedHandleId);
                                return h?.type === 'target' ? 'contained' : 'outlined';
                              })()}
                              color="error"
                              onClick={() => { const hid = selectedHandleId; if (!hid) return; setHandleType(selectedShape.id, hid, 'target'); }}
                            >TARGET</Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Position / size fields */}
                {selectedShape.type === 'rect' && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <TextField fullWidth label="X" type="number" size="small" value={(selectedShape as RectShape).x} onChange={(e) => updateSelectedProp({ x: Number(e.target.value) })} />
                      <TextField fullWidth label="Y" type="number" size="small" value={(selectedShape as RectShape).y} onChange={(e) => updateSelectedProp({ y: Number(e.target.value) })} />
                      <TextField fullWidth label="W" type="number" size="small" value={(selectedShape as RectShape).w} onChange={(e) => updateSelectedProp({ w: Number(e.target.value) })} />
                      <TextField fullWidth label="H" type="number" size="small" value={(selectedShape as RectShape).h} onChange={(e) => updateSelectedProp({ h: Number(e.target.value) })} />
                    </Box>
                  </>
                )}

                {selectedShape.type === 'circle' && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <TextField fullWidth label="CX" type="number" size="small" value={(selectedShape as CircleShape).x} onChange={(e) => updateSelectedProp({ x: Number(e.target.value) })} />
                      <TextField fullWidth label="CY" type="number" size="small" value={(selectedShape as CircleShape).y} onChange={(e) => updateSelectedProp({ y: Number(e.target.value) })} />
                      <TextField fullWidth sx={{ gridColumn: '1 / -1' }} label="R" type="number" size="small" value={(selectedShape as CircleShape).r} onChange={(e) => updateSelectedProp({ r: Number(e.target.value) })} />
                    </Box>
                  </>
                )}

                {selectedShape.type === 'semicircle' && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <TextField fullWidth label="CX" type="number" size="small" value={(selectedShape as SemiCircleShape).x} onChange={(e) => updateSelectedProp({ x: Number(e.target.value) })} />
                      <TextField fullWidth label="CY" type="number" size="small" value={(selectedShape as SemiCircleShape).y} onChange={(e) => updateSelectedProp({ y: Number(e.target.value) })} />
                      <TextField fullWidth sx={{ gridColumn: '1 / -1' }} label="R" type="number" size="small" value={(selectedShape as SemiCircleShape).r} onChange={(e) => updateSelectedProp({ r: Number(e.target.value) })} />
                    </Box>
                  </>
                )}

                {selectedShape.type === 'line' && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <TextField fullWidth label="X1" type="number" size="small" value={(selectedShape as LineShape).x1} onChange={(e) => updateSelectedProp({ x1: Number(e.target.value) })} />
                      <TextField fullWidth label="Y1" type="number" size="small" value={(selectedShape as LineShape).y1} onChange={(e) => updateSelectedProp({ y1: Number(e.target.value) })} />
                      <TextField fullWidth label="X2" type="number" size="small" value={(selectedShape as LineShape).x2} onChange={(e) => updateSelectedProp({ x2: Number(e.target.value) })} />
                      <TextField fullWidth label="Y2" type="number" size="small" value={(selectedShape as LineShape).y2} onChange={(e) => updateSelectedProp({ y2: Number(e.target.value) })} />
                    </Box>
                  </>
                )}

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
                  <Box sx={{ flexGrow: 1, display: 'flex', gap: 1, minWidth: 120 }}>
                    <Button fullWidth variant="outlined" onClick={() => selected && moveUp(selected)} disabled={!selected}>Subir</Button>
                    <Button fullWidth variant="outlined" onClick={() => selected && moveDown(selected)} disabled={!selected}>Bajar</Button>
                  </Box>
                  <Box sx={{ flexGrow: 1, display: 'flex', gap: 1, minWidth: 120 }}>

                    <Button fullWidth variant="outlined" onClick={() => selected && bringToFront(selected)} disabled={!selected}>Traer arriba</Button>
                    <Button fullWidth variant="outlined" onClick={() => selected && sendToBack(selected)} disabled={!selected}>Enviar abajo</Button>
                  </Box>
                  <Button fullWidth variant="contained" sx={{ ml: 'auto' }} onClick={exportSvg}>Aplicar</Button>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default SvgShapeEditor;
