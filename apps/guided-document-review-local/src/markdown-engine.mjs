import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: true,
});

export function markdownToSafeHtml(source) {
  return markdown.render(source);
}
