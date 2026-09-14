import { DEFAULT_JIRA_TIMEOUT_MS } from '../config/constants.js';

function getConfiguration(env) {
	return {
		baseUrl: env.JIRA_BASE_URL?.replace(/\/$/, ''),
		email: env.JIRA_EMAIL,
		apiToken: env.JIRA_API_TOKEN
	};
}

function basicAuthorization(email, apiToken) {
	return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
}

function responseMessage(responseData, fallback) {
	if (typeof responseData === 'object' && responseData !== null) {
		return responseData.errorMessages?.[0] || fallback;
	}

	return fallback;
}

export function createJiraCommentService({
	fetchImpl = globalThis.fetch,
	env = process.env,
	timeoutMs = DEFAULT_JIRA_TIMEOUT_MS
} = {}) {
	async function addComment({ issueKey, body }) {
		const { baseUrl, email, apiToken } = getConfiguration(env);

		if (!baseUrl || !email || !apiToken) {
			throw new Error('Jira comment configuration is missing');
		}

		const controller = new AbortController();
		// Do not let a failed acknowledgement keep Jira's webhook request open indefinitely.
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetchImpl(
				`${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
				{
					method: 'POST',
					headers: {
						Authorization: basicAuthorization(email, apiToken),
						'Content-Type': 'application/json',
						Accept: 'application/json'
					},
					body: JSON.stringify({ body }),
					signal: controller.signal
				}
			);

			if (response.ok) {
				return { status: response.status };
			}

			let responseData;
			try {
				responseData = await response.json();
			} catch {
				responseData = null;
			}

			const error = new Error(responseMessage(responseData, 'Jira rejected the acknowledgement comment'));
			error.status = response.status;
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	return { addComment };
}
