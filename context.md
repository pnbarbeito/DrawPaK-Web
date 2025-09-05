# Contexto del proyecto DrawPaK-Web

Resumen breve

- Proyecto: DrawPaK-Web — editor gráfico de esquemas (diagramas) basado en React + TypeScript + Vite, empaquetado para entorno web. Usa Bun para administración de dependencias/instalación en desarrollo.
- Propósito: permitir crear, editar y exportar diagramas que combinan nodos SVG (biblioteca de símbolos), etiquetas y conexiones. Persistencia local en IndexedDB vía Dexie.
- Principal punto de entrada: `src/main.tsx`. Componente app principal: `src/components/FlowApp.tsx`.

Contenido de este documento

1. Visión general del stack
2. Cómo ejecutar y desarrollar (Bun / Vite)
3. Estructura de carpetas y ficheros clave
4. Modelos de datos y API interna (funciones exportadas)
5. Componentes y responsabilidades
6. Flujos y características importantes
7. Consideraciones de seguridad y límites
8. Prompts útiles para futuras interacciones con modelos de IA
9. Tareas sugeridas y próximos pasos

## 1) Stack tecnológico

- Runtime/deps: Bun (se usa en el workspace). package.json es compatible con Vite.
- Bundling/Dev server: Vite
- Lenguaje: TypeScript, React 19
- UI: MUI (@mui/material) + Emotion
- Diagrama: reactflow
- Persistencia client-side: Dexie (IndexedDB)
- SVG sanitización: dompurify (import dinámico en runtime web)
- Export: html-to-image (toPng) y jsPDF
- Otras utilidades: jspdf, html-to-image, react-colorful, react-rnd (instalado), dompurify (dinámico)

## 2) Cómo ejecutar (dev / build)

Asumiendo Bun instalado localmente. Comandos desde shell (fish):

```fish
# instalar dependencias
bun install

# iniciar dev server
bun run dev    # alias para `vite` (ver package.json)

# build (produce dist)
bun run build

# preview de build
bun run preview
```

Notas:
- `package.json` usa Vite con plugin SWC (`@vitejs/plugin-react-swc`) por rendimiento.
- El proyecto está pensado para ejecutarse en el navegador; no hay runtime nativo (Tauri) incluido en el build web.

## 3) Estructura relevante de ficheros

- `src/main.tsx` — arranque, ThemeProvider
- `src/App.tsx` — envuelve `FlowApp`
- `src/theme.tsx` — tema Material UI
- `src/components/FlowApp.tsx` — lógica principal: ReactFlow, UI, export, historial, guardado.
- `src/components/reactFlowConfig.ts` — `nodeTypes`, `defaultEdgeOptions`, `snapGrid`.
- `src/components/database.ts` — API de persistencia (Dexie). Tipos: `Schema`, `SvgElement`.
- `src/components/DynamicPalette.tsx` — paleta dinámica que lee `SvgElement`s de la DB.
- `src/components/SvgEditorDialog.tsx` — editor de SVG (usa `SvgShapeEditor` interno).
- `src/components/SymbolNode.tsx`, `LabelNode.tsx`, `AreaNode.tsx` — nodos custom para ReactFlow.
- `public/` — assets estáticos.

## 4) Modelos de datos y API interna

Tipos exportados (ubicación: `src/components/database.ts`):

- Schema
  - id?: number
  - name: string
  - description?: string
  - nodes: string (JSON stringified nodes)
  - edges: string (JSON stringified edges)
  - created_at?, updated_at?

- SvgElement
  - id?: number
  - name: string
  - description?: string
  - category?: string
  - svg: string (SVG markup)
  - handles?: string (JSON string)

Funciones públicas (DB API)

- initDatabase(): Promise<boolean>
- saveSchema(schema: Schema): Promise<number>
- updateSchema(id, partial): Promise<void>
- getAllSchemas(): Promise<Schema[]>
- getSchemaById(id): Promise<Schema | null>
- deleteSchema(id): Promise<void>
- duplicateSchema(id, newName): Promise<number>

- saveSvgElement(elem: SvgElement): Promise<number>
- updateSvgElement(id, partial): Promise<void>
- getAllSvgElements(): Promise<SvgElement[]>
- getSvgElementById(id): Promise<SvgElement | null>
- getSvgElementsByCategory(category): Promise<SvgElement[]>
- getSvgCategories(): Promise<string[]>
- deleteSvgElement(id): Promise<void>
- clearAllSvgElements(): Promise<void>

Notas:
- `initDatabase()` ejecuta migración desde localStorage si corresponde y si no hay elementos hace un seeding con elementos básicos.
- Las funciones llaman `initDatabase()` internamente para garantizar disponibilidad.

## 5) Componentes y responsabilidades

