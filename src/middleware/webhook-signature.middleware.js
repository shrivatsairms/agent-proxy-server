import { JIRA_SIGNATURE_HEADER } from '../config/constants.js';
import { verifyJiraWebhookSignature } from '../services/webhook-signature.service.js';
import { log } from '../utils/logger.js';

export function createWebhookSignatureMiddleware({ webhookSecret } = {}) {
	return function verifyWebhookSignature(req, res, next) {
		const result = verifyJiraWebhookSignature({
			rawBody: req.rawBody,
			signatureHeader: req.headers[JIRA_SIGNATURE_HEADER],
			webhookSecret
		});

		if (!result.ok) {
			log(`Webhook signature rejected: ${result.reason}`);
			return res.status(result.status).json({ error: result.reason });
		}

		return next();
	};
}
