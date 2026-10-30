const COMMENT_LIMIT = 2000;
const PROMPT_LIMIT = 8000;

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function buildReviewCommentPrompt(input: {
  repo: string;
  number: number;
  path: string;
  line: number | null;
  comments: { author: string; body: string }[];
}): string {
  const lines = [
    `Address this review comment on ${input.repo} PR #${input.number}.`,
  ];
  const path = input.path.trim();
  if (path) {
    lines.push(`File: ${input.line != null ? `${path}:${input.line}` : path}`);
  }
  lines.push("");
  for (const comment of input.comments) {
    const body = clip(comment.body.trim(), COMMENT_LIMIT);
    lines.push(`${comment.author}: ${body}`);
  }
  lines.push(
    "",
    "Make the change in this project, then summarize what you changed. Don't reply on GitHub.",
  );
  return clip(lines.join("\n"), PROMPT_LIMIT);
}
