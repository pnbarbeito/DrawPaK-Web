# DrawPaK-web


DrawPaK-web es la aplicación web para edición y composición de símbolos SVG y de esquemas unifilares eléctricos de MT (Media Tensión) y AT (Alta Tensión). Está construida con React + TypeScript, Vite y React Flow.

Este repositorio contiene la interfaz de usuario (UI) y una micro API local (PHP + SQLite en `public/`) para facilitar el desarrollo y las pruebas de sincronización de la librería de usuario.

Resumen rápido
- Stack: React 19 + TypeScript, Vite (SWC), Material UI (MUI v7), React Flow, Dexie (IndexedDB local), Bun/npm scripts.
- Backend de desarrollo: micro API en `public/index.php` que persiste en `public/data.sqlite`.
- Objetivo: edición de símbolos SVG y esquemas, con sincronización opcional al endpoint `/api/user-library/:username`.

Contenido del README
- Requisitos
- Instalación y desarrollo
- Scripts y build
- Estructura del proyecto
- Notas de diseño y decisiones importantes
- Contribuir


Requisitos
- Bun (recomendado): si está disponible en tu entorno, es la opción primaria para instalar dependencias y arrancar scripts (los ejemplos usan `bun`).
- Node.js >= 18 como alternativa secundaria (usa `npm` o `pnpm`).

Instalación y desarrollo

1) Clona el repositorio

```fish
git clone https://github.com/pnbarbeito/DrawPaK-Web.git
cd DrawPaK-web
```

2) Instala dependencias

Preferimos Bun como entorno por defecto. Ejemplos a continuación (fish shell):

Con Bun (opción recomendada):

```fish
bun install
```

Con npm (alternativa):

```fish
npm install
```

3) Arrancar en modo desarrollo (HMR)

Con Bun:

```fish
bun run dev
```

Con npm:

```fish
npm run dev
```

Esto abre la app en `http://localhost:5173` (o el puerto que Vite asigne).

Scripts útiles
- `bun run dev` / `npm run dev`: servidor de desarrollo con HMR.
- `bun run build` / `npm run build`: build de producción (output en `dist/`).
- `bun run preview` / `npm run preview`: preview del build local.

Estructura del proyecto (resumen)
- `src/` – código fuente React/TSX.
  - `main.tsx`, `App.tsx` – punto de entrada.
  - `components/` – componentes clave: `FlowApp.tsx`, `SvgEditorDialog.tsx`, `SymbolNode.tsx`, `DynamicPalette.tsx`, `database.ts` (Dexie + sync logic), etc.
- `public/` – assets estáticos y la micro-API PHP:
  - `index.php` – endpoints `/api/*` para desarrollo.
  - `data.sqlite` – base de datos SQLite usada por la micro-API (se crea/actualiza al ejecutar requests).
  - `logo.svg` – logo de la app (se usa en la barra superior).

  Página de prueba / Demo
  ---------------------------------
  Hay una página de prueba pública con la versión estática del frontend en:

  https://pnbarbeito.github.io/DrawPaK-Web/

  Nota importante sobre la demo
  ---------------------------------
  La página de prueba es únicamente el frontend estático y NO ejecuta la micro-API PHP del repositorio. Por ello la demo usa únicamente IndexedDB a través de `Dexie` y TODO lo que crees o edites se guardará localmente en el navegador (no se sincroniza con un servidor remoto). Si cierras el navegador o limpias los datos de sitio del navegador, los cambios se perderán.

  Si quieres probar la sincronización remota (GET/PUT a `/api/user-library/:username`) debes ejecutar la aplicación localmente y arrancar la micro-API en `public/index.php` (por ejemplo, con PHP embebido o montando `public/` en un servidor que soporte PHP). En el README y la documentación del repo hay instrucciones para desarrollar localmente.

Notas de diseño y decisiones importantes
- Sincronización de librería de usuario: la app mantiene una `user_library` que puede sincronizarse con la API mediante GET/PUT a `/api/user-library/:username`. Para evitar descargas duplicadas se implementó una caché en memoria para inflight requests.
- Guardados agrupados (debounce): al guardar múltiples SVGs o esquemas, la app programa un PUT completo de `user_library` por usuario con debounce (por defecto 2000 ms) para reducir PUTs frecuentes.
- Preservación de la propiedad `hidden`: para evitar pérdida de `hidden` al restaurar desde la librería remota se añadió un parser robusto `parseHidden` que interpreta booleanos, números y strings (`'1'`, `'true'`) y respeta valores truthy enviados desde el servidor.

Verificaciones recomendadas después de clonar
1) Abrir la app y comprobar que se hallan cargado los símbolos SVG por defecto.
2) Comprobar flujo básico: crear o editar un esquema unifilar (MT/AT) y símbolos SVG asociados.
3) Realizar varios guardados y cierres de sesión para comprobar la persistencia de datos.

Contribuir
- Forkea el repo y crea branches temáticos por feature/bugfix.
- Sigue las convenciones de TypeScript y trata de mantener la base de código con tipos estrictos.
- Si añades dependencias, usa versiones fijas y añade una breve nota en `CHANGELOG.md` (no incluido actualmente).

Notas para el despliegue
- Esta app incluye una micro-API PHP y un SQLite local diseñada para desarrollo y demo. Para producción deberías sustituir la API por un backend real (Node/Express, PHP con seguridad, o serverless) y usar un almacenamiento duradero para las librerías de usuarios.
- Si solo necesitas edición local sin backend, la app funciona con IndexedDB local (Dexie) sin necesidad de API.
