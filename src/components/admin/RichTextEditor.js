"use client";

import { useEffect, useRef } from "react";

const toolbarOptions = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "image"],
  ["clean"],
];

export default function RichTextEditor({ value, onChange }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const emittedValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let mounted = true;

    async function initializeEditor() {
      const { default: Quill } = await import("quill");
      if (!mounted || !containerRef.current || quillRef.current) return;

      const quill = new Quill(containerRef.current, {
        theme: "snow",
        modules: {
          toolbar: {
            container: toolbarOptions,
            handlers: {
              image() {
                const imageUrl = window.prompt("Image URL");
                if (!imageUrl) return;

                const range = this.quill.getSelection(true);
                this.quill.insertEmbed(range.index, "image", imageUrl, "user");
                this.quill.setSelection(range.index + 1, 0, "user");
              },
            },
          },
        },
      });

      quill.root.innerHTML = initialValueRef.current || "";
      quill.on("text-change", () => {
        const html = typeof quill.getSemanticHTML === "function"
          ? quill.getSemanticHTML()
          : quill.root.innerHTML;
        emittedValueRef.current = html;
        onChangeRef.current?.(html);
      });
      quillRef.current = quill;
    }

    initializeEditor();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (value === emittedValueRef.current) return;
    if (!quill || value === quill.root.innerHTML) return;
    const selection = quill.getSelection();
    quill.root.innerHTML = value || "";
    if (selection) quill.setSelection(selection);
  }, [value]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div ref={containerRef} className="min-h-56" />
    </div>
  );
}
