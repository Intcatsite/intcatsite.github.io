// Direct-from-browser GitHub REST API client using a user-supplied personal
// access token (kept in localStorage — same client-side trust model as the
// LLM provider keys). Used to list/create repos and push generated files.

const API = 'https://api.github.com';

async function gh(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

function encodePath(path) {
  return path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

function toBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export async function getCurrentUser(token) {
  return gh(token, '/user');
}

export async function listRepos(token) {
  return gh(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator');
}

export async function createRepo(token, name, isPrivate = true) {
  return gh(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name, private: isPrivate, auto_init: true }),
  });
}

async function getFileSha(token, owner, repo, path, branch) {
  try {
    const q = branch ? `?ref=${encodeURIComponent(branch)}` : '';
    const existing = await gh(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}${q}`);
    return existing.sha;
  } catch {
    return undefined;
  }
}

export async function pushFile(token, owner, repo, path, content, message, branch) {
  const sha = await getFileSha(token, owner, repo, path, branch);
  return gh(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64Utf8(content),
      sha,
      branch: branch || undefined,
    }),
  });
}

export async function pushFiles(token, owner, repo, files, message, branch, onProgress) {
  for (const f of files) {
    await pushFile(token, owner, repo, f.path, f.content, message, branch);
    onProgress?.(f.path);
  }
}
