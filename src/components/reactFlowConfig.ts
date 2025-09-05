import SymbolNode from './SymbolNode';
import LabelNode from './LabelNode';
import AreaNode from './AreaNode';
import PolygonNode from './PolygonNode';

// Define nodeTypes outside of any component to prevent recreation
export const nodeTypes = { symbolNode: SymbolNode, labelNode: LabelNode, areaNode: AreaNode, polygonNode: PolygonNode };

// Define defaultEdgeOptions outside component to prevent recreation
export const defaultEdgeOptions = {
  type: 'smoothstep',
  style: {
    strokeWidth: 2,
    stroke: '#000000' // Color negro por defecto
  }
};

// Define snapGrid outside component to prevent recreation  
export const snapGrid: [number, number] = [20, 20]; // GRID_SIZE = 20
