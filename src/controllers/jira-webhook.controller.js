import {
	classifyAssignment,
	qualifySlashCommand,
	classifyStatusChanged
} from '../services/event-classifier.service.js';
import { invokeCursorAutomation } from '../services/cursor-automation.service.js';
import { parseRepoNameFromJiraComment } from '../services/comment-repo.service.js';
import { buildCursorPayload, extractIssueKey, extractProject } from '../factories/cursor-payload.factory.js';
import { buildFailureComment, buildSuccessComment } from '../factories/jira-comment.factory.js';
import { CURSOR_AGENT_BASE_URL, DEFAULT_CURSOR_TIMEOUT_MS, TRIGGERS } from '../config/constants.js';
import { log } from '../utils/logger.js';

function timeoutMs() {
	const parsed = Number(process.env.CURSOR_REQUEST_TIMEOUT_MS);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CURSOR_TIMEOUT_MS;
}

function skipped(reason) {
	log(`No automation invoked`);
	log(`Event processing skipped: ${reason}`);
}

function acknowledgementError(error) {
	return error.status ? `${error.message} (status: ${error.status})` : error.message;
}

function getWebhookAuthor(body) {
	// Issue events have no comment author; Jira's event actor is the notification recipient.
	return body.comment?.author || body.user;
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

async function acknowledgeCursorFailure({ jiraCommentService, issueKey, author, description, status }) {
	try {
		await acknowledgeFailure(jiraCommentService, issueKey, author, description, status);
	} catch (error) {
		log(`Failed to post error acknowledgement: ${acknowledgementError(error)}`);
	}
}

async function forwardToCursor({
	body,
	issueKey,
	classification,
	mapping,
	payload,
	fetchImpl,
	jiraCommentService
}) {
	const isSlashCommand = classification.trigger === TRIGGERS.COMMENT_COMMAND;
	const author = getWebhookAuthor(body);

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
			await acknowledgeCursorFailure({
				jiraCommentService,
				issueKey,
				author,
				description,
				status: result.status
			});
			return;
		}

		if (!isSlashCommand) {
			return;
		}

		// extracting the Id of the agent that started the run
		const agentId = result.data?.backgroundComposerId;
		if (!agentId) {
			await acknowledgeCursorFailure({
				jiraCommentService,
				issueKey,
				author,
				description: 'Cursor automation response did not include an agent ID',
				status: result.status
			});
			return;
		}

		const agentUrl = `${CURSOR_AGENT_BASE_URL}/${encodeURIComponent(agentId)}`;
		log(`Automation ${mapping.automationId} started agent ${agentId}`);

		try {
			await acknowledgeSuccess(jiraCommentService, issueKey, author, agentUrl);
		} catch (error) {
			log(`Failed to post success acknowledgement: ${acknowledgementError(error)}`);
		}
	} catch (error) {
		// AbortController reports timeouts as AbortError; expose a clearer operator message.
		const message = error.name === 'AbortError' ? 'request timed out' : error.message;
		log(`Failed to invoke automation ${mapping.automationId}: ${message}`);
		await acknowledgeCursorFailure({
			jiraCommentService,
			issueKey,
			author,
			description: message
		});
	}
}

export function createJiraWebhookController({ fetchImpl, mappingService, jiraCommentService }) {
	// Detached processing makes downstream failures invisible to Jira's delivery protocol.
	async function processWebhook(body, query, qualifier) {
		try {
			const issueKey = extractIssueKey(body, query);
			const project = extractProject(body, query);

			log(`Jira ticket-id ${issueKey}${project.projectKey ? ` project ${project.projectKey}` : ''}`);

			const qualification = qualifier(body);

			if (!qualification.qualified) {
				log(`Event ignored: ${qualification.reason}`);
				return skipped(qualification.reason);
			}

			log(`Event qualified as ${qualification.trigger}`);

			const isSlashCommand = qualification.trigger === TRIGGERS.COMMENT_COMMAND;
			let mapping;
			let repoUrl;
			let repoName;

			if (isSlashCommand) {
				const parsedRepo = parseRepoNameFromJiraComment(body.comment?.body);
				if (!parsedRepo.ok) {
					log(`Event ignored: ${parsedRepo.reason}`);
					await acknowledgeFailure(
						jiraCommentService,
						issueKey,
						getWebhookAuthor(body),
						parsedRepo.reason
					);
					return skipped(parsedRepo.reason);
				}

				repoUrl = parsedRepo.repoUrl;
				repoName = parsedRepo.repoName;
				log(`Jira comment repo ${repoName}`);
				mapping = mappingService.findByRepoName(repoName);
				if (!mapping) {
					const reason = `No automation mapping for repo ${repoName}`;
					log(reason);
					await acknowledgeFailure(jiraCommentService, issueKey, getWebhookAuthor(body), reason);
					return skipped(reason);
				}

				log(`Invoking automation ${mapping.automationId} for pool ${mapping.pool.name || 'unknown'}`);
			} else {
				mapping = mappingService.find(project);
				if (!mapping) {
					const reason = `No automation mapping for project ${project.projectKey || project.projectId || 'unknown'}`;
					log(reason);
					return skipped(reason);
				}

				log(`Invoking automation ${mapping.automationId}`);
			}

			const payload = buildCursorPayload({
				body,
				query,
				trigger: qualification.trigger,
				repoUrl,
				repoName
			});

			return forwardToCursor({
				body,
				issueKey,
				classification: qualification,
				mapping,
				payload,
				fetchImpl,
				jiraCommentService
			});
		} catch (error) {
			log(`Unhandled error: ${error.message}`);
		}
	}

	/* The top level function that will handle the HTTP requests from the Jira WebHook */
	function handleRequest(req, res, qualifier) {
		const endpoint = `${req.baseUrl}${req.path}`;
		log(`Jira webhook received for endpoint ${endpoint}`);

		/* We send a 200 OK response to Jira Webhook immediately before even processing the request,
		 * We do this because if we encounter an error while processing and send an ERROR response(like 400 or 500),
		 * Jira Webhook will try to resend the request again and again, this leads to unnecessary invocation of automations */
		res.status(200).json({ accepted: true });

		void processWebhook(req.body || {}, req.query || {}, qualifier);
	}

	return {
		slashCommands: (req, res) => handleRequest(req, res, qualifySlashCommand),
		assignment: (req, res) => handleRequest(req, res, classifyAssignment),
		statusChanged: (req, res) => handleRequest(req, res, classifyStatusChanged)
	};
}
