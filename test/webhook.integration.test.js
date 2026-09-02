import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	loadApiRequest,
	qualifiedCommentPayload,
	startApp,
	TPAS_MAPPING
} from './helpers.js';

const query = new URLSearchParams({
	'issue-key': 'TPAS-284',
	'project-id': '16842',
	'project-key': 'TPAS',
	triggeredByUser: '712020:5a54709d-39a9-45b1-9c40-1cfac54b07ec'
});

async function postJson(baseUrl, pathname, body) {
	return fetch(`${baseUrl}${pathname}?${query.toString()}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('webhook integration', () => {
	test('GET /health returns 200 OK', async () => {
		const app = await startApp();
		try {
			const res = await fetch(`${app.baseUrl}/health`);
			assert.equal(res.status, 200);
			const data = await res.json();
			assert.equal(data.status, 'ok');
		} finally {
			await app.close();
		}
	});

	test('POST /api/slash-commands forwards a slim payload with the mapping Bearer token', async () => {
		let capturedUrl;
		let capturedOptions;

		const app = await startApp({
			fetchImpl: async (url, options) => {
				capturedUrl = url;
				capturedOptions = options;
				return new Response(JSON.stringify({ triggered: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		});

		try {
			const res = await postJson(app.baseUrl, '/api/slash-commands', qualifiedCommentPayload());
			assert.equal(res.status, 200);
			const data = await res.json();
			assert.equal(data.forwarded, true);
			assert.equal(data.automationId, 'abcd');
			assert.equal(capturedUrl, TPAS_MAPPING.automationWebhookUrl);
			assert.equal(capturedOptions.headers.Authorization, 'Bearer crsr_123');
			const outbound = JSON.parse(capturedOptions.body);
			assert.equal(outbound.issueKey, 'TPAS-284');
			assert.equal(outbound.trigger, 'comment-command');
			assert.equal(outbound.command, 'Please pick this up /cursor-coding-agent');
			assert.equal(outbound.summary, 'Add Subtraction Functionality to Calculator');
		} finally {
			await app.close();
		}
	});

	test('POST /api/assignment forwards Cursor assignment events', async () => {
		let capturedOptions;
		const app = await startApp({
			fetchImpl: async (_url, options) => {
				capturedOptions = options;
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
		});

		try {
			const res = await postJson(app.baseUrl, '/api/assignment', loadApiRequest('body-item-assigned.json'));
			assert.equal(res.status, 200);
			const outbound = JSON.parse(capturedOptions.body);
			assert.equal(outbound.trigger, 'cursor-assignment');
			assert.equal(outbound.projectKey, 'TPAS');
		} finally {
			await app.close();
		}
	});

	test('POST /api/status-changed forwards Ready for Dev events', async () => {
		let called = false;
		const app = await startApp({
			fetchImpl: async () => {
				called = true;
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
		});

		try {
			const res = await postJson(app.baseUrl, '/api/status-changed', loadApiRequest('body-status-changed.json'));
			assert.equal(res.status, 200);
			assert.equal(called, true);
		} finally {
			await app.close();
		}
	});

	test('ignored events do not call fetch', async () => {
		let called = false;
		const app = await startApp({
			fetchImpl: async () => {
				called = true;
				return new Response('{}', { status: 200 });
			}
		});

		try {
			const res = await postJson(app.baseUrl, '/api/slash-commands', loadApiRequest('body-comment-added.json'));
			assert.equal(res.status, 202);
			const data = await res.json();
			assert.equal(data.forwarded, false);
			assert.equal(called, false);
		} finally {
			await app.close();
		}
	});

	test('missing project mapping returns 202 and does not call fetch', async () => {
		let called = false;
		const app = await startApp({
			mappings: [],
			fetchImpl: async () => {
				called = true;
				return new Response('{}', { status: 200 });
			}
		});

		try {
			const res = await postJson(app.baseUrl, '/api/assignment', loadApiRequest('body-item-assigned.json'));
			assert.equal(res.status, 202);
			const data = await res.json();
			assert.equal(data.forwarded, false);
			assert.match(data.reason, /No automation mapping/);
			assert.equal(called, false);
		} finally {
			await app.close();
		}
	});

	test('Cursor network errors return 502', async () => {
		const app = await startApp({
			fetchImpl: async () => {
				throw new Error('Network error');
			}
		});

		try {
			const res = await postJson(app.baseUrl, '/api/assignment', loadApiRequest('body-item-created-assigned.json'));
			assert.equal(res.status, 502);
			const data = await res.json();
			assert.equal(data.error, 'Bad Gateway');
			assert.equal(data.details, 'Network error');
		} finally {
			await app.close();
		}
	});
});
