import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const SAFE_PROTOCOLS = ["http", "https", "mailto"];

const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: SAFE_PROTOCOLS, src: ["http", "https"] },
};

/** Report text comes from model output and third-party news; render it inert. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="t3">[图片：{alt || "未命名"}]</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
