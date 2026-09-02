import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	classifyAssignment,
	classifySlashCommand,
	classifyStatusChanged
} from '../src/services/event-classifier.service.js';
import { TRIGGERS } from '../src/config/constants.js';
import { clone, loadApiRequest, qualifiedCommentPayload } from './helpers.js';

describe('event classifier', () => {
	test('qualifies a comment that contains /cursor-coding-agent on a Story', () => {
		const result = classifySlashCommand(qualifiedCommentPayload());
		assert.deepEqual(result, { qualified: true, trigger: TRIGGERS.COMMENT_COMMAND });
	});

	test('ignores comments without the command substring', () => {
		const payload = loadApiRequest('body-comment-added.json');
		const result = classifySlashCommand(payload);
		assert.equal(result.qualified, false);
		assert.match(result.reason, /comment missing/);
	});

	test('ignores slash-command events on disallowed issue types', () => {
		const payload = qualifiedCommentPayload();
		payload.issue.fields.issuetype.name = 'Task';
		const result = classifySlashCommand(payload);
		assert.deepEqual(result, { qualified: false, reason: 'wrong issue type' });
	});

	test('qualifies an issue updated when changelog assigns Cursor', () => {
		const payload = loadApiRequest('body-item-assigned.json');
		const result = classifyAssignment(payload);
		assert.deepEqual(result, { qualified: true, trigger: TRIGGERS.CURSOR_ASSIGNMENT });
	});

	test('qualifies an issue created and assigned to Cursor', () => {
		const payload = loadApiRequest('body-item-created-assigned.json');
		const result = classifyAssignment(payload);
		assert.deepEqual(result, { qualified: true, trigger: TRIGGERS.CURSOR_ASSIGNMENT });
	});

	test('ignores assignment when displayName is not Cursor', () => {
		const payload = clone(loadApiRequest('body-item-assigned.json'));
		payload.changelog.items[0].toString = 'Shrivatsa Shetty';
		payload.issue.fields.assignee.displayName = 'Shrivatsa Shetty';
		const result = classifyAssignment(payload);
		assert.equal(result.qualified, false);
	});

	test('finds assignee changelog when it is not the first item', () => {
		const payload = clone(loadApiRequest('body-item-assigned.json'));
		payload.changelog.items.unshift({
			field: 'summary',
			fieldId: 'summary',
			toString: 'unrelated'
		});
		const result = classifyAssignment(payload);
		assert.equal(result.qualified, true);
	});

	test('qualifies Ready for Dev when both labels are present', () => {
		const payload = loadApiRequest('body-status-changed.json');
		const result = classifyStatusChanged(payload);
		assert.deepEqual(result, { qualified: true, trigger: TRIGGERS.READY_FOR_DEV });
	});

	test('finds status changelog when it is not the first item', () => {
		const payload = clone(loadApiRequest('body-status-changed.json'));
		payload.changelog.items.unshift({
			field: 'assignee',
			fieldId: 'assignee',
			toString: 'Cursor'
		});
		const result = classifyStatusChanged(payload);
		assert.equal(result.qualified, true);
	});

	test('ignores Ready for Dev without both required labels', () => {
		const payload = clone(loadApiRequest('body-status-changed.json'));
		payload.issue.fields.labels = ['AI-Generated'];
		const result = classifyStatusChanged(payload);
		assert.deepEqual(result, { qualified: false, reason: 'missing required labels' });
	});
});
