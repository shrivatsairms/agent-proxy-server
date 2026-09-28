import { JIRA_SIGNATURE_HEADER } from '../config/constants.js';
import { verifyJiraWebhookSignature } from '../services/webhook-signature.service.js';
import { log } from '../utils/logger.js';

function isJiraWebhookRequest(req) {
	return (
		req.method === 'POST' &&
		/^\/api\/(?:slash-commands|assignment|status-changed)(?:\?|$)/.test(req.originalUrl)
	);
}

export function errorHandler({ webhookSecret } = {}) {
	
	// An error handling middleware function
	return function handleError(err, req, res, next) {
		// Delegate when another handler has already started streaming a response.
		if (res.headersSent) {
			return next(err);
		}

		log(`Unhandled error: ${err.message}`);

		if (err.type === 'entity.parse.failed') {
			if (isJiraWebhookRequest(req)) {
				const signature = verifyJiraWebhookSignature({
					rawBody: req.rawBody,
					signatureHeader: req.headers[JIRA_SIGNATURE_HEADER],
					webhookSecret
				});

				if (!signature.ok) {
					log(`Webhook signature rejected: ${signature.reason}`);
					return res.status(signature.status).json({ error: signature.reason });
				}

				// Signed but unusable JSON cannot be processed; do not trigger Jira retries.
				return res.status(200).json({ accepted: true });
			}

			return res.status(400).json({
				error: 'Bad Request',
				message: 'Invalid JSON body'
			});
		}

		return res.status(500).json({
			error: 'Internal Server Error',
			message: err.message
		});
	};
}
