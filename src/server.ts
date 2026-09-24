// src/server.ts
// Hono Node server 入口

import { serve } from '@hono/node-server';
import 'dotenv/config';
import app from './app';

const port = Number(process.env['PORT'] ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✓ Daily SOP API listening on http://localhost:${info.port}`);
  console.log(`  Swagger UI: http://localhost:${port}/docs`);
  console.log(`  OpenAPI spec: http://localhost:${port}/openapi.json`);
  console.log(`  Health: http://localhost:${port}/health`);
});
