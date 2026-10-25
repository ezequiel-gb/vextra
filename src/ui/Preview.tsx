import { useState } from "react";
import Markdown from "react-markdown";
export function Preview({ text }: { text: string }) {
  const [source, setSource] = useState(false),
    [limit, setLimit] = useState(20000);
  let end = text.lastIndexOf("\n\n", limit);
  if (end < 0 || text.length <= limit) end = Math.min(limit, text.length);
  const shown = text.slice(0, end);
  return (
    <section className="preview" aria-label="Document preview">
      <div className="row">
        <h2 className="grow">Document preview</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={source}
            onChange={(e) => setSource(e.target.checked)}
          />
          Markdown source
        </label>
      </div>
      {source ? (
        <pre className="code">{shown}</pre>
      ) : (
        <Markdown
          skipHtml
          components={{
            a: ({ href, children }) =>
              href && /^https:\/\//i.test(href) ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
            img: () => null,
          }}
        >
          {shown}
        </Markdown>
      )}
      {end < text.length && (
        <button onClick={() => setLimit(limit + 20000)}>
          Show more of the document ({Math.round((end / text.length) * 100)}%
          shown)
        </button>
      )}
    </section>
  );
}
