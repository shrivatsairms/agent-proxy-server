import { log } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
	if (res.headersSent) {
		return next(err);
	}

	log(`Unhandled error: ${err.message}`);

	if (err.type === 'entity.parse.failed') {
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
