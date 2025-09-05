import React, { useEffect, useRef } from 'react';
import type { NodeProps, Node } from 'reactflow';
import { useReactFlow, useUpdateNodeInternals } from 'reactflow';
import { Rnd } from 'react-rnd';
import type { RndDragCallback, RndResizeCallback } from 'react-rnd';

type Point = { x: number; y: number };

type Data = {
  points?: Point[];
  width?: number;
  height?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  locked?: boolean;
  label?: string;
};

const clamp = (v: number, a = 0, b = 99999) => Math.max(a, Math.min(b, v));

const PolygonNode: React.FC<NodeProps<Data>> = ({ id, data }) => {
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const defaultW = data?.width ?? 360;
  const defaultH = data?.height ?? 160;
  const widthRef = useRef<number>(defaultW);
  const heightRef = useRef<number>(defaultH);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (id && updateNodeInternals) {
      requestAnimationFrame(() => requestAnimationFrame(() => updateNodeInternals(id)));
    }
  }, [id, updateNodeInternals, data?.points]);

  // Helpers to update node data
  const updatePoints = React.useCallback((newPoints: Point[], newW?: number, newH?: number) => {
    rf.setNodes((nds: Node<Data>[]) => nds.map((n) => {
      if (n.id !== id) return n;
      return { ...n, data: { ...n.data, points: newPoints, width: newW ?? n.data?.width ?? widthRef.current, height: newH ?? n.data?.height ?? heightRef.current } } as Node<Data>;
    }));
  }, [rf, id]);

  // Pointer drag for handles
  const draggingRef = useRef<{ idx: number; pointerId: number } | null>(null);
  useEffect(() => {
    const onPointerMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const idx = draggingRef.current.idx;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clamp(Math.round(ev.clientX - rect.left), 0, Math.max(0, rect.width));
      const y = clamp(Math.round(ev.clientY - rect.top), 0, Math.max(0, rect.height));
      const curPoints = (data?.points || []).map(p => ({ x: p.x, y: p.y }));
      if (idx < 0 || idx >= curPoints.length) return;
      curPoints[idx] = { x, y };
      updatePoints(curPoints);
    };

  const onPointerUp = () => {
      if (!draggingRef.current) return;
      try { const el = document.getElementById(`poly-handle-${id}-${draggingRef.current.idx}`) as HTMLElement | null; if (el) el.releasePointerCapture(draggingRef.current.pointerId); } catch (e) { void e; }
      draggingRef.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    // attach when pointerdown sets draggingRef
  if (draggingRef.current) {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [data?.points, id, updatePoints]);

  const startHandleDrag = (e: React.PointerEvent, idx: number) => {
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch (err) { void err; }
    draggingRef.current = { idx, pointerId: e.pointerId };
    // pointermove/up listeners are installed by the effect which observes draggingRef
  };

  const onDragStop: RndDragCallback = (_e, d) => {
    // update node position
    rf.setNodes((nds: Node<Data>[]) => nds.map((n) => n.id === id ? { ...n, position: { x: Math.round(d.x), y: Math.round(d.y) } } : n));
  };

  const onResizeStop: RndResizeCallback = (_e, _dir, ref) => {
    const w = Math.max(8, Math.round(ref.offsetWidth));
    const h = Math.max(8, Math.round(ref.offsetHeight));
    const prevW = widthRef.current || w;
    const prevH = heightRef.current || h;
    const sx = prevW > 0 ? w / prevW : 1;
    const sy = prevH > 0 ? h / prevH : 1;
    widthRef.current = w;
    heightRef.current = h;
    const curPoints = (data?.points || []).map(p => ({ x: Math.round(p.x * sx), y: Math.round(p.y * sy) }));
    updatePoints(curPoints, w, h);
  };

  const points = data?.points ?? [];
  const w = data?.width ?? widthRef.current;
  const h = data?.height ?? heightRef.current;
  const fillColor = data?.fillColor ?? 'rgba(52,101,65,0.12)';
  const strokeColor = data?.strokeColor ?? '#365b33';
  const strokeWidth = data?.strokeWidth ?? 6;
  const locked = data?.locked ?? false;

  // Create points string for SVG
  const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Rnd
      size={{ width: w, height: h }}
      position={{ x: (rf.getNode(id!)?.position?.x) ?? 0, y: (rf.getNode(id!)?.position?.y) ?? 0 }}
      onDragStop={onDragStop}
      onResizeStop={onResizeStop}
      enableResizing={!locked}
      disableDragging={locked}
      bounds="parent"
      style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', pointerEvents: 'auto' }}
    >
      <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative', pointerEvents: 'auto' }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', pointerEvents: 'all' }}>
          <polygon points={pointsStr} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </svg>

        {/* vertex handles */}
        {points.map((p, idx) => (
          <div
            key={`h-${idx}`}
            id={`poly-handle-${id}-${idx}`}
            onPointerDown={(e) => startHandleDrag(e, idx)}
            style={{
              position: 'absolute',
              left: p.x - 6,
              top: p.y - 6,
              width: 12,
              height: 12,
              borderRadius: 8,
              background: '#ffffff',
              border: '2px solid #365b33',
              boxSizing: 'border-box',
              cursor: 'grab',
              zIndex: 4000,
              transform: 'translate(0,0)'
            }}
          />
        ))}
      </div>
    </Rnd>
  );
};

export default PolygonNode;
