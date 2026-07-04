// "Live Build" agentic mode: instructs the model to emit a small multi-file
// project using a simple delimited protocol, which we parse into a virtual
// file list, preview live in an iframe, and let the user download as a zip
// (mirrors "you ask for a site, it builds it and hands you a zip").

export const FILE_START = '===FILE:';
export const FILE_END = '===END===';

export const LIVEBUILD_SYSTEM_SUFFIX = `
Когда пользователь просит создать сайт, страницу или приложение — выведи каждый файл проекта в следующем формате, без исключений:

${FILE_START} путь/к/файлу.ext
<полное содержимое файла>
${FILE_END}

Можно вывести несколько файлов подряд (index.html, style.css, script.js и т.д.). Обязательно включай index.html как точку входа. Не сокращай содержимое файлов и не используй markdown-код-блоки вокруг этого формата — только чистый текст в указанном виде. После файлов можно коротко пояснить, что сделано.`;

export function parseFiles(raw) {
  const files = [];
  const re = /===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)(?:\r?\n)?===END===/g;
  let m;
  while ((m = re.exec(raw))) {
    files.push({ path: m[1].trim().replace(/^\/+/, ''), content: m[2] });
  }
  return files;
}

export function stripFileBlocks(raw) {
  return raw.replace(/===FILE:[\s\S]*?===END===/g, '').trim();
}

export function buildPreviewHtml(files) {
  const indexFile = files.find((f) => /(^|\/)index\.html$/i.test(f.path)) || files.find((f) => /\.html$/i.test(f.path));
  if (!indexFile) return null;
  let html = indexFile.content;

  html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    if (!/\.css$/i.test(href)) return match;
    const file = findByHref(files, href);
    return file ? `<style>\n${file.content}\n</style>` : match;
  });

  html = html.replace(/<script([^>]*)\ssrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, pre, src, post) => {
    if (!/\.js$/i.test(src)) return match;
    const file = findByHref(files, src);
    return file ? `<script${pre}${post}>\n${file.content}\n</script>` : match;
  });

  return html;
}

function findByHref(files, href) {
  const clean = href.replace(/^\.?\//, '');
  return files.find((f) => f.path === clean || f.path.endsWith(`/${clean}`));
}

export async function downloadZip(files, zipName = 'deeps-site.zip') {
  if (!window.JSZip) throw new Error('JSZip не загрузился — проверь подключение к сети.');
  const zip = new window.JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
