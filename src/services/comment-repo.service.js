import { GITLAB_REPO_ASSIGNMENT, GITLAB_REPO_ROOT } from '../config/constants.js';

function isGitLabProjectRoot(repoUrl) {
	// `/-/` is GitLab's UI path for trees, blobs, MRs, and issues — not a project root.
	if (repoUrl.includes('/-/') || repoUrl.includes('?') || repoUrl.includes('#')) {
		return false;
	}

	return GITLAB_REPO_ROOT.test(repoUrl);
}

function extractRepoName(repoUrl) {
	const withoutSlash = repoUrl.replace(/\/+$/, '');
	const withoutGit = withoutSlash.replace(/\.git$/i, '');
	const segments = withoutGit.split('/');
	return segments[segments.length - 1] || '';
}

export function parseCommentRepo(commentBody) {
	if (typeof commentBody !== 'string') {
		return { ok: false, reason: 'comment missing repo=https://gitlab.com/...' };
	}

	const match = commentBody.match(GITLAB_REPO_ASSIGNMENT);
	if (!match) {
		return { ok: false, reason: 'comment missing repo=https://gitlab.com/...' };
	}

	const repoUrl = match[1];
	if (!isGitLabProjectRoot(repoUrl)) {
		return { ok: false, reason: 'repo URL is not a GitLab repository root' };
	}

	const repoName = extractRepoName(repoUrl);
	if (!repoName) {
		return { ok: false, reason: 'repo URL is not a GitLab repository root' };
	}

	return { ok: true, repoUrl, repoName };
}
