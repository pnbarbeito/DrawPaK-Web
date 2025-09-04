import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,

  Typography, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getSvgElementsByCategory, getSvgCategories } from './database.ts';
import type { SvgElement } from './database.ts';

type Props = {
  onDragStart: (e: React.DragEvent, elementId: string, element?: SvgElement) => void;
};

type ElementsByCategory = {
  [category: string]: SvgElement[];
};

const DynamicPalette: React.FC<Props> = ({ onDragStart }) => {
  const [elementsByCategory, setElementsByCategory] = useState<ElementsByCategory>({});
  const [loading, setLoading] = useState(true);

  const loadElements = useCallback(async () => {
    try {
      setLoading(true);
      const categories = await getSvgCategories();

      // Si no hay categorías, inicializar con elementos básicos
      if (categories.length === 0) {
        // Dar tiempo a que se inicialicen los elementos básicos
        setTimeout(async () => {
          const updatedCategories = await getSvgCategories();
          if (updatedCategories.length > 0) {
            await loadElementsForCategories(updatedCategories);
          }
        }, 1000);
        return;
      }

      await loadElementsForCategories(categories);
    } catch (error) {
      console.error('Error cargando elementos de paleta:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadElementsForCategories = async (categories: string[]) => {
    const elementsByCategory: ElementsByCategory = {};

    for (const category of categories) {
      try {
        const elements = await getSvgElementsByCategory(category);
        if (elements.length > 0) {
          elementsByCategory[category] = elements;
        }
      } catch (error) {
        console.error(`Error cargando elementos de categoría ${category}:`, error);
      }
    }

    setElementsByCategory(elementsByCategory);
  };

  useEffect(() => {
    loadElements();
  }, [loadElements]);

  // Listen for external updates (e.g. when user saves a new SVG) and reload palette
  useEffect(() => {
    const onUpdated = () => { loadElements(); };
    window.addEventListener('svg-elements-updated', onUpdated as EventListener);
    return () => window.removeEventListener('svg-elements-updated', onUpdated as EventListener);
  }, [loadElements]);

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case 'transformadores':
        return 'Transformadores';
      case 'proteccion':
        return 'Protección';
      case 'infraestructura':
        return 'Infraestructura';
      case 'seguridad':
        return 'Seguridad';
      case 'custom':
        return 'Personalizados';
      default:
        return category.charAt(0).toUpperCase() + category.slice(1);
    }
  };

  // Mapeo de elementos a symbolKey para compatibilidad con el código existente
  const getSymbolKeyForElement = (element: SvgElement): string => {
    // Mapear nombres de elementos a symbolKey existentes
    const nameToSymbolKey: Record<string, string> = {
      'Transformador': 'trafo',
      'Transformador 2 Bobinas': 'trafo_2',
      'Interruptor': 'interruptor',
      'Disconnector': 'disconnector',
      'Barras': 'barras',
      'Tierra': 'tierra',
      'Candado': 'candado'
    };

    return nameToSymbolKey[element.name] || `db_${element.id}`;
  };

  if (loading) {
    return (
      <Box style={{ position: 'absolute', left: 12, top: 72, width: 160, background: '#f5f5f5', padding: 8, borderRadius: 6, zIndex: 1200 }}>
        <Typography variant="h6" sx={{ width: '100%', textAlign: 'center', fontSize: 14, fontWeight: 600, mb: 1 }}>Paleta</Typography>
        <Typography variant="body2" style={{ fontSize: 12, color: '#666' }}>
          Cargando elementos...
        </Typography>
      </Box>
    );
  }

  return (
    <Box style={{ position: 'absolute', left: 12, top: 72, width: 160, background: '#f5f5f5', padding: 8, borderRadius: 6, zIndex: 1200 }}>
      <Typography variant="h6" style={{ width: '100%', textAlign: 'center', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Paleta
      </Typography>
      <Box style={{ marginTop: 8 }}>
        {Object.keys(elementsByCategory).length === 0 ? (
          <Typography variant="body2" style={{ fontSize: 12, color: '#666' }}>
            No hay elementos disponibles. Crea algunos elementos SVG.
          </Typography>
        ) : (
          Object.entries(elementsByCategory).map(([category, elements]) => (
            <Accordion key={category} defaultExpanded={category === 'transformadores'} style={{ marginBottom: 8 }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                style={{
                  padding: '4px 8px',
                  minHeight: '32px'
                }}
              >
                <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Typography variant="body2" style={{ fontSize: 12, fontWeight: 600 }}>
                    {getCategoryDisplayName(category)}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails style={{ padding: '8px 0' }}>
                <Box style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {elements.map((element) => {
                    return (
                      <Box
                        key={element.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, getSymbolKeyForElement(element), element)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'grab',
                          padding: 4,
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          background: '#fff'
                        }}
                      >
                        <Box style={{
                          width: 48,
                          height: 48,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          backgroundColor: '#fff',
                          border: '1px solid #eee',
                          borderRadius: 4
                        }}>
                          <div
                            dangerouslySetInnerHTML={{
                              __html: (() => {
                                try {
                                  if (!element.svg) return '';
                                  const parser = new DOMParser();
                                  const doc = parser.parseFromString(element.svg, 'image/svg+xml');
                                  const root = doc.documentElement as unknown as HTMLElement | null;
                                  if (!root || root.nodeName.toLowerCase() !== 'svg') return element.svg;
                                  const svgEl = root as unknown as SVGElement;

                                  // Ensure viewBox exists. If width/height present but no viewBox, try to derive a viewBox
                                  const vb = svgEl.getAttribute('viewBox');
                                  const wAttr = svgEl.getAttribute('width');
                                  const hAttr = svgEl.getAttribute('height');
                                  if (!vb && wAttr && hAttr) {
                                    const pw = parseFloat(wAttr as string);
                                    const ph = parseFloat(hAttr as string);
                                    if (!isNaN(pw) && !isNaN(ph) && pw > 0 && ph > 0) {
                                      svgEl.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
                                    }
                                  }

                                  // Remove explicit width/height so serialized SVG is flexible, but set thumbnail explicit attributes/styles
                                  svgEl.removeAttribute('width');
                                  svgEl.removeAttribute('height');
                                  svgEl.setAttribute('width', '42');
                                  svgEl.setAttribute('height', '42');
                                  svgEl.setAttribute('style', 'width:42px;height:42px;max-width:42px;max-height:42px;display:block');

                                  const serializer = new XMLSerializer();
                                  return serializer.serializeToString(svgEl);
                                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                } catch (e) {
                                  return element.svg || '';
                                }
                              })()
                            }}
                          />
                        </Box>
                        <Box style={{ fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {element.name}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>
    </Box>
  );
};

export default DynamicPalette;
