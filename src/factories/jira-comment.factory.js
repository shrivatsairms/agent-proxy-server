function mention(author) {
	// Jira renders a real user tag only when the ADF mention includes the account ID.
	return {
		type: 'mention',
		attrs: {
			id: author.accountId,
			text: `@${author.displayName}`
		}
	};
}

function text(value, marks) {
	const node = { type: 'text', text: value };

	if (marks) {
		node.marks = marks;
	}

	return node;
}

function documentWith(content) {
	return {
		version: 1,
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content
			}
		]
	};
}

export function buildSuccessComment(author, agentUrl) {
	return documentWith([
		mention(author),
		text(' Agent successfully started and can be viewed by visiting the following URL: '),
		text(agentUrl, [{ type: 'link', attrs: { href: agentUrl } }])
	]);
}

export function buildFailureComment(author, description, status) {
	const statusText = status ? ` (status: ${status})` : '';

	return documentWith([
		mention(author),
		text(` An error occurred while starting the agent: ${description}${statusText}.`)
	]);
}
