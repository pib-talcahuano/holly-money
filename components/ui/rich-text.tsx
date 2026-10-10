import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import { cn } from "@/lib/utils"

export const richTextClassName =
  "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold break-words"

const ALLOWED_ELEMENTS = ["p", "br", "strong", "em", "ul", "ol", "li", "a"]

// Comments are stored as Markdown. react-markdown never renders raw HTML and
// drops unsafe URL schemes, so no extra sanitizer is needed. Legacy plain-text
// comments render as-is; `remark-breaks` keeps their single newlines.
export function RichText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(richTextClassName, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
