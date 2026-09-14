import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFailureComment, buildSuccessComment } from '../src/factories/jira-comment.factory.js';
import { createJiraCommentService } from '../src/services/jira-comment.service.js';

const author = {
	accountId: 'account-123',
	displayName: 'Jane Doe'
};

describe('Jira acknowledgement comments', () => {
	test('builds an ADF success comment with a mention and agent link', () => {
		const agentUrl = 'https://cursor.com/t/example/agents/agent-123';
		const body = buildSuccessComment(author, agentUrl);
		const content = body.content[0].content;

		assert.equal(content[0].type, 'mention');
		assert.equal(content[0].attrs.id, 'account-123');
		assert.equal(content[0].attrs.text, '@Jane Doe');
		assert.equal(content[2].marks[0].attrs.href, agentUrl);
	});

	test('builds an ADF failure comment with the supplied status', () => {
		const body = buildFailureComment(author, 'request timed out', 504);
		assert.match(body.content[0].content[1].text, /request timed out \(status: 504\)/);
	});

	test('posts ADF comments using Jira Basic authentication', async () => {
		let capturedUrl;
		let capturedOptions;
		const service = createJiraCommentService({
			env: {
				JIRA_BASE_URL: 'https://example.atlassian.net/',
				JIRA_EMAIL: 'bot@example.com',
				JIRA_API_TOKEN: 'jira-token'
			},
			fetchImpl: async (url, options) => {
				capturedUrl = url;
				capturedOptions = options;
				return new Response('{}', { status: 201 });
			}
		});

		const result = await service.addComment({
			issueKey: 'TPAS-284',
			body: buildSuccessComment(author, 'https://cursor.com/t/example/agents/agent-123')
		});

		assert.equal(result.status, 201);
		assert.equal(capturedUrl, 'https://example.atlassian.net/rest/api/3/issue/TPAS-284/comment');
		assert.equal(
			capturedOptions.headers.Authorization,
			`Basic ${Buffer.from('bot@example.com:jira-token').toString('base64')}`
		);
	});

	test('rejects comments when Jira configuration is missing', async () => {
		const service = createJiraCommentService({ env: {} });

		await assert.rejects(
			service.addComment({ issueKey: 'TPAS-284', body: buildFailureComment(author, 'failure') }),
			/Jira comment configuration is missing/
		);
	});
});
