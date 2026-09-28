import { createHmac, timingSafeEqual } from 'node:crypto';
import { JIRA_SIGNATURE_PREFIX } from '../config/constants.js';

export function computeJiraSignature(rawBody, webhookSecret) {
	const hmac = createHmac('sha256', webhookSecret);
	hmac.update(rawBody);
	const expectedSignature = `${JIRA_SIGNATURE_PREFIX}${hmac.digest('hex')}`;
	return expectedSignature;
}

function isSignatureAuthentic(receivedSignature, expectedSignature) {
	if (receivedSignature.length !== expectedSignature.length) {
		// Dummy compare keeps the failure path from leaking expected-digest length.
		timingSafeEqual(receivedSignature, receivedSignature);
		return false;
	}

	return timingSafeEqual(receivedSignature, expectedSignature);
}

export function verifyJiraWebhookSignature({ rawBody, signatureHeader, webhookSecret }) {
	if (!webhookSecret) {
		return { ok: false, status: 401, reason: 'Webhook secret is not configured' };
	}

	/* Check if the HMAC signature is missing from the header or is not a valid string */
	if (!signatureHeader || typeof signatureHeader !== 'string') {
		return { ok: false, status: 401, reason: 'Missing signature header' };
	}

	/* Check if the signature starts with string 'sha256=' */ 
	if (!signatureHeader.startsWith(JIRA_SIGNATURE_PREFIX)) {
		return { ok: false, status: 403, reason: 'Invalid payload signature' };
	}

	const expected = computeJiraSignature(rawBody || Buffer.alloc(0), webhookSecret);
	const authentic = isSignatureAuthentic(Buffer.from(signatureHeader), Buffer.from(expected));

	if (!authentic) {
		return { ok: false, status: 403, reason: 'Invalid payload signature' };
	}

	return { ok: true };
}
