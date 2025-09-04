import SymbolNode from './SymbolNode';

// Define nodeTypes outside of any component to prevent recreation
export const nodeTypes = { symbolNode: SymbolNode };

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
