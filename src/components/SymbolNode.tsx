import React, { useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';

type SymbolNodeProps = {
  id: string;
  data: {
    symbolKey: string;
    rotation?: number;
    scale?: number;
    flipX?: boolean;
    flipY?: boolean;
    invertHandles?: boolean;
    isDynamicSvg?: boolean;
    svg?: string;
    handles?: string;
  };
  selected?: boolean;
};

const SymbolNode: React.FC<SymbolNodeProps> = ({ id, data, selected }) => {
  const { symbolKey, isDynamicSvg, svg: dynamicSvg, handles: dynamicHandles } = data;

  // Estado local para preservar los datos del SVG
  const [preservedSvgData, setPreservedSvgData] = React.useState<{ svg?: string, handles?: string } | null>(null);

  // Cuando recibimos datos válidos por primera vez, los preservamos
  React.useEffect(() => {
    if (isDynamicSvg && dynamicSvg && dynamicHandles && !preservedSvgData) {
      setPreservedSvgData({ svg: dynamicSvg, handles: dynamicHandles });
  // preserved initial svg data for dynamic nodes
    }
  }, [isDynamicSvg, dynamicSvg, dynamicHandles, preservedSvgData, id]);

  // Usar datos preservados como respaldo
  const effectiveSvg = dynamicSvg || preservedSvgData?.svg;
  const effectiveHandles = dynamicHandles || preservedSvgData?.handles;

  // Detailed debug logging removed for production. Keep runtime errors above.
  let size = { w: 48, h: 48 };
  let inlineSvgMarkup: string | undefined;

  if (isDynamicSvg && effectiveSvg) {
    // Elemento SVG dinámico de la base de datos (usando datos efectivos)
    inlineSvgMarkup = effectiveSvg;

    // Extraer tamaño del viewBox del SVG
    const viewBoxMatch = effectiveSvg.match(/viewBox="([^"]+)"/);
    if (viewBoxMatch) {
      const viewBoxValues = viewBoxMatch[1].split(' ').map(Number);
      if (viewBoxValues.length === 4) {
        size = { w: viewBoxValues[2], h: viewBoxValues[3] };
      }
    }
  } else {
    // PROBLEMA: Se esperaba SVG dinámico pero no está presente
    console.error(`❌ PROBLEMA ENCONTRADO - Node ${id}: isDynamicSvg=true pero no hay svg en data ni preservado`, {
      dataKeys: Object.keys(data),
      hasPreservedData: !!preservedSvgData,
      fullData: data
    });
  } 

  const inlineWrapperRef = useRef<HTMLDivElement | null>(null);

  // Usar React.memo para memorizar el SVG y evitar pérdida de datos
  const renderedSymbol = React.useMemo(() => {
    // Removed development useMemo debug logs
    if (inlineSvgMarkup) {
      return (
        <div
          key={`svg-${id}`}
          ref={inlineWrapperRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          dangerouslySetInnerHTML={{ __html: inlineSvgMarkup }}
        />
      );
    }

    return (
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#f0f0f0',
        border: '2px dashed #ccc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        color: '#666'
      }}>
        {symbolKey || 'ERROR'}
      </div>
    );
  }, [inlineSvgMarkup, symbolKey, id]);

  // Normalize inline SVG so it fits the container: ensure viewBox exists (if possible), remove fixed width/height, and force CSS width/height 100%
  useEffect(() => {
    if (!inlineWrapperRef.current) return;
    const svgEl = inlineWrapperRef.current.querySelector('svg');
    if (!svgEl) return;
    const backgroundColor = (data as unknown as { backgroundColor?: string }).backgroundColor;
    const primaryColor = (data as unknown as { primaryColor?: string }).primaryColor;

    try {
      // If no viewBox but width/height attributes exist, set viewBox from them
      const hasViewBox = !!svgEl.getAttribute('viewBox');
      const attrW = svgEl.getAttribute('width');
      const attrH = svgEl.getAttribute('height');
      if (!hasViewBox && attrW && attrH) {
        const parsedW = parseFloat(attrW);
        const parsedH = parseFloat(attrH);
        if (!isNaN(parsedW) && !isNaN(parsedH) && parsedW > 0 && parsedH > 0) {
          svgEl.setAttribute('viewBox', `0 0 ${parsedW} ${parsedH}`);
        }
      }

      // Set explicit width/height attributes to match the wrapper so the SVG keeps stable intrinsic size
      svgEl.setAttribute('width', String(size.w));
      svgEl.setAttribute('height', String(size.h));

      // Apply color customizations if provided
      if (primaryColor) {
        try {
          svgEl.querySelectorAll('[stroke]').forEach((n) => { (n).setAttribute('stroke', primaryColor); });
          svgEl.querySelectorAll('[fill]').forEach((n) => { (n).setAttribute('fill', (n).getAttribute('fill') === 'none' ? 'none' : primaryColor); });
        } catch { /* ignore */ }
      }

      if (backgroundColor) {
        svgEl.style.background = backgroundColor;
      }

      // Ensure it visually fills the wrapper
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.display = 'block';
      if (!svgEl.getAttribute('preserveAspectRatio')) svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    } catch {
      // swallow DOM errors
    }
  }, [inlineSvgMarkup, size.w, size.h, data]);
  const rotation = data.rotation ?? 0;
  const scale = data.scale ?? 1;
  const flipX = data.flipX ?? false;
  const flipY = data.flipY ?? false;
  const invertHandles = data.invertHandles ?? false;

  // Ensure React Flow recalculates handle positions when rotation/scale changes
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (!id || !updateNodeInternals) return;
    // schedule update after two frames so DOM transforms and layout have applied
    requestAnimationFrame(() => requestAnimationFrame(() => updateNodeInternals(id)));
  }, [id, rotation, scale, flipX, flipY, updateNodeInternals]);

  // Define connection points per symbol type
  // now supports an optional `offset` (px number or percentage string) to precisely position multiple handles on the same side
  const handles: { id: string; position: Position; type: 'source' | 'target'; offset?: number | string; absoluteX?: number; absoluteY?: number }[] = [];

  // Si tenemos un elemento SVG dinámico con handles guardados, usarlos
  if (isDynamicSvg && effectiveHandles) {
    try {
      const parsed = JSON.parse(effectiveHandles || '[]');
      const parsedHandles: unknown[] = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object')
          ? Object.values(parsed)
          : [];

      type SerializedHandle = {
        id?: string;
        x?: number | string;
        y?: number | string;
        type?: 'source' | 'target';
      };

      parsedHandles.forEach((raw) => {
        const handle = raw as SerializedHandle;
        const x = Number(handle.x ?? 0) || 0;
        const y = Number(handle.y ?? 0) || 0;
        // clamp inside viewBox bounds
        const cx = Math.max(0, Math.min(x, size.w));
        const cy = Math.max(0, Math.min(y, size.h));

        // Determine nearest edge so React Flow can pick the correct side for anchoring
        const distLeft = cx;
        const distRight = Math.abs(size.w - cx);
        const distTop = cy;
        const distBottom = Math.abs(size.h - cy);
        let nearest: Position = Position.Left;
        let minDist = distLeft;
        if (distRight < minDist) { minDist = distRight; nearest = Position.Right; }
        if (distTop < minDist) { minDist = distTop; nearest = Position.Top; }
        if (distBottom < minDist) { minDist = distBottom; nearest = Position.Bottom; }

        // Store absolute coordinates on the handle object so the renderer can place it exactly
        handles.push({
          id: handle.id ?? `h_${Math.floor(cx)}_${Math.floor(cy)}`,
          position: nearest,
          type: handle.type ?? 'source',
          offset: undefined,
          absoluteX: cx,
          absoluteY: cy,
        });
      });
    } catch (e) {
      console.warn('Error parsing dynamic handles:', e);
    }
  } else {
    // Usar handles estáticos para símbolos del catálogo existente
    switch (symbolKey) {
      case 'bus':
        handles.push({ id: 'left', position: Position.Left, type: 'source' });
        handles.push({ id: 'right', position: Position.Right, type: 'source' });
        break;
      case 'trafo':
        handles.push({ id: 'top', position: Position.Top, type: 'source' });
        handles.push({ id: 'bottom', position: Position.Bottom, type: 'target' });
        break;
      case 'trafo_2':
        handles.push({ id: 'top', position: Position.Top, type: 'source' });
        handles.push({ id: 'left', position: Position.Left, type: 'target' });
        handles.push({ id: 'right', position: Position.Right, type: 'target' });
        break;
      case 'interruptor':
        handles.push({ id: 'left', position: Position.Left, type: 'source' });
        handles.push({ id: 'right', position: Position.Right, type: 'target' });
        break;
      case 'barras':
        handles.push({ id: 'r_top', position: Position.Right, type: 'target', offset: '20%' });
        handles.push({ id: 'r_bottom', position: Position.Right, type: 'target', offset: '80%' });
        handles.push({ id: 't_left', position: Position.Top, type: 'source', offset: '20%' });
        handles.push({ id: 't_right', position: Position.Top, type: 'source', offset: '40%' });
        handles.push({ id: 'b_left', position: Position.Bottom, type: 'target', offset: '20%' });
        handles.push({ id: 'b_right', position: Position.Bottom, type: 'target', offset: '40%' });
        break;
      case 'disconnector':
        handles.push({ id: 'left', position: Position.Left, type: 'source' });
        handles.push({ id: 'right', position: Position.Right, type: 'source' });
        break;
      case 'tierra':
        handles.push({ id: 'top', position: Position.Top, type: 'source' });
        break;
    }
  }

  // Grid alignment constant (should match App.tsx GRID_SIZE)
  const GRID_SIZE = 1;

  // Helper function to snap to grid
  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  // Helper function to rotate a point around the center
  const rotatePoint = (x: number, y: number, centerX: number, centerY: number, angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = x - centerX;
    const dy = y - centerY;
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  };

  // Helper function to rotate handle direction
  const rotateHandlePosition = (originalPosition: Position, angleDeg: number): Position => {
    const normalizedAngle = ((angleDeg % 360) + 360) % 360;

    switch (originalPosition) {
      case Position.Top:
        if (normalizedAngle === 90) return Position.Right;
        if (normalizedAngle === 180) return Position.Bottom;
        if (normalizedAngle === 270) return Position.Left;
        return Position.Top;
      case Position.Right:
        if (normalizedAngle === 90) return Position.Bottom;
        if (normalizedAngle === 180) return Position.Left;
        if (normalizedAngle === 270) return Position.Top;
        return Position.Right;
      case Position.Bottom:
        if (normalizedAngle === 90) return Position.Left;
        if (normalizedAngle === 180) return Position.Top;
        if (normalizedAngle === 270) return Position.Right;
        return Position.Bottom;
      case Position.Left:
        if (normalizedAngle === 90) return Position.Top;
        if (normalizedAngle === 180) return Position.Right;
        if (normalizedAngle === 270) return Position.Bottom;
        return Position.Left;
      default:
        return originalPosition;
    }
  };

  // Helper function to apply flip transformations to handle direction
  const applyFlipToPosition = (position: Position, flipX: boolean, flipY: boolean): Position => {
    let result = position;

    // Apply flipX (horizontal flip)
    if (flipX) {
      switch (result) {
        case Position.Left:
          result = Position.Right;
          break;
        case Position.Right:
          result = Position.Left;
          break;
        // Top and Bottom remain the same for horizontal flip
      }
    }

    // Apply flipY (vertical flip)
    if (flipY) {
      switch (result) {
        case Position.Top:
          result = Position.Bottom;
          break;
        case Position.Bottom:
          result = Position.Top;
          break;
        // Left and Right remain the same for vertical flip
      }
    }

    return result;
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        // Keep the container size fixed to original size (px values)
        width: size.w,
        height: size.h,
        transformOrigin: 'center center',
        padding: 0,
      }}
    >
      {handles.map((h) => {
        // Invertir el tipo de handle si invertHandles está activo
        const handleType = invertHandles ? (h.type === 'source' ? 'target' : 'source') : h.type;

        const HANDLE_SIZE = 8;
        const HANDLE_GAP = 0; // gap between node edge and handle
        const baseStyle: React.CSSProperties = {
          position: 'absolute',
          background: handleType === 'source' ? '#22c55e' : '#ef4444', // verde para source, rojo para target
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          borderRadius: HANDLE_SIZE / 2,
          borderColor: '#111111',
          zIndex: 10,
        };

        const posStyle: React.CSSProperties = {};

        // If the dynamic handle provides absolute coordinates (SVG coordinates), use them directly.
        // Otherwise, fall back to previous edge-offset logic using h.offset.
        // If the handle has absolute coordinates attached, read them safely
        const maybeAbsoluteX = (h as unknown as Record<string, unknown>).absoluteX;
        const maybeAbsoluteY = (h as unknown as Record<string, unknown>).absoluteY;
        if (typeof maybeAbsoluteX === 'number' && typeof maybeAbsoluteY === 'number') {
          // Convert SVG coordinates into wrapper pixel coordinates (1:1 because we set svg width/height to size.w/size.h earlier)
          let fx = maybeAbsoluteX;
          let fy = maybeAbsoluteY;

          // Apply flips first
          if (flipX) fx = size.w - fx;
          if (flipY) fy = size.h - fy;

          // Apply rotation around center
          if (rotation !== 0) {
            const rotated = rotatePoint(fx, fy, size.w / 2, size.h / 2, rotation);
            fx = rotated.x;
            fy = rotated.y;
          }

          // Apply scale around center so handles follow the visual transform
          if (scale && scale !== 1) {
            const cx = size.w / 2;
            const cy = size.h / 2;
            fx = cx + (fx - cx) * scale;
            fy = cy + (fy - cy) * scale;
          }

          // Snap to grid if desired
          fx = snapToGrid(fx);
          fy = snapToGrid(fy);

          posStyle.left = `${fx}px`;
          posStyle.top = `${fy}px`;
          posStyle.transform = 'translate(-50%, -50%)';
        } else {
          // fallback: place at edge using previous offset behavior
          const centerX = size.w / 2;
          const centerY = size.h / 2;
          const outerOffsetPx = 0 * HANDLE_SIZE + HANDLE_GAP;
          // Original position coordinates (before rotation) - align to grid
          let originalX: number, originalY: number;

          if (h.position === Position.Right) {
            originalX = snapToGrid(size.w + HANDLE_GAP);
            originalY = h.offset ?
              (typeof h.offset === 'number' ? snapToGrid(h.offset) : snapToGrid((parseFloat(h.offset) / 100) * size.h)) :
              snapToGrid(size.h / 2);
          } else if (h.position === Position.Left) {
            originalX = snapToGrid(-outerOffsetPx);
            originalY = h.offset ?
              (typeof h.offset === 'number' ? snapToGrid(h.offset) : snapToGrid((parseFloat(h.offset) / 100) * size.h)) :
              snapToGrid(size.h / 2);
          } else if (h.position === Position.Top) {
            originalX = h.offset ?
              (typeof h.offset === 'number' ? snapToGrid(h.offset) : snapToGrid((parseFloat(h.offset) / 100) * size.w)) :
              snapToGrid(size.w / 2);
            originalY = snapToGrid(-outerOffsetPx);
          } else { // Position.Bottom
            originalX = h.offset ?
              (typeof h.offset === 'number' ? snapToGrid(h.offset) : snapToGrid((parseFloat(h.offset) / 100) * size.w)) :
              snapToGrid(size.w / 2);
            originalY = snapToGrid(size.h + HANDLE_GAP);
          }

          let finalX = originalX;
          let finalY = originalY;

          // Apply flips first
          if (flipX) {
            finalX = size.w - finalX;
          }
          if (flipY) {
            finalY = size.h - finalY;
          }

          // Apply rotation after flips
          if (rotation !== 0) {
            const rotated = rotatePoint(finalX, finalY, centerX, centerY, rotation);
            finalX = rotated.x;
            finalY = rotated.y;
          }

          // Apply scale around center so handles follow the visual transform
          if (scale && scale !== 1) {
            finalX = centerX + (finalX - centerX) * scale;
            finalY = centerY + (finalY - centerY) * scale;
          }

          // Snap final positions to grid for better alignment
          finalX = snapToGrid(finalX);
          finalY = snapToGrid(finalY);

          posStyle.left = `${finalX}px`;
          posStyle.top = `${finalY}px`;
          posStyle.transform = 'translate(-50%, -50%)';
        }

        // Calculate handle position with all transformations applied in the same order as CSS
        // Order: original -> flip -> rotate (to match CSS: rotate(angle) scaleX() scaleY())
        let transformedPosition = h.position;

        // Apply flips first
        transformedPosition = applyFlipToPosition(transformedPosition, flipX, flipY);

        // Then apply rotation
        if (rotation !== 0) {
          transformedPosition = rotateHandlePosition(transformedPosition, rotation);
        }

        return (
          <Handle
            key={h.id}
            id={h.id}
            type={handleType}
            position={transformedPosition}
            style={{ ...baseStyle, ...posStyle }}
          />
        );
      })}

      <div
        style={{
          width: size.w,
          height: size.h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // apply rotation, scale and flip to the inner symbol so the visual rotates/scales but handles remain in wrapper coordinates
          transform: `rotate(${rotation}deg) scale(${scale}) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`,
          transformOrigin: 'center center',
          // Add dotted border when selected (now it rotates with the symbol)
          border: selected ? '1px dashed rgba(33,150,243,0.8)' : 'none',
          borderRadius: selected ? '4px' : '0',
          boxSizing: 'border-box',
        }}
      >
        {renderedSymbol}
      </div>
    </div>
  );
};

export default React.memo(SymbolNode);
