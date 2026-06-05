"use client";

import { useCallback, useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { ListItem, OrderedList } from "@tiptap/extension-list";
import Underline from "@tiptap/extension-underline";

const IMAGE_SIZE_PRESETS = [
  { value: "small", label: "S", title: "Small image" },
  { value: "medium", label: "M", title: "Medium image" },
  { value: "large", label: "L", title: "Large image" },
  { value: "full", label: "Full", title: "Full-width image" },
];

const IMAGE_SIZE_VALUES = new Set(IMAGE_SIZE_PRESETS.map((preset) => preset.value));

const IMAGE_ALIGN_PRESETS = [
  { value: "left", label: "Left", title: "Align image left" },
  { value: "center", label: "Center", title: "Align image center" },
  { value: "right", label: "Right", title: "Align image right" },
];

const IMAGE_ALIGN_VALUES = new Set(IMAGE_ALIGN_PRESETS.map((preset) => preset.value));

function normalizeImageSize(value) {
  return IMAGE_SIZE_VALUES.has(value) ? value : "full";
}

function normalizeImageAlign(value) {
  return IMAGE_ALIGN_VALUES.has(value) ? value : "center";
}

const NewsImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: "full",
        parseHTML: (element) => normalizeImageSize(element.getAttribute("data-size")),
        renderHTML: (attributes) => {
          const size = normalizeImageSize(attributes.size);
          return size === "full" ? {} : { "data-size": size };
        },
      },
      align: {
        default: "center",
        parseHTML: (element) => normalizeImageAlign(element.getAttribute("data-align")),
        renderHTML: (attributes) => {
          const align = normalizeImageAlign(attributes.align);
          return align === "center" ? {} : { "data-align": align };
        },
      },
    };
  },
});

const NewsOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      start: {
        default: 1,
        parseHTML: (element) => {
          const parsed = Number.parseInt(element.getAttribute("start") || "", 10);
          return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
        },
        renderHTML: (attributes) => {
          const start = Number.parseInt(attributes.start, 10);
          return Number.isInteger(start) && start > 1 ? { start } : {};
        },
      },
    };
  },
});

const NewsListItem = ListItem.extend({
  addAttributes() {
    return {
      value: {
        default: null,
        parseHTML: (element) => {
          const parsed = Number.parseInt(
            element.getAttribute("value") || element.getAttribute("data-value") || "",
            10
          );
          return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        },
        renderHTML: (attributes) => {
          const value = Number.parseInt(attributes.value, 10);
          return Number.isInteger(value) && value > 0 ? { value, "data-value": value } : {};
        },
      },
    };
  },
});

const editorExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    link: false,
    listItem: false,
    orderedList: false,
    strike: false,
    underline: false,
  }),
  NewsListItem,
  NewsOrderedList,
  Underline,
  Link.configure({
    autolink: true,
    defaultProtocol: "https",
    linkOnPaste: true,
    openOnClick: false,
    HTMLAttributes: {
      rel: "noreferrer noopener",
      target: "_blank",
    },
  }),
  NewsImage.configure({
    allowBase64: false,
    inline: false,
  }),
];

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function ToolbarButton({ active = false, children, disabled = false, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "min-h-9 min-w-9 rounded-md border px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-primary bg-primary-light text-primary-dark"
          : "border-gray-200 bg-white text-gray-700 hover:border-primary/40 hover:text-primary",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange }) {
  const onChangeRef = useRef(onChange);
  const lastHtmlRef = useRef(value || "");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: editorExtensions,
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "news-content tiptap-editor-content min-h-56 px-4 py-3 text-sm leading-6 text-gray-900 outline-none",
      },
    },
    onUpdate({ editor: currentEditor }) {
      const html = currentEditor.getHTML();
      lastHtmlRef.current = html;
      onChangeRef.current?.(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastHtmlRef.current) return;

    const nextValue = value || "";
    if (nextValue === editor.getHTML()) return;

    editor.commands.setContent(nextValue, { emitUpdate: false });
    lastHtmlRef.current = nextValue;
  }, [editor, value]);

  const setLink = useCallback(() => {
    if (!editor) return;

    const currentHref = editor.getAttributes("link").href || "";
    const nextHref = window.prompt("Link URL", currentHref);
    if (nextHref === null) return;

    const normalizedHref = normalizeHttpUrl(nextHref);
    if (!normalizedHref) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: normalizedHref }).run();
  }, [editor]);

  const insertImage = useCallback(() => {
    if (!editor) return;

    const imageUrl = window.prompt("Image URL");
    const normalizedUrl = normalizeHttpUrl(imageUrl);
    if (!normalizedUrl) return;

    editor.chain().focus().setImage({ src: normalizedUrl, size: "medium", align: "center" }).run();
  }, [editor]);

  const setImageSize = useCallback((size) => {
    if (!editor) return;

    editor.chain().focus().updateAttributes("image", { size }).run();
  }, [editor]);

  const setImageAlign = useCallback((align) => {
    if (!editor) return;

    editor.chain().focus().updateAttributes("image", { align }).run();
  }, [editor]);

  const setOrderedListStart = useCallback(() => {
    if (!editor) return;

    const currentStart = editor.getAttributes("orderedList").start || 1;
    const nextStart = window.prompt("First number", String(currentStart));
    if (nextStart === null) return;

    const parsed = Number.parseInt(nextStart, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return;

    editor.chain().focus().updateAttributes("orderedList", { start: parsed }).run();
  }, [editor]);

  const setListItemValue = useCallback(() => {
    if (!editor) return;

    const currentValue = editor.getAttributes("listItem").value || "";
    const nextValue = window.prompt("This item number", String(currentValue));
    if (nextValue === null) return;

    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return;

    editor.chain().focus().updateAttributes("listItem", { value: parsed }).run();
  }, [editor]);

  const disabled = !editor;
  const imageSelected = Boolean(editor?.isActive("image"));
  const selectedImageSize = normalizeImageSize(editor?.getAttributes("image").size);
  const selectedImageAlign = normalizeImageAlign(editor?.getAttributes("image").align);
  const orderedListActive = Boolean(editor?.isActive("orderedList"));
  const listItemActive = Boolean(editor?.isActive("listItem"));

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-gray-100 bg-gray-50 p-2">
        <ToolbarButton
          title="Heading 1"
          disabled={disabled}
          active={editor?.isActive("heading", { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          disabled={disabled}
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          disabled={disabled}
          active={editor?.isActive("heading", { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          title="Bold"
          disabled={disabled}
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          disabled={disabled}
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          disabled={disabled}
          active={editor?.isActive("underline")}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolbarButton>
        <ToolbarButton
          title="Ordered list"
          disabled={disabled}
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          title="Set ordered-list first number"
          disabled={disabled || !orderedListActive}
          onClick={setOrderedListStart}
        >
          Start
        </ToolbarButton>
        <ToolbarButton
          title="Set current item number"
          disabled={disabled || !orderedListActive || !listItemActive}
          onClick={setListItemValue}
        >
          No.
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          disabled={disabled}
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          -
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          disabled={disabled}
          active={editor?.isActive("link")}
          onClick={setLink}
        >
          Link
        </ToolbarButton>
        <ToolbarButton title="Image URL" disabled={disabled} onClick={insertImage}>
          Img
        </ToolbarButton>
        {IMAGE_SIZE_PRESETS.map((preset) => (
          <ToolbarButton
            key={preset.value}
            title={preset.title}
            disabled={disabled || !imageSelected}
            active={imageSelected && selectedImageSize === preset.value}
            onClick={() => setImageSize(preset.value)}
          >
            {preset.label}
          </ToolbarButton>
        ))}
        {IMAGE_ALIGN_PRESETS.map((preset) => (
          <ToolbarButton
            key={preset.value}
            title={preset.title}
            disabled={disabled || !imageSelected}
            active={imageSelected && selectedImageAlign === preset.value}
            onClick={() => setImageAlign(preset.value)}
          >
            {preset.label}
          </ToolbarButton>
        ))}
        <ToolbarButton
          title="Clear formatting"
          disabled={disabled}
          onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          Clear
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
