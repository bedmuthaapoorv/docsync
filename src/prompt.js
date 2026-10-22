export function buildPrompt({ repo, branch, title, mode, docId, folderId, context }) {
  return `You maintain a Google Doc that documents the git branch "${branch}" of the repository "${repo}". The commit details or branch history follow the instructions.

Document title: ${title}
Known document ID: ${docId || 'none'}
Drive folder ID for new docs: ${folderId || 'none'}
Mode: ${mode}

1. Find the doc. Use the known ID if there is one. Otherwise search Google Drive for a Google Doc whose title is exactly the document title and use it if found. If none exists, create it with Drive create_file (contentMimeType text/html, the document title, parentId only when a folder ID is given) containing an h1 with the title and h2 sections: Purpose, Overview, Changelog.
2. Mode update: read the doc with read_doc, then edit it in place with update_doc, always passing writeControl.requiredRevisionId from that read. If the revision check fails, read again and retry once. Add one entry at the top of the Changelog section for this commit: date, short hash, subject, then one to three sentences on what changed and why, and the files touched. Change Purpose or Overview only when this commit changes what they say.
3. Mode create: only make sure the doc exists. Write Purpose from the branch name and recent commits and mark it as an assumption.

Rules: change the smallest range that covers the change; never delete and rebuild the doc; leave existing text, headings and comments alone unless this commit changes them; use heading styles, not bold text, and no typed list markers; describe only what is visible below, never invent behavior. Do not use shell tools and do not touch any other file.

Final output: the doc URL on one line, then as the very last line exactly DOC_ID=<document id>.

----- CONTEXT -----
${context}
`;
}

export function parseDocId(output) {
  const matches = [...output.matchAll(/^DOC_ID=(\S+)\s*$/gm)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

export const docUrl = (id) => `https://docs.google.com/document/d/${id}/edit`;
