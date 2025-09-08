# DrawPaK Web - Contexto del Proyecto

## Información General
- **Nombre**: DrawPaK Web
- **Versión**: 0.0.0
- **Licencia**: Apache-2.0
- **Tipo**: Aplicación web para diagramas eléctricos/esquemáticos
- **Fecha última actualización**: 5 de septiembre de 2025

## Descripción del Proyecto
DrawPaK Web es una aplicación web interactiva para crear diagramas eléctricos y esquemáticos. La aplicación permite:
- Crear y editar diagramas con nodos interconectados
- Gestionar bibliotecas de símbolos SVG personalizados
- Guardar y cargar esquemas en base de datos local (IndexedDB)
- Exportar diagramas a PNG y PDF
- Editor SVG integrado para crear símbolos personalizados

## Stack Tecnológico

### Frontend Framework
- **React 19.1.1** - Framework principal
- **TypeScript 5.8.3** - Lenguaje de programación
- **Vite 7.1.2** - Build tool y dev server

### Librerías Principales
- **ReactFlow 11.11.4** - Librería para diagramas de flujo interactivos
- **Material-UI 7.3.1** - Componentes UI (@mui/material, @emotion/react, @emotion/styled)
- **Dexie 4.2.0** - Wrapper para IndexedDB (base de datos local)
- **@svgdotjs/svg.js 3.2.4** - Manipulación SVG
- **react-rnd 10.5.2** - Componentes redimensionables y arrastrables

### Librerías de Utilidad
- **html-to-image 1.11.13** - Exportación a PNG
- **jspdf 3.0.2** - Exportación a PDF
- **react-colorful 5.6.1** - Selector de colores
- **dompurify 3.2.6** - Sanitización HTML/SVG
- **material-symbols 0.35.0** - Iconografía

### Herramientas de Desarrollo
- **ESLint 9.33.0** - Linting
- **TypeScript ESLint 8.39.1** - Linting específico para TypeScript
- **@vitejs/plugin-react-swc 4.0.0** - Plugin React con SWC

## Estructura del Proyecto

```
/
├── public/                 # Archivos estáticos
│   └── vite.svg           # Favicon
├── src/                   # Código fuente
│   ├── main.tsx          # Punto de entrada
│   ├── App.tsx           # Componente raíz
│   ├── theme.tsx         # Configuración tema MUI
│   ├── index.css         # Estilos globales
│   ├── App.css           # Estilos del componente App
│   ├── assets/           # Assets estáticos
│   │   └── react.svg
│   └── components/       # Componentes React
│       ├── FlowApp.tsx               # Componente principal de la aplicación
│       ├── DynamicPalette.tsx        # Paleta de símbolos
│       ├── SymbolNode.tsx            # Nodo de símbolo en ReactFlow
│       ├── LabelNode.tsx             # Nodo de texto/etiqueta
│       ├── PolygonNode.tsx           # Nodo de polígono (implementado)
│       ├── SvgEditorDialog.tsx       # Editor SVG modal
│       ├── SvgShapeEditor.tsx        # Editor de formas SVG
│       ├── symbols.tsx               # Definiciones de símbolos por defecto
│       ├── database.ts               # Capa de acceso a datos (IndexedDB)
│       └── reactFlowConfig.ts        # Configuración ReactFlow
├── package.json          # Dependencias y scripts
├── tsconfig.json         # Configuración TypeScript (referencias)
├── tsconfig.app.json     # Configuración TypeScript para la app
├── tsconfig.node.json    # Configuración TypeScript para Node
├── vite.config.ts        # Configuración Vite
├── eslint.config.js      # Configuración ESLint
├── index.html            # HTML base
├── bun.lock              # Lock file de Bun
└── LICENSE               # Licencia Apache 2.0
```

## Componentes Principales

### FlowApp.tsx (2397 líneas)
- **Propósito**: Componente principal que gestiona todo el flujo de la aplicación
- **Características**:
  - Gestión de estado de nodos y conexiones ReactFlow
  - Sistema de guardado/carga de esquemas
  - Gestión de biblioteca SVG
  - Exportación PNG/PDF
  - Interfaz de usuario completa con toolbar
  - Snap to grid (20x20)
  - Sistema de posicionamiento inteligente de nodos

### SymbolNode.tsx (563 líneas)
- **Propósito**: Componente de nodo que renderiza símbolos SVG
- **Características**:
  - Soporte para símbolos estáticos y dinámicos
  - Transformaciones (rotación, escalado, flip)
  - Sistema de handles (puntos de conexión)
  - Preservación de datos SVG

