import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const spec = parseYaml(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as {
  openapi: string;
  info: { title: string; version: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes: Record<string, unknown>;
    parameters: Record<string, unknown>;
    schemas: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
  security: Array<Record<string, string[]>>;
};

/** Routes implemented under src/app/api/v1 (verified against the file tree). */
const IMPLEMENTED: Array<{ method: string; path: string }> = [
  { method: 'get', path: '/api/v1/me' },
  { method: 'get', path: '/api/v1/workspaces' },
  { method: 'get', path: '/api/v1/projects' },
  { method: 'post', path: '/api/v1/projects' },
  { method: 'get', path: '/api/v1/projects/{id}' },
  { method: 'patch', path: '/api/v1/projects/{id}' },
  { method: 'get', path: '/api/v1/websites' },
  { method: 'get', path: '/api/v1/websites/{id}' },
  { method: 'get', path: '/api/v1/deployments' },
  { method: 'post', path: '/api/v1/deployments' },
  { method: 'get', path: '/api/v1/deployments/{id}' },
  { method: 'get', path: '/api/v1/marketplace/products' },
  { method: 'get', path: '/api/v1/ai/usage' },
  { method: 'get', path: '/api/v1/webhooks' },
  { method: 'post', path: '/api/v1/webhooks' },
  { method: 'patch', path: '/api/v1/webhooks/{id}' },
  { method: 'post', path: '/api/v1/webhooks/{id}' },
  { method: 'delete', path: '/api/v1/webhooks/{id}' },
  { method: 'get', path: '/api/v1/sandbox/events' },
  { method: 'post', path: '/api/v1/sandbox/events' },
  { method: 'get', path: '/api/v1/sandbox/usage' },
  { method: 'post', path: '/api/v1/oauth/token' },
  { method: 'post', path: '/api/v1/oauth/revoke' },
  { method: 'get', path: '/oauth/authorize' },
];

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

describe('OpenAPI 3.1 spec', () => {
  it('parses as valid OpenAPI 3.1 with required metadata', () => {
    expect(spec.openapi).toMatch(/^3\.1\.\d+$/);
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.servers?.length).toBeGreaterThan(0);
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(spec.components.responses.ApiError).toBeTruthy();
  });

  it('documents exactly the implemented endpoints (no phantom or missing routes)', () => {
    const documented = new Set<string>();
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of METHODS) if (pathItem[method]) documented.add(`${method} ${path}`);
    }
    const implemented = new Set(IMPLEMENTED.map((r) => `${r.method} ${r.path}`));
    for (const route of implemented) expect(documented.has(route)).toBe(true);
    for (const route of documented) expect(implemented.has(route)).toBe(true);
    expect(documented.size).toBe(IMPLEMENTED.length);
  });

  it('gives every operation responses and the right security posture', () => {
    const PUBLIC = new Set(['post /api/v1/oauth/token', 'post /api/v1/oauth/revoke', 'get /oauth/authorize']);
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of METHODS) {
        const op = pathItem[method] as Record<string, unknown> | undefined;
        if (!op) continue;
        expect(op.responses, `${method} ${path} needs responses`).toBeTruthy();
        const explicitlyPublic = Array.isArray(op.security) && op.security.length === 0;
        if (PUBLIC.has(`${method} ${path}`)) expect(explicitlyPublic).toBe(true);
        else expect(op.security ?? spec.security, `${method} ${path} must require bearerAuth`).toBeTruthy();
      }
    }
  });

  it('defines {id} path parameters for every templated path', () => {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!path.includes('{id}')) continue;
      const params = ((pathItem.parameters ?? []) as Array<{ name?: string; in?: string; required?: boolean; $ref?: string }>);
      const declared = params.some((p) => (p.$ref === '#/components/parameters/IdPath') || (p.name === 'id' && p.in === 'path' && p.required));
      expect(declared, `${path} must declare the id path parameter`).toBe(true);
      expect(spec.components.parameters.IdPath).toMatchObject({ name: 'id', in: 'path', required: true });
    }
  });

  it('describes the error codes actually produced by the API', () => {
    const apiError = spec.components.schemas.ApiErrorBody as { properties: { error: { properties: { code: { enum: string[] } } } } };
    const codes = apiError.properties.error.properties.code.enum;
    for (const code of ['AUTH_REQUIRED', 'INSUFFICIENT_SCOPE', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR', 'CONFLICT', 'IDEMPOTENCY_CONFLICT', 'RESOURCE_LOCKED', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'CONCURRENCY_LIMITED', 'SANDBOX_ONLY']) {
      expect(codes).toContain(code);
    }
    // Payment approval must not be a public API operation anywhere.
    expect(JSON.stringify(Object.keys(spec.paths))).not.toMatch(/payment|payout/i);
  });

  it('lists the complete webhook event catalog', () => {
    const eventType = spec.components.schemas.WebhookEventType as { enum: string[] };
    expect(eventType.enum).toEqual(expect.arrayContaining(['project.created', 'project.updated', 'website.published', 'deployment.completed', 'deployment.failed', 'order.paid', 'order.refunded', 'ai.credits.low', 'workspace.member.invited']));
    expect(eventType.enum).toHaveLength(9);
  });

  it('uses only resolvable local references', () => {
    const text = JSON.stringify(spec);
    const refs = [...text.matchAll(/"\$ref"\s*:\s*"#\/(.+?)"/g)].map((m) => m[1].split('/'));
    expect(refs.length).toBeGreaterThan(0);
    for (const parts of refs) {
      let node: unknown = spec;
      for (const part of parts) {
        const segment = part.replace(/~1/g, '/').replace(/~0/g, '~');
        node = (node as Record<string, unknown>)?.[decodeURIComponent(segment)];
        expect(node, `Unresolvable $ref: #/${parts.join('/')}`).toBeDefined();
      }
    }
  });
});
