"use client";
import { useEffect, useRef, useState } from "react";

export default function ChatInput({ onSend, sending = false }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // --- autosize textarea ---
  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    const next = Math.min(ta.scrollHeight, 160); // cap ~10 lines
    ta.style.height = next + "px";
    ta.style.overflowY = ta.scrollHeight > 160 ? "auto" : "hidden";
  };
  useEffect(() => { autosize(); }, []);
  useEffect(() => { autosize(); }, [text]);

  // --- file handling ---
  const addFiles = (list) => {
    const arr = Array.from(list || []);
    if (!arr.length) return;
    setFiles((prev) => [...prev, ...arr].slice(0, 10)); // simple cap
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  // --- submit ---
  const doSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    await onSend?.(trimmed, files);
    setText("");
    setFiles([]);
    autosize();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) doSend();
    }
  };

  return (
    <div
      className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur px-3 py-3"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={onDrop}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (!sending) doSend(); }}
        className="mx-auto flex w-full max-w-3xl items-end gap-2"
      >
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-11 w-11 rounded-full border border-slate-300 bg-white flex items-center justify-center"
          title="Attach files"
        >
          {/* plus icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        {/* Text area + chips */}
        <div className="flex-1">
          <div className="rounded-2xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-[#176A82]">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything…  (Shift+Enter for newline)"
              rows={1}
              className="w-full resize-none overflow-hidden leading-6 min-h-[44px] max-h-40 outline-none"
            />
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="group flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                    <span className="truncate max-w-[12rem]">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="opacity-60 group-hover:opacity-100"
                      title="Remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mic placeholder (optional) */}
        <button
          type="button"
          className="h-11 w-11 rounded-full border border-slate-300 bg-white flex items-center justify-center"
          title="Voice (coming soon)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 14a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v3a4 4 0 0 0 4 4zm-7 0a7 7 0 0 0 14 0M12 21v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Custom send button */}
        <button
          type="submit"
          disabled={sending}
          className="h-11 w-11 rounded-full !bg-[#176A82] text-white flex items-center justify-center shadow disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send"
        >
          {/* paper plane */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" fill="currentColor"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
