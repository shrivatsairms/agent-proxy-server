import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

export const TPAS_MAPPING = {
	projectId: '16842',
	projectKey: 'TPAS',
	automationId: 'abcd',
	automationWebhookUrl: 'https://api.sh2.cursor.com/v1/abcd',
	automationBearerToken: 'crsr_123'
};

export function loadApiRequest(fileName) {
	const url = new URL(`../api-requests/${fileName}`, import.meta.url);
	return JSON.parse(readFileSync(url, 'utf8'));
}

export function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

export function qualifiedCommentPayload() {
	const payload = clone(loadApiRequest('body-comment-added.json'));
	payload.comment.body = 'Please pick this up /cursor-coding-agent';
	return payload;
}

export async function startApp({ fetchImpl, mappings = [TPAS_MAPPING] } = {}) {
	const mockFetch =
		fetchImpl ||
		(async () =>
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}));

	const app = createApp({
		fetch: (...args) => mockFetch(...args),
		mappings
	});

	const server = await new Promise((resolve) => {
		const instance = app.listen(0, () => resolve(instance));
	});

	const { port } = server.address();

	return {
		server,
		baseUrl: `http://localhost:${port}`,
		close: () => new Promise((resolve) => server.close(resolve))
	};
}
