import { Router } from 'express';
import { createJiraWebhookController } from '../controllers/jira-webhook.controller.js';

export function createJiraWebhookRouter({ fetchImpl, mappingService }) {
	const router = Router();
	const controller = createJiraWebhookController({ fetchImpl, mappingService });

	router.post('/slash-commands', controller.slashCommands);
	router.post('/assignment', controller.assignment);
	router.post('/status-changed', controller.statusChanged);

	return router;
}