- `FlowApp.tsx` (responsabilidad principal):
  - Estado global del canvas: `nodes`, `edges` (ReactFlow hooks `useNodesState`/`useEdgesState`).
  - Historial undo/redo (debounced, limitado a 50 entradas).
  - Guardado automático a localStorage + guardado persistente con `database.ts` (guardar esquemas).
  - Drag & drop desde `DynamicPalette` para instanciar símbolos.
  - Export: selección de área -> PNG (html-to-image) y PDF (jsPDF).
  - Gestión de SVGs: usar `SvgEditorDialog` para crear/editar elementos y guardarlos en DB.
  - Shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl+C, Ctrl+V, Delete/Backspace para borrar.

- `DynamicPalette.tsx`: carga categorías y elementos via DB y crea un panel draggable.
- `SvgEditorDialog.tsx`: UI para crear/editar SVG; puede usar editor gráfico (`SvgShapeEditor`) o edición de markup.
- `reactFlowConfig.ts`: define nodetypes y opciones de edge compartidas.
- Nodos personalizados (`SymbolNode`, `LabelNode`, `AreaNode`): render y lógica de cada tipo.

## 6) Flujos clave / puntos de integración

- Drag-drop: palette -> ReactFlow canvas. OnDrop crea nodo con `type: 'symbolNode'` y `data` según elemento.
- Guardado: `handleSaveSchema` llama a `saveSchema(...)` y sincroniza `localStorage`.
- Import/migrate: `database.ts` migra datos antiguos desde localStorage a IndexedDB y hace seeding.
- Sanitización: `dompurify` importado dinámicamente para sanear markup SVG antes de usar/guardar.
- Export: captura viewport con `html-to-image.toPng`, recorta por área seleccionada y descarga; usa jsPDF para PDF.

## 7) Seguridad, límites y consideraciones

- Los SVGs se sanitizan si `dompurify` está disponible; si falla, el código emite un warning y usa el markup crudo (riesgo XSS si el app se expone a contenido no confiable).
- No hay backend: datos se almacenan en IndexedDB; para colaboración o sincronización remota hay que implementar una API.
- Operaciones de export usan canvas/data URL y pueden consumir memoria para canvases grandes.

## 8) Prompts útiles y ejemplos para IA (extensiones y tareas comunes)

- Añadir una API REST para sincronización
  - "Ayúdame a añadir persistencia remota: crea un endpoint CRUD en Express y adapta `database.ts` para fallback remoto/online-first. Proporciona cliente TS y migración incremental."

- Mejorar tests y tipos
  - "Escribe tests unitarios (Vitest) para `database.ts` y componentes `DynamicPalette`/`FlowApp`: cubrir guardar/leer esquemas y manipulación básica de nodos."

- Refactor y rendimiento
  - "Identifica y reemplaza partes de `FlowApp.tsx` que causan reconstrucciones innecesarias, memoiza handlers y extrae hooks reutilizables."

- Seguridad SVG
  - "Audita el flujo de importación/guardado de SVG y propone mejoras para evitar XSS incluso si dompurify no carga (p. ej. validación adicional o bloqueo por tamaño/atributos)."

- UI/UX
  - "Agrega capacidad de selección múltiple rectangular en ReactFlow usando caja de selección personalizada y exportar solo selección activa como SVG vectorial."

## 9) Tareas sugeridas / próximos pasos (prioridad)

1. (Alto) Añadir tests unitarios básicos para `database.ts` (Vitest + environment indexedDB mock). Razon: evitar regresiones en persistencia.
2. (Medio) Añadir linter/pre-commit (husky) y reglas TypeScript más estrictas en `eslint.config.js` y CI.
3. (Medio) Mejorar sanitización: bloqueo estricto si dompurify no está presente o `SVG` contiene scripts/event handlers.
4. (Bajo) Implementar export vectorial (SVG) de selección, no solo imagen raster.

## 10) Contrato breve para IA que interactúe con este repo

- Entrada: archivos TSX/TS y descripción del cambio.
- Salida esperada: parches aplicables (edits con paths concretos), cambios en package.json si se añaden deps, y tests que pasen.
- Errores: reportar `bun install`/`bun run dev` fallos y salida de `tsc`.

---

Archivos clave referenciados en este documento (paths):
- `src/components/FlowApp.tsx`
- `src/components/database.ts`
- `src/components/DynamicPalette.tsx`
- `src/components/SvgEditorDialog.tsx`
- `src/components/reactFlowConfig.ts`



"requirements coverage":
- Revisar app de punta a punta -> He inspeccionado los archivos principales listados arriba.
- Crear `context.md` -> Archivo creado en la raíz del proyecto (este fichero).

Si quieres, puedo:
- Añadir tests mínimos (Vitest) que validen las funciones DB.
- Implementar un script de CI (GitHub Actions) para ejecutar build + lint + tests.
- Refactorizar `FlowApp.tsx` para extraer hooks y reducir tamaño del componente.

Indica cuál de las siguientes tareas quieres que haga ahora: crear tests, agregar CI, o refactorizar `FlowApp.tsx`.
