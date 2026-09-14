import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	clone,
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
		let acknowledgement;

		const app = await startApp({
			jiraCommentService: {
				addComment: async (request) => {
					acknowledgement = request;
					return { status: 201 };
				}
			},
			fetchImpl: async (url, options) => {
				capturedUrl = url;
				capturedOptions = options;
				return new Response(JSON.stringify({ agentId: 'bc-123' }), {
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
			assert.equal(data.acknowledged, true);
			assert.equal(data.automationId, 'abcd');
			assert.equal(
				data.agentUrl,
				'https://cursor.com/t/okta-grp-cursor-digital-gpt/agents/bc-123'
			);
			assert.equal(capturedUrl, TPAS_MAPPING.automationWebhookUrl);
			assert.equal(capturedOptions.headers.Authorization, 'Bearer crsr_123');
			const outbound = JSON.parse(capturedOptions.body);
			assert.equal(outbound.issueKey, 'TPAS-284');
			assert.equal(outbound.trigger, 'comment-command');
			assert.equal(outbound.command, 'Please pick this up /cursor-coding-agent');
			assert.equal(outbound.summary, 'Add Subtraction Functionality to Calculator');
			assert.equal(acknowledgement.issueKey, 'TPAS-284');
			assert.equal(acknowledgement.body.content[0].content[0].attrs.id, '712020:5a54709d-39a9-45b1-9c40-1cfac54b07ec');
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
			const payload = clone(loadApiRequest('body-comment-added.json'));
			payload.comment.body = 'No command here';
			const res = await postJson(app.baseUrl, '/api/slash-commands', payload);
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

	test('Cursor failures create an error acknowledgement for slash commands', async () => {
		let acknowledgement;
		const app = await startApp({
			jiraCommentService: {
				addComment: async (request) => {
					acknowledgement = request;
					return { status: 201 };
				}
			},
			fetchImpl: async () => new Response('{}', { status: 503 })
		});

		try {
			const res = await postJson(app.baseUrl, '/api/slash-commands', qualifiedCommentPayload());
			assert.equal(res.status, 502);
			const data = await res.json();
			assert.equal(data.forwarded, false);
			assert.equal(data.acknowledged, true);
			assert.match(acknowledgement.body.content[0].content[1].text, /status 503/);
		} finally {
			await app.close();
		}
	});

	test('a Cursor response without agentId creates an error acknowledgement', async () => {
		let acknowledgement;
		const app = await startApp({
			jiraCommentService: {
				addComment: async (request) => {
					acknowledgement = request;
					return { status: 201 };
				}
			},
			fetchImpl: async () => new Response(JSON.stringify({ accepted: true }), { status: 200 })
		});

		try {
			const res = await postJson(app.baseUrl, '/api/slash-commands', qualifiedCommentPayload());
			assert.equal(res.status, 502);
			const data = await res.json();
			assert.equal(data.forwarded, false);
			assert.equal(data.acknowledged, true);
			assert.match(acknowledgement.body.content[0].content[1].text, /did not include an agent ID/);
		} finally {
			await app.close();
		}
	});

	test('acknowledgement failures retain the started agent URL', async () => {
		const app = await startApp({
			jiraCommentService: {
				addComment: async () => {
					const error = new Error('Jira rejected the comment');
					error.status = 403;
					throw error;
				}
			},
			fetchImpl: async () => new Response(JSON.stringify({ agentId: 'bc-456' }), { status: 200 })
		});

		try {
			const res = await postJson(app.baseUrl, '/api/slash-commands', qualifiedCommentPayload());
			assert.equal(res.status, 502);
			const data = await res.json();
			assert.equal(data.forwarded, true);
			assert.equal(data.acknowledged, false);
			assert.equal(data.agentId, 'bc-456');
			assert.match(data.agentUrl, /bc-456$/);
		} finally {
			await app.close();
		}
	});

	test('assignment and status webhooks never acknowledge with Jira comments', async () => {
		let calls = 0;
		const jiraCommentService = {
			addComment: async () => {
				calls += 1;
				return { status: 201 };
			}
		};
		const app = await startApp({
			jiraCommentService,
			fetchImpl: async () => new Response('{}', { status: 200 })
		});

		try {
			await postJson(app.baseUrl, '/api/assignment', loadApiRequest('body-item-assigned.json'));
			await postJson(app.baseUrl, '/api/status-changed', loadApiRequest('body-status-changed.json'));
			assert.equal(calls, 0);
		} finally {
			await app.close();
		}
	});
});
