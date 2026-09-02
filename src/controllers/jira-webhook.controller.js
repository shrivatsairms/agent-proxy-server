import {
	classifyAssignment,
	classifySlashCommand,
	classifyStatusChanged
} from '../services/event-classifier.service.js';
import { invokeCursorAutomation } from '../services/cursor-automation.service.js';
import { buildCursorPayload, extractIssueKey, extractProject } from '../factories/cursor-payload.factory.js';
import { DEFAULT_CURSOR_TIMEOUT_MS } from '../config/constants.js';
import { log } from '../utils/logger.js';

function timeoutMs() {
	const parsed = Number(process.env.CURSOR_REQUEST_TIMEOUT_MS);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CURSOR_TIMEOUT_MS;
}

function skipped(res, reason) {
	log(`No automation invoked`);
	return res.status(202).json({
		forwarded: false,
		reason
	});
}

export function createJiraWebhookController({ fetchImpl, mappingService }) {
	async function handle(req, res, classifier) {
		try {
			const endpoint = `${req.baseUrl}${req.path}`;
			log(`Jira webhook received for endpoint ${endpoint}`);

			const body = req.body || {};
			const query = req.query || {};
			const issueKey = extractIssueKey(body, query);
			const project = extractProject(body, query);

			log(`Jira ticket-id ${issueKey}${project.projectKey ? ` project ${project.projectKey}` : ''}`);

			const classification = classifier(body);
			if (!classification.qualified) {
				log(`Event ignored: ${classification.reason}`);
				return skipped(res, classification.reason);
			}

			log(`Event qualified as ${classification.trigger}`);

			const mapping = mappingService.find(project);
			if (!mapping) {
				const reason = `No automation mapping for project ${project.projectKey || project.projectId || 'unknown'}`;
				log(reason);
				return skipped(res, reason);
			}

			log(`Invoking automation ${mapping.automationId}`);

			const payload = buildCursorPayload({
				body,
				query,
				trigger: classification.trigger
			});

			try {
				const result = await invokeCursorAutomation({
					fetchImpl,
					mapping,
					payload,
					timeoutMs: timeoutMs()
				});

				log(`Automation ${mapping.automationId} responded ${result.status}`);

				return res.status(result.ok ? 200 : result.status).json({
					forwarded: result.ok,
					automationId: mapping.automationId,
					status: result.status,
					data: result.data
				});
			} catch (error) {
				const message = error.name === 'AbortError' ? 'request timed out' : error.message;
				log(`Failed to invoke automation ${mapping.automationId}: ${message}`);
				return res.status(502).json({
					error: 'Bad Gateway',
					message: 'Failed to communicate with Cursor webhook service.',
					details: message
				});
			}
		} catch (error) {
			log(`Unhandled error: ${error.message}`);
			return res.status(500).json({
				error: 'Internal Server Error',
				message: error.message
			});
		}
	}

	return {
		slashCommands: (req, res) => handle(req, res, classifySlashCommand),
		assignment: (req, res) => handle(req, res, classifyAssignment),
		statusChanged: (req, res) => handle(req, res, classifyStatusChanged)
	};
}