### DynamicPalette.tsx
- **Propósito**: Paleta lateral con símbolos disponibles
- **Características**:
  - Categorización de símbolos
  - Drag & drop para añadir símbolos al canvas
  - Gestión de símbolos personalizados

### Database.ts (860 líneas)
- **Propósito**: Capa de acceso a datos usando IndexedDB
- **Tablas**:
  - `schemas`: Esquemas guardados (nodos + conexiones)
  - `svg_elements`: Biblioteca de símbolos SVG personalizados
- **Funcionalidades**:
  - CRUD completo para esquemas y símbolos
  - Inicialización automática con datos por defecto
  - Sistema de categorías para símbolos

### SvgEditorDialog.tsx y SvgShapeEditor.tsx
- **Propósito**: Editor SVG integrado para crear símbolos personalizados
- **Características**:
  - Editor visual de formas básicas
  - Manipulación directa de código SVG
  - Definición de puntos de conexión (handles)
  - Categorización de símbolos

## Configuración del Entorno

### TypeScript
- **Target**: ES2022
- **Módulo**: ESNext
- **JSX**: react-jsx
- **Modo strict**: Habilitado
- **Configuración dividida**: app.json (aplicación) + node.json (herramientas)

### Vite
- **Plugin**: @vitejs/plugin-react-swc (React con SWC)
- **Dev server**: Puerto por defecto (5173)

### Material-UI
- **Tema**: Modo claro forzado
- **Colores**: Fondo #f5f7fb, AppBar #263238
- **CssBaseline**: Habilitado para reset CSS

### ReactFlow
- **Tipos de nodo**: symbolNode, labelNode, polygonNode
- **Tipos de conexión**: smoothstep por defecto
- **Grid**: 20x20 píxeles
- **Estilos**: CSS importado desde 'reactflow/dist/style.css'

## Scripts Disponibles

```bash
bun dev      # Servidor de desarrollo
bun build    # Build de producción (TypeScript + Vite)
bun lint     # Linting con ESLint
bun preview  # Preview del build
```

## Funcionalidades Principales

### Gestión de Diagramas
- Crear nodos arrastrando desde la paleta
- Conectar nodos con líneas suaves
- Snap automático a grid 20x20
- Posicionamiento inteligente (evita solapamientos)
- Zoom, pan, minimapa
- Selección múltiple

### Biblioteca de Símbolos
- Símbolos predefinidos por categorías (transformadores, etc.)
- Editor SVG para crear símbolos personalizados
- Gestión de handles (puntos de conexión)
- Sistema de categorías

### Persistencia
- IndexedDB para almacenamiento local
- Esquemas guardados con metadatos
- Biblioteca de símbolos persistente
- Operaciones CRUD completas

### Exportación
- PNG de alta calidad usando html-to-image
- PDF usando jsPDF
- Preservación de calidad visual

## Estado Actual del Desarrollo

### Implementado ✅
- Sistema base ReactFlow funcional
- Gestión completa de esquemas (CRUD)
- Editor SVG integrado y funcional
- Exportación PNG/PDF
- Sistema de handles dinámicos
- Snap to grid
- Paleta de símbolos categorizada
- Base de datos IndexedDB

### En Desarrollo 🚧
- Posibles mejoras en UX

### Arquitectura
- **Patrón**: Component-based con hooks
- **Estado**: useState y useRef para estado local
- **Efectos**: useEffect para sincronización
- **Tipado**: TypeScript estricto con interfaces bien definidas

## Convenciones de Código

### Nomenclatura
- Componentes: PascalCase
- Funciones: camelCase
- Constantes: UPPER_SNAKE_CASE
- Archivos: kebab-case o PascalCase según tipo

### Estructura
- Un componente por archivo
- Exports nombrados para utilidades
- Default export para componentes principales
- Tipado explícito para props e interfaces

## Notas Técnicas

### Gestión de Estado
- No usa Redux/Zustand, state management local con React hooks
- ReactFlow maneja internamente el estado del diagrama
- Dexie/IndexedDB para persistencia

### Rendimiento
- Snap to grid optimizado
- Posicionamiento inteligente de nodos
- Lazy loading implícito en ReactFlow

### Compatibilidad
- Navegadores modernos (ES2022)
- No hay dependencias de Node.js en runtime
- Totalmente client-side

Esta es una aplicación robusta y bien estructurada para creación de diagramas eléctricos con una arquitectura moderna y escalable.

---

## Contenido Original del Documento

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
