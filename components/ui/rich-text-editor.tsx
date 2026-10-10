"use client"

import { useEffect, useState } from "react"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "tiptap-markdown"
import { Bold, Italic, Link2, List, ListOrdered, Redo2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { richTextClassName } from "@/components/ui/rich-text"
import { cn } from "@/lib/utils"

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown
    .getMarkdown()
    .trim()
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(active && "bg-muted text-foreground")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function RichTextEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  className
}: {
  /** Markdown */
  value: string
  onChange: (markdown: string) => void
  /** Called on Ctrl/Cmd+Enter */
  onSubmit?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, protocols: ["mailto"], defaultProtocol: "https" }
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Markdown.configure({ html: false, breaks: true, linkify: true })
    ],
    content: value,
    editorProps: {
      attributes: {
        "aria-label": placeholder ?? "Comentario",
        class: cn(
          "min-h-20 max-h-72 overflow-y-auto px-3 py-2 text-sm outline-none",
          richTextClassName
        )
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          onSubmit?.()
          return true
        }
        return false
      }
    },
    onUpdate: ({ editor }) => onChange(getMarkdown(editor))
  })

  // Sync external resets (e.g. form.reset() after submit).
  useEffect(() => {
    if (editor && value !== getMarkdown(editor)) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  useEffect(() => {
    // emitUpdate=false: toggling editability must not fire onChange, or form libs
    // revalidate (and flag an empty field) right after a successful submit/reset.
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      link: editor?.isActive("link") ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false
    })
  })

  if (!editor) return <div className={cn("min-h-[116px] rounded-md border", className)} />

  function openLink() {
    if (!editor) return
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "")
    setLinkOpen(true)
  }

  function applyLink() {
    if (!editor) return
    const url = linkUrl.trim()
    const chain = editor.chain().focus().extendMarkRange("link")
    if (url === "") chain.unsetLink().run()
    else chain.setLink({ href: url }).run()
    setLinkOpen(false)
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        disabled && "opacity-50",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input px-1.5 py-1">
        <ToolbarButton
          label="Negrita"
          active={state?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Cursiva"
          active={state?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Lista con viñetas"
          active={state?.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={state?.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton label="Enlace" active={state?.link} onClick={openLink}>
          <Link2 />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Deshacer"
          disabled={!state?.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          label="Rehacer"
          disabled={!state?.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 />
        </ToolbarButton>
      </div>
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-input px-2 py-1.5">
          <input
            autoFocus
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyLink()
              } else if (e.key === "Escape") {
                setLinkOpen(false)
                editor.commands.focus()
              }
            }}
            placeholder="https://..."
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
          />
          <Button type="button" size="sm" onClick={applyLink}>
            Aplicar
          </Button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
      />
    </div>
  )
}
