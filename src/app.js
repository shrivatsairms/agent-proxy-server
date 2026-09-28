import express from 'express';
import { createJiraWebhookRouter } from './routes/jira-webhook.routes.js';
import { createProjectMappingService } from './services/project-mapping.service.js';
import { createJiraCommentService } from './services/jira-comment.service.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import { createWebhookRateLimiter } from './middleware/rate-limit.middleware.js';
import { createWebhookSignatureMiddleware } from './middleware/webhook-signature.middleware.js';

/* Configures the app using the configuration `options` passed in the index.js (app's entry point) */
export function createApp(options = {}) {
	// Dependency injection keeps outbound calls and project mappings replaceable in tests.
	const fetchImpl = options.fetch || globalThis.fetch;
	const mappingService =
		options.mappingService ||
		createProjectMappingService({
			filePath: options.mappingFilePath,
			records: options.mappings
		});

	const jiraCommentService =
		options.jiraCommentService ||
		createJiraCommentService({ fetchImpl: options.jiraFetch || globalThis.fetch });

	const webhookSecret = options.webhookSecret ?? process.env.JIRA_WEBHOOK_SECRET;

	// Creating an Express App object to configure the middlewares
	const app = express();

	// HMAC must hash the exact bytes Jira sent; parsed JSON cannot be re-serialized.
	app.use(
		express.json({
			verify: (req, _res, buf) => {
				req.rawBody = buf;
			}
		})
	);

	// An endpoint to check app's health i.e. check wether an app in running or not
	// GET /health
	app.get('/health', (req, res) => {
		res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
	});

	app.use('/api', createWebhookRateLimiter(options.rateLimit)); 
	app.use('/api', createWebhookSignatureMiddleware({ webhookSecret }));
	app.use('/api', createJiraWebhookRouter({ fetchImpl, mappingService, jiraCommentService }));
	app.use(errorHandler({ webhookSecret }));

	return app;
}
