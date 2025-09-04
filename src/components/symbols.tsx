/* eslint-disable react-refresh/only-export-components */
import React from 'react';

export type SymbolEntry = {
  svg: React.ReactNode;
  size?: { w: number; h: number };
};

export type SymbolCategory = {
  name: string;
  icon: React.ReactNode; // Elemento que se muestra como portada de la categoría
  symbols: Record<string, SymbolEntry>;
};

export const SYMBOL_CATEGORIES: Record<string, SymbolCategory> = {
  transformadores: {
    name: 'Transformadores',
    icon: (
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="40" r="25" stroke="#000" strokeWidth="2" fill="none" />
        <circle cx="60" cy="80" r="25" stroke="#000" strokeWidth="2" fill="none" />
        <path d="M60 0 L60 15" stroke="#000" strokeWidth="2" />
        <path d="M60 120 L60 105" stroke="#000" strokeWidth="2" />
      </svg>
    ),
    symbols: {
      trafo: {
        svg: (
          <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="40" r="25" stroke="#000" strokeWidth="2" fill="none" />
            <circle cx="60" cy="80" r="25" stroke="#000" strokeWidth="2" fill="none" />
            <path d="M60 0 L60 15" stroke="#000" strokeWidth="2" />
            <path d="M60 120 L60 105" stroke="#000" strokeWidth="2" />
          </svg>
        ),
        size: { w: 120, h: 120 },
      },
      trafo_2: {
        svg: (
          <svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="40" r="25" stroke="#000" strokeWidth="2" fill="none" />
            <circle cx="40" cy="80" r="25" stroke="#000" strokeWidth="2" fill="none" />
            <circle cx="80" cy="80" r="25" stroke="#000" strokeWidth="2" fill="none" />
            <path d="M60 0 L60 15" stroke="#000" strokeWidth="2" />
            <path d="M0 80 L15 80" stroke="#000" strokeWidth="2" />
            <path d="M105 80 L120 80" stroke="#000" strokeWidth="2" />
          </svg>
        ),
        size: { w: 120, h: 160 },
      },
    }
  },

  proteccion: {
    name: 'Protección',
    icon: (
      <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="80" height="40" stroke="#000" strokeWidth="2" fill="none" />
        <path d="M0 40 L30 40" stroke="#000" strokeWidth="2" />
        <path d="M90 40 L120 40" stroke="#000" strokeWidth="2" />
        <path d="M30 25 L90 40" stroke="#000" strokeWidth="2" />
      </svg>
    ),
    symbols: {
      interruptor: {
        svg: (
          <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="20" width="80" height="40" stroke="#000" strokeWidth="2" fill="none" />
            <path d="M0 40 L30 40" stroke="#000" strokeWidth="2" />
            <path d="M90 40 L120 40" stroke="#000" strokeWidth="2" />
            <path d="M30 25 L90 40" stroke="#000" strokeWidth="2" />
          </svg>
        ),
        size: { w: 120, h: 80 },
      },
      disconnector: {
        svg: (
          <svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="10" width="40" height="20" stroke="#000" strokeWidth="2" fill="none" />
            <path d="M0 20 L20 20" stroke="#000" strokeWidth="2" />
            <path d="M60 20 L80 20" stroke="#000" strokeWidth="2" />
            <path d="M20 10 L60 20" stroke="#000" strokeWidth="2" />
          </svg>
        ),
        size: { w: 80, h: 40 },
      },
    }
  },

  infraestructura: {
    name: 'Infraestructura',
    icon: (
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <rect x="37.5" y="0" width="4" height="200" fill="#000" />
        <rect x="77.5" y="0" width="4" height="200" fill="#000" />
        <path d="M38 40 L200 40" stroke="#000" strokeWidth="2" />
        <path d="M78 160 L200 160" stroke="#000" strokeWidth="2" />
      </svg>
    ),
    symbols: {
      barras: {
        svg: (
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <rect x="37.5" y="0" width="4" height="200" fill="#000" />
            <rect x="77.5" y="0" width="4" height="200" fill="#000" />
            <path d="M38 40 L200 40" stroke="#000" strokeWidth="2" />
            <path d="M78 160 L200 160" stroke="#000" strokeWidth="2" />
          </svg>
        ),
        size: { w: 200, h: 200 },
      },
      tierra: {
        svg: (
          <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <g>
              <path d="M5 25 L35 25" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
              <path d="M9 28 L31 28" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
              <path d="M13 31 L27 31" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
              <path d="M17 34 L23 34" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
              <path d="M20 25 L20 0" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
            </g>
          </svg>
        ),
        size: { w: 40, h: 40 },
      },
    }
  },

  seguridad: {
    name: 'Seguridad',
    icon: (
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <path d="M40 50 V34a20 20 0 0 1 40 0 V50" stroke="#0044ffff" strokeWidth={4} fill="none" strokeLinecap="round" />
        <rect x="28" y="50" width="64" height="54" rx="6" stroke="#0044ffff" strokeWidth={2} fill="#00aeffff" />
      </svg>
    ),
    symbols: {
      candado: {
        svg: (
          <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            {/* shackle */}
            <path d="M40 50 V34a20 20 0 0 1 40 0 V50" stroke="#0044ffff" strokeWidth={4} fill="none" strokeLinecap="round" />
            {/* body */}
            <rect x="28" y="50" width="64" height="54" rx="6" stroke="#0044ffff" strokeWidth={2} fill="#00aeffff" />
          </svg>
        ),
        size: { w: 60, h: 60 },
      },
    }
  }
};

// Función auxiliar para obtener todos los símbolos (compatible con código existente)
export const getAllSymbols = (): Record<string, SymbolEntry> => {
  const allSymbols: Record<string, SymbolEntry> = {};

  Object.values(SYMBOL_CATEGORIES).forEach(category => {
    Object.entries(category.symbols).forEach(([key, symbol]) => {
      allSymbols[key] = symbol;
    });
  });

  return allSymbols;
};

// Mantenemos SYMBOLS para compatibilidad con código existente
export const SYMBOLS = getAllSymbols();

export default SYMBOLS;
