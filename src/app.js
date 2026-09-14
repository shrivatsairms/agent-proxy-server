import express from 'express';
import { createJiraWebhookRouter } from './routes/jira-webhook.routes.js';
import { createProjectMappingService } from './services/project-mapping.service.js';
import { createJiraCommentService } from './services/jira-comment.service.js';
import { errorHandler } from './middleware/error-handler.middleware.js';

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

	const app = express();
	app.use(express.json());

	app.get('/health', (req, res) => {
		res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
	});

	app.use('/api', createJiraWebhookRouter({ fetchImpl, mappingService, jiraCommentService }));
	app.use(errorHandler);

	return app;
}
