"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const uid = () => crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

export const useSessionStore = create(
  persist(
    (set, get) => ({
      sessions: /** @type {Record<string, {
        id: string,
        title: string,
        createdAt: number,
        updatedAt: number,
        model: { label: string, provider: string, model: string },
        messages: Array<{ id: string, role: "user"|"assistant", content: string, ts: number }>
      }>} */ ({}),
      order: /** @type {string[]} */ ([]), // most recent first
      activeId: /** @type {string|null} */ (null),

      /** Create a new chat session and activate it */
      createSession(model = { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" }) {
        const id = `sess_${uid()}`;
        const now = Date.now();
        const session = {
          id,
          title: "New chat",
          createdAt: now,
          updatedAt: now,
          model,
          messages: [],
        };
        set((s) => ({
          sessions: { ...s.sessions, [id]: session },
          order: [id, ...s.order.filter((x) => x !== id)],
          activeId: s.activeId,
        }));
        return id;
      },

      /** Activate an existing session */
       selectSession(id) {
         if (!get().sessions[id]) return;
         set({ activeId: id }); // no reordering on select
       },

      /** Append a message to the active session */
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
