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

      // the model chosen in the floating pill (also used as default for new chats)
      selectedModel: { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" },

      // NEW: Track guest message count
      guestMessageCount: 0,

      // NEW: Left panel lists
      contextFiles: [
        { key: "sys-prompt.txt", label: "sys-prompt.txt" }
      ],
      
      behaviors: [
        { key: "cordial", label: "Respond cordially and friendly." }
      ],
      
      commands: [
        { key: "research", label: "Research?" },
        { key: "fort-rapids", label: "Fort-rapids?" },
        { key: "analyze", label: "Analyze?" },
        { key: "brainstorm", label: "Brainstorm?" }
      ],
      
      projects: [
        { key: "carolina", label: "Carolina Research" },
        { key: "graphic-design", label: "Graphic Design" },
        { key: "coding-support", label: "Coding Support" }
      ],

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

        // 🔥 CRITICAL FIX: Sync session ID to localStorage when creating/activating
        if (typeof window !== "undefined") {
          localStorage.setItem("lynk_session_id", id);
        }

        set((s) => ({
          sessions: { ...s.sessions, [id]: session },
          order: [id, ...s.order.filter((x) => x !== id)],
          activeId: id, // 🔥 AUTO-ACTIVATE new sessions for better UX
        }));

        return id;
      },

      /** Activate an existing session AND align it to the current pill selection (pill is source of truth). */
      selectSession(id) {
        const s = get();
        if (!s.sessions[id]) return;

        const chosen = s.selectedModel; // whatever the pill currently shows

        set((state) => {
          const cur = state.sessions[id];
          const patched = chosen ? { ...cur, model: chosen } : cur;
          return {
            activeId: id,
            sessions: { ...state.sessions, [id]: patched },
            // no MRU reordering on select (keeps your current behavior)
          };
        });
      },

      /** Delete a chat. If it's active, fall back to the next most-recent (or none). */
      deleteSession(id) {
        const s = get();
        if (!s.sessions[id]) return;

        const { [id]: _removed, ...rest } = s.sessions;
        const newOrder = s.order.filter((x) => x !== id);
        const nextActive = s.activeId === id ? (newOrder[0] || null) : s.activeId;

        set({ sessions: rest, order: newOrder, activeId: nextActive });
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

          // NEW: Increment guest counter for user messages when not authenticated
          const newGuestCount = msg.role === "user" ? s.guestMessageCount + 1 : s.guestMessageCount;

          return {
            sessions: { ...s.sessions, [id]: updated },
            order: [id, ...s.order.filter((x) => x !== id)],
            guestMessageCount: newGuestCount,
          };
        });
      },

      // NEW: Delete functions for left panel items
      deleteContextFile: (key) => set((state) => ({
        contextFiles: state.contextFiles.filter(f => f.key !== key)
      })),

      deleteBehavior: (key) => set((state) => ({
        behaviors: state.behaviors.filter(b => b.key !== key)
      })),

      deleteCommand: (key) => set((state) => ({
        commands: state.commands.filter(c => c.key !== key)
      })),

      deleteProject: (key) => set((state) => ({
        projects: state.projects.filter(p => p.key !== key)
      })),

      // NEW: Add functions for left panel items
      addContextFile: (file) => set((state) => ({
        contextFiles: [...state.contextFiles, { key: uid(), ...file }]
      })),

      addBehavior: (behavior) => set((state) => ({
        behaviors: [...state.behaviors, { key: uid(), ...behavior }]
      })),

      addCommand: (command) => set((state) => ({
        commands: [...state.commands, { key: uid(), ...command }]
      })),

      addProject: (project) => set((state) => ({
        projects: [...state.projects, { key: uid(), ...project }]
      })),

      // NEW: Helper functions for message management
      getGuestMessageCount() {
        return get().guestMessageCount;
      },

      getAuthMessageCount() {
        return get().authMessageCount;
      },

      resetGuestMessageCount() {
        set({ guestMessageCount: 0 });
      },

      resetAuthMessageCount() {
        set({ authMessageCount: 0 });
      },

      resetAllMessageCounts() {
        set({ guestMessageCount: 0, authMessageCount: 0 });
      },
    }),
    { name: "lynk-sessions-v2" }
  )
);