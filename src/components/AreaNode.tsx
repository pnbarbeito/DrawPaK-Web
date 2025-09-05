import React, { useEffect } from 'react';
import type { NodeProps, Node } from 'reactflow';
import { useReactFlow, useUpdateNodeInternals } from 'reactflow';
import { Rnd } from 'react-rnd';
import type { RndDragCallback, RndResizeCallback } from 'react-rnd';

type Data = {
  label?: string;
  width?: number;
  height?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  locked?: boolean;
};

const AreaNode: React.FC<NodeProps<Data>> = ({ id, data }) => {
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const width = data?.width ?? 300;
  const height = data?.height ?? 160;
  const fillColor = data?.fillColor ?? 'rgba(52,101,65,0.12)';
  const strokeColor = data?.strokeColor ?? '#365b33';
  const strokeWidth = data?.strokeWidth ?? 6;
  const locked = data?.locked ?? false;

  useEffect(() => {
    if (id && updateNodeInternals) {
      requestAnimationFrame(() => requestAnimationFrame(() => updateNodeInternals(id)));
    }
  }, [id, width, height, updateNodeInternals]);

  const onDragStop: RndDragCallback = (_e, d) => {
    // Update node position in React Flow store
    rf.setNodes((nds: Node<Data>[]) => nds.map((n) => n.id === id ? { ...n, position: { x: Math.round(d.x), y: Math.round(d.y) } } : n));
  };

  const onResizeStop: RndResizeCallback = (_e, _dir, ref) => {
    const w = Math.max(8, Math.round(ref.offsetWidth));
    const h = Math.max(8, Math.round(ref.offsetHeight));
    rf.setNodes((nds: Node<Data>[]) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, width: w, height: h } } : n));
  };

  return (
    <Rnd
      size={{ width, height }}
      position={{ x: (rf.getNode(id!)?.position?.x) ?? 0, y: (rf.getNode(id!)?.position?.y) ?? 0 }}
      onDragStop={onDragStop}
      onResizeStop={onResizeStop}
      enableResizing={!locked}
      disableDragging={locked}
      bounds="parent"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: fillColor,
          border: `${strokeWidth}px solid ${strokeColor}`,
          boxSizing: 'border-box',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto'
        }}
      >
        <div style={{ pointerEvents: 'none', userSelect: 'none', color: strokeColor, fontWeight: 600 }}>{data?.label ?? 'Área'}</div>
      </div>
    </Rnd>
  );
};

export default AreaNode;
