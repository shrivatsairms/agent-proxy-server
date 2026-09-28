import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { computeJiraSignature } from '../src/services/webhook-signature.service.js';

export const TEST_WEBHOOK_SECRET = 'test-jira-webhook-secret';

export const TPAS_MAPPING = {
	projectId: '16842',
	projectKey: 'TPAS',
	automationId: 'abcd',
	automationWebhookUrl: 'https://api.sh2.cursor.com/v1/abcd',
	automationBearerToken: 'crsr_123',
	pool: {
		name: 'sandbox',
		repos: ['calculator-app', 'todo-app']
	}
};

export const QUALIFIED_REPO_URL = 'https://gitlab.com/org/calculator-app';

export function loadApiRequest(fileName) {
	const url = new URL(`../api-requests/${fileName}`, import.meta.url);
	return JSON.parse(readFileSync(url, 'utf8'));
}

export function clone(value) {
	// Fixtures contain JSON-only data, so serialization provides a safe deep copy.
	return JSON.parse(JSON.stringify(value));
}

export function qualifiedCommentPayload() {
	const payload = clone(loadApiRequest('body-comment-added.json'));
	payload.comment.body = `Please pick this up /cursor-coding-agent repo=${QUALIFIED_REPO_URL}`;
	return payload;
}

export function signWebhookBody(body, webhookSecret = TEST_WEBHOOK_SECRET) {
	const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
	return {
		rawBody,
		signature: computeJiraSignature(rawBody, webhookSecret)
	};
}

export async function startApp({
	fetchImpl,
	jiraCommentService,
	mappings = [TPAS_MAPPING],
	webhookSecret = TEST_WEBHOOK_SECRET,
	rateLimit
} = {}) {
	const mockFetch =
		fetchImpl ||
		(async () =>
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}));

	const app = createApp({
		fetch: (...args) => mockFetch(...args),
		jiraCommentService,
		mappings,
		webhookSecret,
		rateLimit
	});

	const server = await new Promise((resolve) => {
		// Port zero lets the OS isolate concurrently running test processes.
		const instance = app.listen(0, () => resolve(instance));
	});

	const { port } = server.address();

	return {
		server,
		baseUrl: `http://localhost:${port}`,
		close: () => new Promise((resolve) => server.close(resolve))
	};
}
