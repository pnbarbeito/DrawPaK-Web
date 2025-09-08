import React from 'react';
import { Handle, Position } from 'reactflow';

export type PolygonPoint = { x: number; y: number };

type PolygonNodeProps = {
  id: string;
  data: {
    points: PolygonPoint[];
    strokeColor?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    fillColor?: string;
    fillOpacity?: number;
  };
  selected?: boolean;
};

const PolygonNode: React.FC<PolygonNodeProps> = ({ data, selected }) => {
  const {
    points = [],
    strokeColor = '#2196F3',
    strokeWidth = 2,
    strokeDasharray = '5,5',
    fillColor = '#2196F3',
    fillOpacity = 0.1
  } = data;

  // Si no hay puntos, no renderizar nada
  if (points.length === 0) {
    return null;
  }

  // Calcular bounding box para dimensiones del nodo
  const minX = Math.min(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxX = Math.max(...points.map(p => p.x));
  const maxY = Math.max(...points.map(p => p.y));

  // Use a consistent inner padding so node position and rendered points align
  const PADDING = 0;
  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;

  // Ajustar puntos relativos al nodo (compensando el padding)
  const relativePoints = points.map(p => ({
    x: p.x - minX + PADDING,
    y: p.y - minY + PADDING
  }));

  // Crear path SVG
  const pathData = relativePoints.length > 0
    ? `M ${relativePoints[0].x} ${relativePoints[0].y} ` +
    relativePoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') +
    (relativePoints.length > 2 ? ' Z' : '') // Cerrar polígono si hay más de 2 puntos
    : '';

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        pointerEvents: 'auto' // Allow the node container to receive pointer events so selection works correctly
      }}
    >
      <svg
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible'
        }}
      >
        {/* Área rellena del polígono */}
        {relativePoints.length > 2 && (
          <path
            d={pathData}
            fill={fillColor}
            fillOpacity={fillOpacity}
            stroke="none"
          />
        )}

        {/* Líneas del polígono */}
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Puntos de control cuando está seleccionado */}
        {selected && relativePoints.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={strokeColor}
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}
      </svg>

      {/* Handles invisibles para conexiones si es necesario */}
      <Handle
        type="source"
        position={Position.Top}
        style={{ opacity: 0 }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
    </div>
  );
};

export default PolygonNode;
