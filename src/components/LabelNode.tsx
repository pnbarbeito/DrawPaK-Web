import React, { useState, useEffect, useRef } from 'react';
import { useUpdateNodeInternals, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';

type Data = {
  label?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  rotation?: number;
  scale?: number;
  flipX?: boolean;
  flipY?: boolean;
};

const LabelNode: React.FC<NodeProps<Data>> = ({ id, data, selected }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(data?.label ?? 'Etiqueta');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const { setNodes } = useReactFlow();

  useEffect(() => {
    setText(data?.label ?? 'Etiqueta');
  }, [data?.label]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const fontSize = data?.fontSize ?? 14;
  const color = data?.color ?? '#000000';
  const backgroundColor = data?.backgroundColor ?? 'rgba(255, 255, 255, 0)';
  const borderColor = data?.borderColor ?? '#000000';
  const borderWidth = data?.borderWidth ?? 0;
  const rotation = data?.rotation ?? 0;
  const scale = data?.scale ?? 1;
  const flipX = data?.flipX ?? false;
  const flipY = data?.flipY ?? false;

  useEffect(() => {
    // Request React Flow to recalculate node internals (handles/positions) when transforms change
    if (id && updateNodeInternals) {
      // schedule after paint so DOM transforms have applied
      requestAnimationFrame(() => requestAnimationFrame(() => updateNodeInternals(id)));
    }
  }, [id, rotation, scale, flipX, flipY, updateNodeInternals]);

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 8px',
        cursor: 'text',
        userSelect: 'none',
        border: borderColor ? `${borderWidth}px solid ${borderColor}` : (selected ? '1px dashed rgba(0,0,0,0.4)' : 'none'),
        borderRadius: 4,
        background: backgroundColor,
        transform: `rotate(${rotation}deg) scale(${scale}) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`,
        transformOrigin: 'center center',
      }}
    >
      {editing ? (
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              // Persist the edited label into the node data so it survives save/refresh
              setEditing(false);
              try {
                setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, label: text } } : n));
              } catch {
                // If setNodes is not available for some reason, silently ignore
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={{ fontSize, color, border: '1px solid #ccc', padding: '2px 6px', borderRadius: 4 }}
          />
      ) : (
        <div style={{ fontSize, color }}>{text}</div>
      )}
    </div>
  );
};

export default LabelNode;
