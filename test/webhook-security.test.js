import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	computeJiraSignature,
	verifyJiraWebHookSignature
} from '../src/services/webhook-signature.service.js';
import { signWebhookBody, startApp, TEST_WEBHOOK_SECRET } from './helpers.js';

describe('webhook signature', () => {
	test('matches the Atlassian HMAC-SHA256 example vector', () => {
		assert.equal(
			computeJiraSignature('Hello World!', "It's a Secret to Everybody"),
			'sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9'
		);
	});

	test('accepts a matching signature over the raw body', () => {
		const rawBody = '{"ok":true}';
		const result = verifyJiraWebHookSignature({
			rawBody,
			signatureHeader: computeJiraSignature(rawBody, TEST_WEBHOOK_SECRET),
			webhookSecret: TEST_WEBHOOK_SECRET
		});
		assert.deepEqual(result, { ok: true });
	});

	test('rejects a missing signature header', () => {
		const result = verifyJiraWebHookSignature({
			rawBody: '{}',
			webhookSecret: TEST_WEBHOOK_SECRET
		});
		assert.equal(result.ok, false);
		assert.equal(result.status, 401);
	});

	test('rejects an invalid signature', () => {
		const result = verifyJiraWebHookSignature({
			rawBody: '{}',
			signatureHeader: 'sha256=deadbeef',
			webhookSecret: TEST_WEBHOOK_SECRET
		});
		assert.equal(result.ok, false);
		assert.equal(result.status, 403);
	});
});

describe('webhook request security', () => {
	test('GET /health is not rate limited or signed', async () => {
		const app = await startApp({
			rateLimit: { windowMs: 60_000, max: 1 }
		});

		try {
			const first = await fetch(`${app.baseUrl}/health`);
			const second = await fetch(`${app.baseUrl}/health`);
			assert.equal(first.status, 200);
			assert.equal(second.status, 200);
		} finally {
			await app.close();
		}
	});

	test('unsigned webhook POSTs are rejected with 401', async () => {
		let called = false;
		const app = await startApp({
			fetchImpl: async () => {
				called = true;
				return new Response('{}', { status: 200 });
			}
		});

		try {
			const res = await fetch(`${app.baseUrl}/api/assignment`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ webhookEvent: 'jira:issue_updated' })
			});
			assert.equal(res.status, 401);
			assert.equal(called, false);
		} finally {
			await app.close();
		}
	});

	test('invalid webhook signatures are rejected with 403', async () => {
		let called = false;
		const app = await startApp({
			fetchImpl: async () => {
				called = true;
				return new Response('{}', { status: 200 });
			}
		});

		try {
			const res = await fetch(`${app.baseUrl}/api/assignment`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Hub-Signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
				},
				body: JSON.stringify({ webhookEvent: 'jira:issue_updated' })
			});
			assert.equal(res.status, 403);
			assert.equal(called, false);
		} finally {
			await app.close();
		}
	});

	test('rate-limits webhook POSTs beyond RATE_LIMIT_MAX_REQUESTS', async () => {
		const app = await startApp({
			rateLimit: { windowMs: 60_000, max: 1 }
		});

		try {
			const body = { webhookEvent: 'jira:issue_updated' };
			const { rawBody, signature } = signWebhookBody(body);
			const headers = {
				'Content-Type': 'application/json',
				'X-Hub-Signature': signature
			};

			const allowed = await fetch(`${app.baseUrl}/api/assignment`, {
				method: 'POST',
				headers,
				body: rawBody
			});
			const blocked = await fetch(`${app.baseUrl}/api/assignment`, {
				method: 'POST',
				headers,
				body: rawBody
			});

			assert.equal(allowed.status, 200);
			assert.equal(blocked.status, 429);
		} finally {
			await app.close();
		}
	});
});
