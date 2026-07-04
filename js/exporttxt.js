// Exports a chat transcript to a plain .txt file, formatted as
// "AI: ..." / "User: ..." lines, one block per message.

export function chatToText(chat) {
  const lines = [];
  for (const msg of chat.messages) {
    if (msg.role === 'system') continue;
    const speaker = msg.role === 'assistant' ? 'AI' : 'User';
    lines.push(`${speaker}: ${msg.content}`);
  }
  return lines.join('\n\n');
}

export function downloadChatTxt(chat) {
  const text = chatToText(chat);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(chat.title || 'chat').replace(/[^\w\-А-Яа-яЁё ]/g, '_')}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
