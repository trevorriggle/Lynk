"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const uid = () =>
  (typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export const useSessionStore = create(
  persist(
    (set, get) => ({
      // sessions keyed by id
      sessions: /** @type {Record<string, {
        id: string,
        title: string,
        createdAt: number,
        updatedAt: number,
        model: { label: string, provider: string, model: string },
        messages: Array<{ id: string, role: "user"|"assistant", content: string, ts: number }>
      }>} */ ({}),

      // most-recent-first ordering
      order: /** @type {string[]} */ ([]),

      // currently selected session id (or null if none)
      activeId: /** @type {string|null} */ (null),

      // ✅ the model chosen in the floating pill (also used as default for new chats)
      selectedModel: { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" },

      /** Update the UI-selected model AND immediately apply it to the active session (if any). */
      setSelectedModel(model) {
        set((s) => {
          if (s.activeId && s.sessions[s.activeId]) {
            s.sessions[s.activeId] = { ...s.sessions[s.activeId], model };
          }
          return { selectedModel: model, sessions: { ...s.sessions } };
        });
      },

      /** Create a new chat session; keep current one active (new bubble appears but is NOT auto-selected). */
      createSession(model) {
        const useModel =
          model ||
          get().selectedModel || { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" };

        const id = `sess_${uid()}`;
        const now = Date.now();
        const session = {
          id,
          title: "New chat",
          createdAt: now,
          updatedAt: now,
          model: useModel,
          messages: [],
        };

        set((s) => ({
          sessions: { ...s.sessions, [id]: session },
          order: [id, ...s.order.filter((x) => x !== id)],
          // keep whatever is active; do NOT auto-activate the newly created session
          activeId: s.activeId,
        }));

        return id;
      },

      /** Manually activate an existing session (no reordering). */
      selectSession(id) {
        if (!get().sessions[id]) return;
        set({ activeId: id });
      },

      /** Append a message to the active session and MRU it. */
      appendToActive(msg /* { role, content } */) {
        const id = get().activeId;
        if (!id) return;
        const now = Date.now();

        set((s) => {
          const cur = s.sessions[id];
          const firstUserTitle =
            cur.messages.length === 0 && msg.role === "user"
              ? (msg.content || "New chat").slice(0, 60)
              : cur.title;

          const updated = {
            ...cur,
            title: firstUserTitle,
            updatedAt: now,
            messages: [...cur.messages, { id: `m_${uid()}`, ts: now, ...msg }],
          };

          return {
            sessions: { ...s.sessions, [id]: updated },
            order: [id, ...s.order.filter((x) => x !== id)],
          };
        });
      },
    }),
    { name: "lynk-sessions-v1" }
  )
);
