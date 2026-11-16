import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={`markdown${streaming ? ' caret' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
