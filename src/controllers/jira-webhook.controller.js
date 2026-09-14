import {
	classifyAssignment,
	classifySlashCommand,
	classifyStatusChanged
} from '../services/event-classifier.service.js';
import { invokeCursorAutomation } from '../services/cursor-automation.service.js';
import { buildCursorPayload, extractIssueKey, extractProject } from '../factories/cursor-payload.factory.js';
import { buildFailureComment, buildSuccessComment } from '../factories/jira-comment.factory.js';
import { CURSOR_AGENT_BASE_URL, DEFAULT_CURSOR_TIMEOUT_MS, TRIGGERS } from '../config/constants.js';
import { log } from '../utils/logger.js';

function timeoutMs() {
	const parsed = Number(process.env.CURSOR_REQUEST_TIMEOUT_MS);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CURSOR_TIMEOUT_MS;
}

function skipped(res, reason) {
	log(`No automation invoked`);
	// A valid but irrelevant Jira event is acknowledged so Jira need not retry it.
	return res.status(202).json({
		forwarded: false,
		reason
	});
}

function acknowledgementError(error) {
	return error.status ? `${error.message} (status: ${error.status})` : error.message;
}

async function acknowledgeFailure(jiraCommentService, issueKey, author, description, status) {
	if (!author?.accountId || !author?.displayName) {
		throw new Error('Webhook comment author is missing');
	}

	log(`Posting error acknowledgement to Jira ticket ${issueKey}`);
	const result = await jiraCommentService.addComment({
		issueKey,
		body: buildFailureComment(author, description, status)
	});
	log(`Error acknowledgement posted to Jira ticket ${issueKey}: ${result.status}`);
}

async function acknowledgeSuccess(jiraCommentService, issueKey, author, agentUrl) {
	if (!author?.accountId || !author?.displayName) {
		throw new Error('Webhook comment author is missing');
	}

	log(`Posting success acknowledgement to Jira ticket ${issueKey}`);
	const result = await jiraCommentService.addComment({
		issueKey,
		body: buildSuccessComment(author, agentUrl)
	});
	log(`Success acknowledgement posted to Jira ticket ${issueKey}: ${result.status}`);
}

async function forwardToCursor({
	res,
	body,
	issueKey,
	classification,
	mapping,
	payload,
	fetchImpl,
	jiraCommentService
}) {
	const isSlashCommand = classification.trigger === TRIGGERS.COMMENT_COMMAND;
	const author = body.comment?.author;

	try {
		const result = await invokeCursorAutomation({
			fetchImpl,
			mapping,
			payload,
			timeoutMs: timeoutMs()
		});

		log(`Automation ${mapping.automationId} responded ${result.status}`);

		if (!result.ok) {
			const description = `Cursor automation responded with status ${result.status}`;
			return respondToCursorFailure({
				res,
				jiraCommentService,
				isSlashCommand,
				issueKey,
				author,
				description,
				status: result.status,
				automationId: mapping.automationId
			});
		}

		if (!isSlashCommand) {
			return res.status(200).json({
				forwarded: true,
				automationId: mapping.automationId,
				status: result.status,
				data: result.data
			});
		}

		const agentId = result.data?.backgroundComposerId;
		
		if (!agentId) {
			return respondToCursorFailure({
				res,
				jiraCommentService,
				isSlashCommand,
				issueKey,
				author,
				description: 'Cursor automation response did not include an agent ID',
				status: result.status,
				automationId: mapping.automationId
			});
		}

		const agentUrl = `${CURSOR_AGENT_BASE_URL}/${encodeURIComponent(agentId)}`;
		log(`Automation ${mapping.automationId} started agent ${agentId}`);

		try {
			await acknowledgeSuccess(jiraCommentService, issueKey, author, agentUrl);
			return res.status(200).json({
				forwarded: true,
				acknowledged: true,
				automationId: mapping.automationId,
				agentId,
				agentUrl,
				status: result.status
			});
		} catch (error) {
			log(`Failed to post success acknowledgement: ${acknowledgementError(error)}`);
			return res.status(502).json({
				forwarded: true,
				acknowledged: false,
				automationId: mapping.automationId,
				agentId,
				agentUrl,
				error: 'Agent started but Jira acknowledgement failed',
				details: acknowledgementError(error)
			});
		}
	} catch (error) {
		// AbortController reports timeouts as AbortError; expose a clearer operator message.
		const message = error.name === 'AbortError' ? 'request timed out' : error.message;
		log(`Failed to invoke automation ${mapping.automationId}: ${message}`);
		return respondToCursorFailure({
			res,
			jiraCommentService,
			isSlashCommand,
			issueKey,
			author,
			description: message,
			automationId: mapping.automationId
		});
	}
}

async function respondToCursorFailure({
	res,
	jiraCommentService,
	isSlashCommand,
	issueKey,
	author,
	description,
	status,
	automationId
}) {
	if (!isSlashCommand) {
		return res.status(502).json({
			forwarded: false,
			automationId,
			status,
			error: 'Bad Gateway',
			details: description
		});
	}

	try {
		await acknowledgeFailure(jiraCommentService, issueKey, author, description, status);
		return res.status(502).json({
			forwarded: false,
			acknowledged: true,
			automationId,
			status,
			error: 'Bad Gateway',
			details: description
		});
	} catch (error) {
		log(`Failed to post error acknowledgement: ${acknowledgementError(error)}`);
		return res.status(502).json({
			forwarded: false,
			acknowledged: false,
			automationId,
			status,
			error: 'Bad Gateway',
			details: description,
			acknowledgementError: acknowledgementError(error)
		});
	}
}

export function createJiraWebhookController({ fetchImpl, mappingService, jiraCommentService }) {
	// All webhook routes share orchestration while supplying their own classifier.
	async function handle(req, res, classifier, jiraCommentService) {
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
				if (classification.trigger === TRIGGERS.COMMENT_COMMAND) {
					await acknowledgeFailure(jiraCommentService, issueKey, body.comment?.author, reason);
				}
				return skipped(res, reason);
			}

			log(`Invoking automation ${mapping.automationId}`);

			const payload = buildCursorPayload({
				body,
				query,
				trigger: classification.trigger
			});

			return forwardToCursor({
				res,
				body,
				issueKey,
				classification,
				mapping,
				payload,
				fetchImpl,
				jiraCommentService
			});
		} catch (error) {
			log(`Unhandled error: ${error.message}`);
			return res.status(500).json({
				error: 'Internal Server Error',
				message: error.message
			});
		}
	}

	return {
		slashCommands: (req, res) => handle(req, res, classifySlashCommand, jiraCommentService),
		assignment: (req, res) => handle(req, res, classifyAssignment, jiraCommentService),
		statusChanged: (req, res) => handle(req, res, classifyStatusChanged, jiraCommentService)
	};
}
