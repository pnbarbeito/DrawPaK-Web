<?php
// Simple PHP backend for DrawPaK-Web
// Router for basic CRUD on schemas and svgs using SQLite and PDO
declare(strict_types=1);

// When used as the router script for `php -S`, let the built-in server serve existing static files
if (php_sapi_name() === 'cli-server') {
  $url  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
  $file = __DIR__ . $url;
  if ($url !== '/' && file_exists($file)) {
    return false; // serve the requested resource as-is
  }
}

// Project root is the dist folder (this file lives in dist)
$projectRoot = realpath(__DIR__);
$dbPath = __DIR__ . '/data.sqlite';

// Simple helpers
function jsonResponse($data, $status = 200)
{
  header('Content-Type: application/json');
  http_response_code($status);
  echo json_encode($data);
  exit;
}

function getDb(): PDO
{
  global $dbPath;
  $needsInit = !file_exists($dbPath);
  $pdo = new PDO('sqlite:' . $dbPath);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  if ($needsInit) initDb($pdo);
  return $pdo;
}

function initDb(PDO $pdo)
{
  $pdo->exec("CREATE TABLE IF NOT EXISTS schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    nodes TEXT NOT NULL,
    edges TEXT NOT NULL,
    created_at TEXT,
    created_by TEXT,
    updated_at TEXT,
    updated_by TEXT,
  local INTEGER DEFAULT 0,
  synchronized INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0
  )");

  $pdo->exec("CREATE TABLE IF NOT EXISTS svgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    svg TEXT NOT NULL,
    handles TEXT,
    created_at TEXT,
    created_by TEXT,
    updated_at TEXT,
    updated_by TEXT,
  local INTEGER DEFAULT 0,
  synchronized INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0
  )");

  // Per-user library blob storage (stores a JSON object and an updated_at timestamp)
  $pdo->exec("CREATE TABLE IF NOT EXISTS user_libraries (
    username TEXT PRIMARY KEY,
    updated_at TEXT,
    data TEXT
  )");

  // Seed default SVG elements if table empty — values taken from src/components/database.ts
  $count = (int)$pdo->query('SELECT COUNT(*) FROM svgs')->fetchColumn();
  if ($count === 0) {
    $now = (new DateTime())->format(DateTime::ATOM);
    $seed = [
      [
        'id' => 'fa31ce0c-fb55-4685-bcc9-3bfb0d5bdee5',
        'name' => 'Transformador',
        'description' => 'Transformador básico',
        'category' => 'transformadores',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 120\" style=\"background: rgba(255, 255, 255, 0);\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 40)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" cx=\"60\" fill-opacity=\"0\" fill=\"#fff\" stroke=\"#000\" r=\"25\" stroke-width=\"2\" cy=\"40\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 80)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" cx=\"60\" fill-opacity=\"0\" fill=\"#fff\" stroke=\"#000\" r=\"25\" stroke-width=\"2\" cy=\"80\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 7.5)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y2=\"15\" y1=\"0\" stroke=\"#000\" x2=\"60\" stroke-width=\"2\" x1=\"60\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 112.5)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y2=\"105\" y1=\"120\" stroke=\"#000\" x2=\"60\" stroke-width=\"2\" x1=\"60\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n</svg>",
        'handles' => json_encode([['id' => 'top', 'x' => 60, 'y' => 0, 'type' => 'source'], ['id' => 'bottom', 'x' => 60, 'y' => 120, 'type' => 'target']]),
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => '51399c85-3dc0-452c-b2eb-5436202eb63f',
        'name' => 'Transformador Doble',
        'description' => 'Transformador con doble salida',
        'category' => 'transformadores',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 160\" style=\"background: rgba(255, 255, 255, 0);\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 60)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" fill-opacity=\"0\" cx=\"60\" fill=\"#fff\" stroke-width=\"2\" stroke=\"#000\" cy=\"60\" r=\"30\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 40, 100)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" fill-opacity=\"0\" cx=\"40\" fill=\"#fff\" stroke-width=\"2\" stroke=\"#000\" cy=\"100\" r=\"30\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 80, 100)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" fill-opacity=\"0\" cx=\"80\" fill=\"none\" stroke-width=\"2\" stroke=\"#000\" cy=\"100\" r=\"30\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 15)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"60\" y1=\"30\" stroke-width=\"2\" stroke=\"#000\" y2=\"0\" x2=\"60\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 40, 145)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"40\" y1=\"160\" stroke-width=\"2\" stroke=\"#000\" y2=\"130\" x2=\"40\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 80, 145)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"80\" y1=\"160\" stroke-width=\"2\" stroke=\"#000\" y2=\"130\" x2=\"80\"/>\n</g>\n</g>\n</svg>",
        'handles' => json_encode([['id' => 'top', 'x' => 60, 'y' => 0, 'type' => 'source'], ['id' => 'left', 'x' => 40, 'y' => 160, 'type' => 'target'], ['id' => 'right', 'x' => 80, 'y' => 160, 'type' => 'target']]),
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => 'c179addb-150c-475a-8ae3-543a187e9728',
        'name' => 'Interruptor',
        'description' => 'Interruptor',
        'category' => 'proteccion',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 80\" style=\"background: rgba(255, 255, 255, 0);\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 30, 40)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" stroke=\"#000\" stroke-width=\"1\" r=\"4\" fill=\"#000\" cx=\"30\" cy=\"40\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 90, 40)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" stroke=\"#000\" stroke-width=\"1\" r=\"4\" fill=\"#000\" cx=\"90\" cy=\"40\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 15, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" stroke=\"#000\" y2=\"40\" stroke-width=\"2\" x1=\"0\" x2=\"30\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 30)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" stroke=\"#000\" y2=\"20\" stroke-width=\"2\" x1=\"30\" x2=\"90\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 105, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" stroke=\"#000\" y2=\"40\" stroke-width=\"2\" x1=\"90\" x2=\"120\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 35)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"20\" y=\"10\" stroke=\"#000\" stroke-width=\"2\" fill=\"rgba(255, 255, 255, 0)\" width=\"80\" fill-opacity=\"0\" height=\"50\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n</svg>",
        'handles' => json_encode([['id' => 'left', 'type' => 'source', 'x' => 0, 'y' => 40], ['id' => 'right', 'type' => 'target', 'x' => 120, 'y' => 40]]),
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => '442c7305-e553-4ead-90bf-8c639c6cc1df',
        'name' => 'Interruptor Extraido',
        'description' => 'Interruptor',
        'category' => 'proteccion',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 120\" style=\"background: rgba(255, 255, 255, 0);\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 100, 46)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" fill=\"rgba(255, 255, 255, 0)\" fill-opacity=\"0\" height=\"50\" x=\"60\" width=\"80\" y=\"21\" stroke=\"#000\" stroke-width=\"2\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 70, 50)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" fill=\"#000\" stroke=\"#000\" stroke-width=\"1\" cy=\"50\" cx=\"70\" r=\"4\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 130, 50)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" fill=\"#000\" stroke=\"#000\" stroke-width=\"1\" cy=\"50\" cx=\"130\" r=\"4\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 15, 100)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"0\" stroke=\"#000\" stroke-width=\"2\" x2=\"30\" y2=\"100\" y1=\"100\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 100, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"70\" stroke=\"#000\" stroke-width=\"2\" x2=\"130\" y2=\"30\" y1=\"50\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 186, 100)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"170\" stroke=\"#000\" stroke-width=\"2\" x2=\"202\" y2=\"100\" y1=\"100\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 55, 50)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"40\" stroke=\"#000\" stroke-width=\"2\" x2=\"70\" y2=\"50\" y1=\"50\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 145, 50)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" x1=\"130\" stroke=\"#000\" stroke-width=\"2\" x2=\"160\" y2=\"50\" y1=\"50\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(270, 50, 100)\">\n<path xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" stroke-linecap=\"butt\" d=\"M 30 100 A 20 20 0 0 1 70 100\" stroke=\"#000\" stroke-width=\"2\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(90, 150, 100)\">\n<path xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" stroke-linecap=\"butt\" d=\"M 130 100 A 20 20 0 0 1 170 100\" stroke=\"#000\" stroke-width=\"2\"/>\n</g>\n</g>\n</svg>",
        'handles' => json_encode([['id' => 'left', 'type' => 'source', 'x' => 0, 'y' => 100], ['id' => 'right', 'type' => 'target', 'x' => 200, 'y' => 100]]),
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => 'eddb3c2a-c6ae-42d0-8d6d-3614c24b7139',
        'name' => 'Seccionador',
        'description' => 'Seccionador de línea',
        'category' => 'proteccion',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 80\" style=\"background: rgba(255, 255, 255, 0);\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 30, 40)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" stroke=\"#000\" stroke-width=\"1\" r=\"4\" fill=\"#000\" cx=\"30\" cy=\"40\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 90, 40)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" stroke=\"#000\" stroke-width=\"1\" r=\"4\" fill=\"#000\" cx=\"90\" cy=\"40\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 15, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" stroke=\"#000\" y2=\"40\" stroke-width=\"2\" x1=\"0\" x2=\"30\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60, 30)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" stroke=\"#000\" y2=\"20\" stroke-width=\"2\" x1=\"30\" x2=\"90\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 105, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" stroke=\"#000\" y2=\"40\" stroke-width=\"2\" x1=\"90\" x2=\"120\"/>\n</g>\n</g>\n</svg>",
        'handles' => json_encode([['id' => 'left', 'type' => 'source', 'x' => 0, 'y' => 40], ['id' => 'right', 'type' => 'target', 'x' => 120, 'y' => 40]]),
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => "41dbe6ce-7cd5-4c23-a5ca-3ac50bf69cea",
        'name' => "Barra Simple",
        'description' => "Barras de conexión",
        'category' => 'infraestructura',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"background: rgba(255, 255, 255, 0);\" viewBox=\"0 0 200 200\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 39.5, 100)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"37.5\" height=\"200\" fill=\"#000\" stroke-width=\"1\" y=\"0\" width=\"4\" stroke=\"#000\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 120, 100)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"100\" x2=\"200\" stroke-width=\"2\" x1=\"40\" y2=\"100\" stroke=\"#000\"/>.\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n</svg>",
        'handles' => "[{\"id\":\"h_1756826687664\",\"type\":\"target\",\"x\":40,\"y\":200},{\"id\":\"h_1756829757274\",\"type\":\"source\",\"x\":40,\"y\":0},{\"id\":\"h_1756829764787\",\"type\":\"target\",\"x\":200,\"y\":100}]",
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => "af6a241f-25b3-4926-9cde-360dc22d20ad",
        'name' => "Barra Doble",
        'description' => "Barras de conexión",
        'category' => 'infraestructura',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" style=\"background: rgba(255, 255, 255, 0);\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 39.5, 100)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"37.5\" y=\"0\" width=\"4\" height=\"200\" fill=\"#000\" stroke=\"#000\" stroke-width=\"1\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 79.5, 100)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"77.5\" y=\"0\" width=\"4\" height=\"200\" fill=\"#000\" stroke=\"#000\" stroke-width=\"1\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 120, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y2=\"40\" y1=\"40\" stroke=\"#000\" x2=\"200\" stroke-width=\"2\" x1=\"40\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 139, 160)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y2=\"160\" y1=\"160\" stroke=\"#000\" x2=\"200\" stroke-width=\"2\" x1=\"78\"/>\n</g>\n</g>\n</svg>",
        'handles' => "[{\"id\":\"h_1756826687664\",\"type\":\"target\",\"x\":40,\"y\":200},{\"id\":\"h_1756826687995\",\"type\":\"source\",\"x\":40,\"y\":0},{\"id\":\"h_1756826670572\",\"type\":\"target\",\"x\":80,\"y\":200},{\"id\":\"h_1756826671210\",\"type\":\"source\",\"x\":80,\"y\":0},{\"id\":\"r_top\",\"type\":\"target\",\"x\":200,\"y\":40},{\"id\":\"b_right\",\"type\":\"target\",\"x\":200,\"y\":160}]",
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => "ec8d9bea-25c8-44de-a4af-3035697e7457",
        'name' => "Barra Triple",
        'description' => "Barras de conexión",
        'category' => 'infraestructura',
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"background: rgba(255, 255, 255, 0);\" viewBox=\"0 0 200 200\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 20.5, 100)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"18.5\" height=\"200\" fill=\"#000\" stroke-width=\"1\" y=\"0\" width=\"4\" stroke=\"#000\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 60.5, 100)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"58.5\" height=\"200\" fill=\"#000\" stroke-width=\"1\" y=\"0\" width=\"4\" stroke=\"#000\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 100, 100)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" x=\"98\" height=\"200\" fill=\"#000\" stroke-width=\"1\" y=\"0\" width=\"4\" stroke=\"#000\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 150, 160)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"160\" x2=\"200\" stroke-width=\"2\" x1=\"100\" y2=\"160\" stroke=\"#000\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 110, 40)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"40\" x2=\"200\" stroke-width=\"2\" x1=\"20\" y2=\"40\" stroke=\"#000\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 130, 100)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" y1=\"100\" x2=\"200\" stroke-width=\"2\" x1=\"60\" y2=\"100\" stroke=\"#000\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n</svg>",
        'handles' => "[{\"id\":\"h_1756826687664\",\"type\":\"target\",\"x\":20,\"y\":200},{\"id\":\"h_1756830053495\",\"type\":\"source\",\"x\":20,\"y\":0},{\"id\":\"h_1756830129231\",\"type\":\"target\",\"x\":60,\"y\":200},{\"id\":\"h_1756826687995\",\"type\":\"source\",\"x\":60,\"y\":0},{\"id\":\"h_1756826671210\",\"type\":\"source\",\"x\":100,\"y\":0},{\"id\":\"r_top\",\"type\":\"target\",\"x\":200,\"y\":40},{\"id\":\"h_1756826670572\",\"type\":\"target\",\"x\":100,\"y\":200},{\"id\":\"b_right\",\"type\":\"target\",\"x\":200,\"y\":160},{\"id\":\"h_1756830118484\",\"type\":\"target\",\"x\":200,\"y\":100}]",
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => "67de6f6d-0f4e-4c46-abe6-6dc6fb5a885d",
        'name' => "Candado",
        'description' => "Dispositivo de bloqueo",
        'category' => "seguridad",
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"background: rgba(255, 255, 255, 0);\" viewBox=\"0 0 60 60\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 30, 43.5)\">\n<rect xmlns=\"http://www.w3.org/2000/svg\" stroke-width=\"2\" fill=\"#62a0ea\" width=\"40\" stroke=\"#000\" y=\"31\" height=\"25\" x=\"10\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 16, 24.5)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" stroke-width=\"2\" y1=\"32\" x1=\"16\" stroke=\"#000\" y2=\"17\" x2=\"16\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 44, 24)\">\n<line xmlns=\"http://www.w3.org/2000/svg\" stroke-width=\"2\" y1=\"30\" x1=\"44\" stroke=\"#000\" y2=\"18\" x2=\"44\"/>\n</g>\n</g>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 30, 20)\">\n<path xmlns=\"http://www.w3.org/2000/svg\" stroke-width=\"2\" fill=\"none\" d=\"M 16 20 A 14 14 0 0 1 44 20\" stroke=\"#000\" stroke-linecap=\"butt\"/>\n</g>\n</g>\n</svg>",
        'handles' => "[]",
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => "7328a097-72b5-4f47-9469-8b39a5646e30",
        'name' => "Bloqueo",
        'description' => "Zona de bloqueo",
        'category' => "seguridad",
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"background: rgba(255, 255, 255, 0);\" viewBox=\"0 0 80 80\">\n<defs xmlns=\"http://www.w3.org/2000/svg\"/>\n<g xmlns=\"http://www.w3.org/2000/svg\">\n<g xmlns=\"http://www.w3.org/2000/svg\" transform=\"rotate(0, 40, 40)\">\n<circle xmlns=\"http://www.w3.org/2000/svg\" cx=\"40\" stroke=\"#3584e4\" stroke-width=\"2\" cy=\"40\" fill=\"rgba(255, 255, 255, 0)\" fill-opacity=\"0\" r=\"38\"/>\n</g>\n</g>\n</svg>",
        'handles' => "[]",
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ],
      [
        'id' => "ca04f696-8e62-4250-82ef-be3f78d4eda9",
        'name' => "Puesta a Tierra",
        'description' => "Conexión a tierra",
        'category' => "seguridad",
        'svg' => "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 40 40\" style=\"background: rgba(255, 255, 255, 0);\"><defs/><g><g transform=\"rotate(0, 20, 10)\"><line x1=\"20\" y1=\"0\" x2=\"20\" y2=\"20\" stroke=\"#ff0000\" stroke-width=\"2\"/></g></g><g><g transform=\"rotate(0, 20, 20)\"><line x1=\"0\" y1=\"20\" x2=\"40\" y2=\"20\" stroke=\"#ff0000\" stroke-width=\"2\"/></g></g><g><g transform=\"rotate(0, 20, 30)\"><line x1=\"12\" y1=\"30\" x2=\"28\" y2=\"30\" stroke=\"#ff0000\" stroke-width=\"2\"/></g></g><g><g transform=\"rotate(0, 20, 35)\"><line x1=\"16\" y1=\"35\" x2=\"24\" y2=\"35\" stroke=\"#ff0000\" stroke-width=\"2\"/><g/></g></g><g><g transform=\"rotate(0, 20, 25)\"><line x1=\"4\" y1=\"25\" x2=\"36\" y2=\"25\" stroke=\"#ff0000\" stroke-width=\"2\"/></g></g></svg>",
        'handles' => "[{\"id\":\"top\",\"x\":20,\"y\":0,\"type\":\"source\"}]",
        'created_at' => $now,
        'created_by' => 'pbarbeito',
        'updated_at' => $now,
        'updated_by' => 'pbarbeito',
        'local' => 0
      ]
    ];

      $stmt = $pdo->prepare('INSERT INTO svgs (id, name, description, category, svg, handles, created_at, created_by, updated_at, updated_by, local, synchronized, hidden) VALUES (:id, :name, :description, :category, :svg, :handles, :created_at, :created_by, :updated_at, :updated_by, :local, :synchronized, :hidden)');
    $pdo->beginTransaction();
    try {
      foreach ($seed as $s) {
        // ensure defaults for new columns
        if (!isset($s['synchronized'])) $s['synchronized'] = 0;
        if (!isset($s['hidden'])) $s['hidden'] = 0;
        $stmt->execute($s);
      }
      $pdo->commit();
    } catch (Throwable $e) {
      $pdo->rollBack();
      error_log('Seeding svgs failed: ' . $e->getMessage());
    }
  }
}
initDb(getDb());
// Only apply CORS / preflight for API endpoints
$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$segments = array_values(array_filter(explode('/', $uri)));

