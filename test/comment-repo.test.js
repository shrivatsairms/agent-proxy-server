import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoNameFromJiraComment } from '../src/services/comment-repo.service.js';

describe('comment repo parser', () => {
	test('extracts a nested GitLab project root and its last-segment name', () => {
		const comment =
			'/cursor-coding-agent repo=https://gitlab.com/iron-mountain1/gto/dxp/dxp-services';
		const result = parseRepoNameFromJiraComment(comment);

		assert.deepEqual(result, {
			ok: true,
			repoUrl: 'https://gitlab.com/iron-mountain1/gto/dxp/dxp-services',
			repoName: 'dxp-services'
		});
	});

	test('strips a trailing slash and optional .git suffix from the repo name', () => {
		const result = parseRepoNameFromJiraComment(
			'/cursor-coding-agent repo=https://gitlab.com/org/calculator-app.git/'
		);
		assert.equal(result.ok, true);
		assert.equal(result.repoName, 'calculator-app');
	});

	test('extracts a GitLab URL from Jira wiki smart-link markup', () => {
		const comment =
			'/cursor-coding-agent repo=[https://gitlab.com/sashetty1/calculator-app|https://gitlab.com/sashetty1/calculator-app|smart-link]  please handle this work item.';
		const result = parseRepoNameFromJiraComment(comment);

		assert.deepEqual(result, {
			ok: true,
			repoUrl: 'https://gitlab.com/sashetty1/calculator-app',
			repoName: 'calculator-app'
		});
	});

	test('rejects comments without a repo= GitLab URL', () => {
		const result = parseRepoNameFromJiraComment('/cursor-coding-agent please start');
		assert.equal(result.ok, false);
		assert.match(result.reason, /missing repo=/);
	});

	test('rejects GitLab tree and blob paths', () => {
		const result = parseRepoNameFromJiraComment(
			'/cursor-coding-agent repo=https://gitlab.com/path/to/repo/repo-name/-/tree/v2.2.0-RELEASE'
		);
		assert.equal(result.ok, false);
		assert.match(result.reason, /repository root/);
	});
});
