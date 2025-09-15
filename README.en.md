# DrawPaK-web

DrawPaK-web is a web application for editing and composing SVG symbols and single-line electrical diagrams for MV (Medium Voltage) and HV (High Voltage). It is built with React + TypeScript, Vite and React Flow.

This repository contains the user interface (UI) and a small local PHP micro-API (in `public/`) to simplify development and library sync testing.

Quick summary
- Stack: React 19 + TypeScript, Vite (SWC), Material UI (MUI v7), React Flow, Dexie (local IndexedDB), Bun/npm scripts.
- Development backend: micro API in `public/index.php` that persists data to `public/data.sqlite`.
- Purpose: editing SVG symbols and single-line diagrams, with optional synchronization to the endpoint `/api/user-library/:username`.

README contents
- Requirements
- Installation & development
- Scripts and build
- Project structure
- Design notes and important decisions
- Contributing

Requirements
- Bun (recommended): if available in your environment, it is the primary option to install dependencies and run scripts (examples use `bun`).
- Node.js >= 18 as a secondary alternative (use `npm` or `pnpm`).

Installation & development

1) Clone the repository

```fish
git clone https://github.com/pnbarbeito/DrawPaK-Web.git
cd DrawPaK-web
```

2) Install dependencies

We prefer Bun as the default environment. Examples below (fish shell):

With Bun (recommended):

```fish
bun install
```

With npm (alternative):

```fish
npm install
```

3) Start development server (HMR)

With Bun:

```fish
bun run dev
```

With npm:

```fish
npm run dev
```

This opens the app at `http://localhost:5173` (or the port assigned by Vite).

Useful scripts
- `bun run dev` / `npm run dev`: development server with HMR.
- `bun run build` / `npm run build`: production build (output in `dist/`).
- `bun run preview` / `npm run preview`: preview the local build.

Project structure (summary)
- `src/` – React/TSX source code.
  - `main.tsx`, `App.tsx` – entry points.
  - `components/` – key components: `FlowApp.tsx`, `SvgEditorDialog.tsx`, `SymbolNode.tsx`, `DynamicPalette.tsx`, `database.ts` (Dexie + sync logic), etc.
- `public/` – static assets and the PHP micro-API:
  - `index.php` – `/api/*` endpoints for development.
  - `data.sqlite` – SQLite DB used by the micro-API (created/updated upon requests).

Design notes and important decisions
- User library synchronization: the app maintains a `user_library` that can sync with the API via GET/PUT to `/api/user-library/:username`. An in-memory cache for inflight requests prevents duplicate downloads.
- Batched saves (debounce): when saving multiple SVGs or diagrams the app schedules a full PUT of the `user_library` per user with debounce (default 2000 ms) to reduce frequent PUTs.
- Preservation of the `hidden` property: to avoid losing `hidden` when restoring from a remote library, a robust `parseHidden` parser was added that interprets booleans, numbers and strings (`'1'`, `'true'`) and respects truthy values sent from the server.

Recommended checks after cloning
1) Open the app and check that the default SVG symbols are loaded.
2) Verify basic flow: create or edit a single-line diagram (MV/HV) and associated SVG symbols.
3) Make several saves and logouts to check data persistence.

Contributing
- Fork the repo and create topic branches per feature/bugfix.
- Follow TypeScript conventions and prefer strict types where practical.
- If you add dependencies, pin versions and add a short note to `CHANGELOG.md` (not present today).

Deployment notes
- This app includes a PHP micro-API and a local SQLite intended for development/demo. For production you should replace the micro-API with a proper backend (Node/Express, secure PHP, or serverless) and use durable storage for user libraries.
- If you only need local editing without a backend, the app runs using Dexie (IndexedDB) and does not require the API.