if (isset($segments[0]) && $segments[0] === 'api') {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
  }
}

// Serve SPA static files for non-/api requests
if (!isset($segments[0]) || $segments[0] !== 'api') {
  // Map request to project root
  $filePath = $projectRoot . $uri;
  if ($filePath === $projectRoot . '/' || $filePath === $projectRoot) {
    // serve index.html
    readfile($projectRoot . '/index.html');
    exit;
  }
  if (file_exists($filePath) && is_file($filePath)) {
    // Serve static file with correct Content-Type
    $mime = mime_content_type($filePath) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    readfile($filePath);
    exit;
  }
  // fallback to index.html for client-side routing
  readfile($projectRoot . '/index.html');
  exit;
}

// At this point path starts with /api
$resource = $segments[1] ?? '';
$id = isset($segments[2]) ? $segments[2] : null;

try {
  if ($resource === 'health') {
    jsonResponse(['status' => 'ok']);
  }

  if ($resource === 'schemas') {
    $db = getDb();
    if ($method === 'GET' && $id === null) {
      $q = $_GET['q'] ?? null;
      $stmt = $db->prepare('SELECT * FROM schemas ORDER BY updated_at DESC');
      $stmt->execute();
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
      if ($q) {
        $q = strtolower($q);
        $rows = array_values(array_filter($rows, function ($r) use ($q) {
          return strpos(strtolower($r['name'] ?? ''), $q) !== false || strpos(strtolower($r['description'] ?? ''), $q) !== false;
        }));
      }
      jsonResponse($rows);
    }

    if ($method === 'GET' && $id !== null) {
      $stmt = $db->prepare('SELECT * FROM schemas WHERE id = :id');
      $stmt->execute([':id' => $id]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if (!$row) jsonResponse(['error' => 'not found'], 404);
      jsonResponse($row);
    }

    if ($method === 'POST') {
      $body = json_decode(file_get_contents('php://input'), true);
      if (!$body) jsonResponse(['error' => 'invalid json'], 400);
      $username = $body['username'] ?? null;
      if (!$username) jsonResponse(['error' => 'username required'], 400);
      $now = (new DateTime())->format(DateTime::ATOM);
      // Allow client to provide an id (UUID). If not provided, generate a server-side UUID fallback.
      $idToUse = $body['id'] ?? null;
      if (!$idToUse) {
        // generate a v4-like uuid fallback
        $idToUse = bin2hex(random_bytes(16));
      }
      $stmt = $db->prepare('INSERT INTO schemas (id, name, description, nodes, edges, created_at, created_by, updated_at, updated_by, local, synchronized, hidden) VALUES (:id, :name, :description, :nodes, :edges, :created_at, :created_by, :updated_at, :updated_by, :local, :synchronized, :hidden)');
      $stmt->execute([
        ':id' => $idToUse,
        ':name' => $body['name'] ?? '',
        ':description' => $body['description'] ?? '',
        ':nodes' => $body['nodes'] ?? '[]',
        ':edges' => $body['edges'] ?? '[]',
        ':created_at' => $now,
        ':created_by' => $username,
        ':updated_at' => $now,
        ':updated_by' => $username,
        ':local' => isset($body['local']) && $body['local'] ? 1 : 0,
        ':synchronized' => isset($body['synchronized']) && $body['synchronized'] ? 1 : 0,
        ':hidden' => isset($body['hidden']) && $body['hidden'] ? 1 : 0
      ]);
      jsonResponse(['id' => $idToUse], 201);
    }

    if ($method === 'PUT' && $id !== null) {
      $body = json_decode(file_get_contents('php://input'), true);
      if (!$body) jsonResponse(['error' => 'invalid json'], 400);
      $username = $body['username'] ?? null;
      if (!$username) jsonResponse(['error' => 'username required'], 400);
      $now = (new DateTime())->format(DateTime::ATOM);
      $fields = [];
      $params = [':id' => $id, ':updated_at' => $now, ':updated_by' => $username];
      if (isset($body['name'])) {
        $fields[] = 'name = :name';
        $params[':name'] = $body['name'];
      }
      if (isset($body['description'])) {
        $fields[] = 'description = :description';
        $params[':description'] = $body['description'];
      }
      if (isset($body['nodes'])) {
        $fields[] = 'nodes = :nodes';
        $params[':nodes'] = $body['nodes'];
      }
      if (isset($body['edges'])) {
        $fields[] = 'edges = :edges';
        $params[':edges'] = $body['edges'];
      }
      if (isset($body['local'])) {
        $fields[] = 'local = :local';
        $params[':local'] = $body['local'] ? 1 : 0;
      }
      if (isset($body['synchronized'])) {
        $fields[] = 'synchronized = :synchronized';
        $params[':synchronized'] = $body['synchronized'] ? 1 : 0;
      }
      if (isset($body['hidden'])) {
        $fields[] = 'hidden = :hidden';
        $params[':hidden'] = $body['hidden'] ? 1 : 0;
      }
      if (count($fields) === 0) jsonResponse(['error' => 'nothing to update'], 400);
      $sql = 'UPDATE schemas SET ' . implode(', ', $fields) . ', updated_at = :updated_at, updated_by = :updated_by WHERE id = :id';
      $stmt = $db->prepare($sql);
      $stmt->execute($params);
      jsonResponse(['ok' => true]);
    }

    if ($method === 'DELETE' && $id !== null) {
      $stmt = $db->prepare('DELETE FROM schemas WHERE id = :id');
      $stmt->execute([':id' => $id]);
      jsonResponse(['ok' => true]);
    }
  }

  if ($resource === 'svgs') {
    $db = getDb();
    if ($method === 'GET' && $id === null) {
      $q = $_GET['q'] ?? null;
      $category = $_GET['category'] ?? null;
      $stmt = $db->prepare('SELECT * FROM svgs ORDER BY updated_at DESC');
      $stmt->execute();
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
      if ($q) {
        $q = strtolower($q);
        $rows = array_values(array_filter($rows, function ($r) use ($q) {
          return strpos(strtolower($r['name'] ?? ''), $q) !== false || strpos(strtolower($r['description'] ?? ''), $q) !== false;
        }));
      }
      if ($category) {
        $rows = array_values(array_filter($rows, function ($r) use ($category) {
          return ($r['category'] ?? '') === $category;
        }));
      }
      jsonResponse($rows);
    }

    if ($method === 'GET' && $id !== null) {
      $stmt = $db->prepare('SELECT * FROM svgs WHERE id = :id');
      $stmt->execute([':id' => $id]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if (!$row) jsonResponse(['error' => 'not found'], 404);
      jsonResponse($row);
    }

    if ($method === 'POST') {
      $body = json_decode(file_get_contents('php://input'), true);
      if (!$body) jsonResponse(['error' => 'invalid json'], 400);
      // Accept username if present, but do not require it. Prefer explicit username, then created_by.
      $username = $body['username'] ?? $body['created_by'] ?? null;
      $now = (new DateTime())->format(DateTime::ATOM);
      $idToUse = $body['id'] ?? null;
      if (!$idToUse) {
        $idToUse = bin2hex(random_bytes(16));
      }
  $stmt = $db->prepare('INSERT INTO svgs (id, name, description, category, svg, handles, created_at, created_by, updated_at, updated_by, local, synchronized, hidden) VALUES (:id, :name, :description, :category, :svg, :handles, :created_at, :created_by, :updated_at, :updated_by, :local, :synchronized, :hidden)');
      $stmt->execute([
        ':id' => $idToUse,
        ':name' => $body['name'] ?? '',
        ':description' => $body['description'] ?? '',
        ':category' => $body['category'] ?? '',
        ':svg' => $body['svg'] ?? '',
        ':handles' => $body['handles'] ?? '',
        ':created_at' => $now,
        // if username is null, we insert NULL into created_by/updated_by
        ':created_by' => $username,
        ':updated_at' => $now,
        ':updated_by' => $username,
  ':local' => isset($body['local']) && $body['local'] ? 1 : 0,
  ':synchronized' => isset($body['synchronized']) && $body['synchronized'] ? 1 : 0,
  ':hidden' => isset($body['hidden']) && $body['hidden'] ? 1 : 0
      ]);
      jsonResponse(['id' => $idToUse], 201);
    }

    if ($method === 'PUT' && $id !== null) {
      $body = json_decode(file_get_contents('php://input'), true);
      if (!$body) jsonResponse(['error' => 'invalid json'], 400);
      $username = $body['username'] ?? null;
      if (!$username) jsonResponse(['error' => 'username required'], 400);
      $now = (new DateTime())->format(DateTime::ATOM);
      $fields = [];
      $params = [':id' => $id, ':updated_at' => $now, ':updated_by' => $username];
      if (isset($body['name'])) {
        $fields[] = 'name = :name';
        $params[':name'] = $body['name'];
      }
      if (isset($body['description'])) {
        $fields[] = 'description = :description';
        $params[':description'] = $body['description'];
      }
      if (isset($body['category'])) {
        $fields[] = 'category = :category';
        $params[':category'] = $body['category'];
      }
      if (isset($body['svg'])) {
        $fields[] = 'svg = :svg';
        $params[':svg'] = $body['svg'];
      }
      if (isset($body['handles'])) {
        $fields[] = 'handles = :handles';
        $params[':handles'] = $body['handles'];
      }
      if (isset($body['local'])) {
        $fields[] = 'local = :local';
        $params[':local'] = $body['local'] ? 1 : 0;
      }
      if (count($fields) === 0) jsonResponse(['error' => 'nothing to update'], 400);
      $sql = 'UPDATE svgs SET ' . implode(', ', $fields) . ', updated_at = :updated_at, updated_by = :updated_by WHERE id = :id';
      $stmt = $db->prepare($sql);
      $stmt->execute($params);
      jsonResponse(['ok' => true]);
    }

    if ($method === 'DELETE' && $id !== null) {
      $stmt = $db->prepare('DELETE FROM svgs WHERE id = :id');
      $stmt->execute([':id' => $id]);
      jsonResponse(['ok' => true]);
    }
  }

  // Per-user library endpoints: GET /api/user-library/:username and PUT /api/user-library/:username
  if ($resource === 'user-library') {
    $db = getDb();
    // username is in $id (segments[2])
    $username = $id;
    if (!$username) jsonResponse(['error' => 'username required'], 400);

    if ($method === 'GET') {
      $stmt = $db->prepare('SELECT username, updated_at, data FROM user_libraries WHERE username = :username');
      $stmt->execute([':username' => $username]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      // If no row exists for this user, return an empty library object (200)
      if (!$row) {
        // Return a canonical empty library object containing both SVG elements and schemas
        jsonResponse(['username' => $username, 'updated_at' => null, 'data' => ['version' => 1, 'elements' => [], 'schemas' => []]]);
      }
      // return parsed JSON in data if possible
      $result = ['username' => $row['username'], 'updated_at' => $row['updated_at'], 'data' => null];
      if ($row['data']) {
        $decoded = json_decode($row['data'], true);
        $result['data'] = $decoded === null ? $row['data'] : $decoded;
      }
      jsonResponse($result);
    }

    if ($method === 'PUT') {
      $body = json_decode(file_get_contents('php://input'), true);
      if (!$body) jsonResponse(['error' => 'invalid json'], 400);
      // Allow username in path to be authoritative; still accept username in body for convenience
      $bodyUsername = $body['username'] ?? null;
      if ($bodyUsername && $bodyUsername !== $username) {
        // mismatch between path and body
        jsonResponse(['error' => 'username mismatch between path and body'], 400);
      }
      $now = $body['updated_at'] ?? (new DateTime())->format(DateTime::ATOM);
      $incomingData = isset($body['data']) ? $body['data'] : [];

      // Fetch existing row (if any) to merge data blobs and check updated_at for optimistic locking
      $stmtRead = $db->prepare('SELECT data, updated_at FROM user_libraries WHERE username = :username');
      $stmtRead->execute([':username' => $username]);
      $existingRow = $stmtRead->fetch(PDO::FETCH_ASSOC);
      $existingData = null;
      if ($existingRow && $existingRow['data']) {
        $decoded = json_decode($existingRow['data'], true);
        $existingData = ($decoded === null) ? null : $decoded;
      }

      // Optimistic locking: if client provided updated_at and server has a newer updated_at, reject
      $clientTs = null;
      if (isset($body['updated_at'])) {
        $clientTs = strtotime($body['updated_at']);
      }
      if ($existingRow && $existingRow['updated_at']) {
        $serverTs = strtotime($existingRow['updated_at']);
        if ($clientTs !== null && $serverTs !== false && $clientTs < $serverTs) {
          // Client is stale
          jsonResponse(['error' => 'conflict', 'message' => 'server has newer version', 'server_updated_at' => $existingRow['updated_at']], 409);
        }
      }

      // Helper: merge existing and incoming library blobs (preserve elements and schemas)
      $merge_library_data = function ($existing, $incoming) {
        $out = [];
        $out['version'] = $incoming['version'] ?? $existing['version'] ?? 1;

        // Merge elements by id (incoming overrides existing)
        $exElements = is_array($existing['elements'] ?? null) ? $existing['elements'] : [];
        $inElements = is_array($incoming['elements'] ?? null) ? $incoming['elements'] : [];
        $map = [];
        // shallow-merge by id: incoming keys override existing, but preserve other keys (like hidden) when missing
        foreach ($exElements as $e) {
          if (is_array($e) && isset($e['id'])) $map[strval($e['id'])] = $e;
        }
        foreach ($inElements as $e) {
          if (is_array($e) && isset($e['id'])) {
            $id = strval($e['id']);
            $existingItem = isset($map[$id]) && is_array($map[$id]) ? $map[$id] : [];
            $map[$id] = array_merge($existingItem, $e);
          }
        }
        $out['elements'] = array_values($map);

        // Merge schemas by id (incoming overrides existing)
        $exSchemas = is_array($existing['schemas'] ?? null) ? $existing['schemas'] : [];
        $inSchemas = is_array($incoming['schemas'] ?? null) ? $incoming['schemas'] : [];
        $map = [];
        foreach ($exSchemas as $s) {
          if (is_array($s) && isset($s['id'])) $map[strval($s['id'])] = $s;
        }
        foreach ($inSchemas as $s) {
          if (is_array($s) && isset($s['id'])) {
            $id = strval($s['id']);
            $existingItem = isset($map[$id]) && is_array($map[$id]) ? $map[$id] : [];
            $map[$id] = array_merge($existingItem, $s);
          }
        }
        $out['schemas'] = array_values($map);

        // Preserve other keys (incoming wins)
        $keys = array_unique(array_merge(array_keys(is_array($existing) ? $existing : []), array_keys(is_array($incoming) ? $incoming : [])));
        foreach ($keys as $k) {
          if (in_array($k, ['elements', 'schemas', 'version'])) continue;
          if (array_key_exists($k, (array)$incoming)) $out[$k] = $incoming[$k];
          elseif (array_key_exists($k, (array)$existing)) $out[$k] = $existing[$k];
        }
        return $out;
      };

      $existingDataArr = is_array($existingData) ? $existingData : ['version' => 1, 'elements' => [], 'schemas' => []];
      $incomingDataArr = is_array($incomingData) ? $incomingData : [];
      $merged = $merge_library_data($existingDataArr, $incomingDataArr);

      $jsonData = json_encode($merged);

      // upsert merged blob
      $stmt = $db->prepare('INSERT INTO user_libraries (username, updated_at, data) VALUES (:username, :updated_at, :data) ON CONFLICT(username) DO UPDATE SET updated_at = :updated_at, data = :data');
      $stmt->execute([':username' => $username, ':updated_at' => $now, ':data' => $jsonData]);
      jsonResponse(['username' => $username, 'updated_at' => $now]);
    }
  }

  jsonResponse(['error' => 'not found'], 404);
} catch (Throwable $e) {
  error_log('Server error: ' . $e->getMessage());
  jsonResponse(['error' => 'server error', 'message' => $e->getMessage()], 500);
}
