import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

describe('Jira Webhook Proxy Server Tests', () => {
  let server;
  let baseUrl;
  let mockFetch;

  beforeEach(async () => {
    process.env.CURSOR_AUTH_TOKEN = 'crsr_test_token_123';
    process.env.CURSOR_WEBHOOK_URL = 'https://api2.cursor.sh/automations/webhook/db5d8c6c-9d82-11f1-a7d1-d6b4613131ce';
    
    mockFetch = async (url, options) => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const app = createApp({ fetch: (...args) => mockFetch(...args) });
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    delete process.env.CURSOR_AUTH_TOKEN;
    delete process.env.CURSOR_WEBHOOK_URL;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET /health returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  test('POST /webhook successfully forwards request to Cursor API with Bearer token', async () => {
    let capturedUrl;
    let capturedOptions;

    mockFetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return new Response(JSON.stringify({ triggered: true, automationId: 'auto_456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const payload = { jiraWorkItemId: 'DXP-123' };
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(capturedUrl, 'https://api2.cursor.sh/automations/webhook/db5d8c6c-9d82-11f1-a7d1-d6b4613131ce');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.headers['Authorization'], 'Bearer crsr_test_token_123');
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
    assert.equal(capturedOptions.body, JSON.stringify(payload));
    assert.equal(data.success, true);
    assert.deepEqual(data.data, { triggered: true, automationId: 'auto_456' });
  });

  test('POST /webhook handles existing Bearer prefix in CURSOR_AUTH_TOKEN gracefully', async () => {
    process.env.CURSOR_AUTH_TOKEN = 'Bearer crsr_existing_prefix';
    let capturedAuthorization;

    mockFetch = async (url, options) => {
      capturedAuthorization = options.headers['Authorization'];
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jiraWorkItemId: 'DXP-999' })
    });

    assert.equal(res.status, 200);
    assert.equal(capturedAuthorization, 'Bearer crsr_existing_prefix');
  });

  test('POST /webhook returns 500 when CURSOR_AUTH_TOKEN is missing', async () => {
    delete process.env.CURSOR_AUTH_TOKEN;

    const payload = { jiraWorkItemId: 'DXP-123' };
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 500);
    const data = await res.json();
    assert.equal(data.error, 'Configuration Error');
  });

  test('POST /webhook returns 502 Bad Gateway on downstream fetch failure', async () => {
    mockFetch = async () => {
      throw new Error('Network error');
    };

    const payload = { jiraWorkItemId: 'DXP-123' };
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 502);
    const data = await res.json();
    assert.equal(data.error, 'Bad Gateway');
    assert.equal(data.details, 'Network error');
  });
});
