import { DEFAULT_CURSOR_TIMEOUT_MS } from '../config/constants.js';

function bearerHeader(token) {
	if (!token) {
		return '';
	}

	return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

export async function invokeCursorAutomation({
	fetchImpl,
	mapping,
	payload,
	timeoutMs = DEFAULT_CURSOR_TIMEOUT_MS
}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchImpl(mapping.automationWebhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: bearerHeader(mapping.automationBearerToken)
			},
			body: JSON.stringify(payload),
			signal: controller.signal
		});

		const responseText = await response.text();
		let responseData;
		try {
			responseData = JSON.parse(responseText);
		} catch {
			responseData = responseText;
		}

		return {
			ok: response.ok,
			status: response.status,
			data: responseData
		};
	} finally {
		clearTimeout(timeout);
	}
}
