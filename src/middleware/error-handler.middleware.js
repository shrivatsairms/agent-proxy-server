import { log } from '../utils/logger.js';

function isJiraWebhookRequest(req) {
	return (
		req.method === 'POST' &&
		/^\/api\/(?:slash-commands|assignment|status-changed)(?:\?|$)/.test(req.originalUrl)
	);
}

export function errorHandler(err, req, res, next) {
	// Delegate when another handler has already started streaming a response.
	if (res.headersSent) {
		return next(err);
	}

	log(`Unhandled error: ${err.message}`);

	if (err.type === 'entity.parse.failed') {
		if (isJiraWebhookRequest(req)) {
			// A malformed delivery cannot be processed, but must not enter Jira's retry cycle.
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
}
