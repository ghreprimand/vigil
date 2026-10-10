import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(input: string): string {
  const html = marked.parse(input) as string;
  return DOMPurify.sanitize(html);
}
