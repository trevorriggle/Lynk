// hooks/useSessionStore.js
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Generate unique IDs
const genId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return "id_" + Math.random().toString(36).slice(2, 11);
  }
};

// Default models configuration
const DEFAULT_MODELS = [
  { label: "Claude Sonnet", provider: "anthropic", model: "claude-3-sonnet-20240229" },
  { label: "Claude Haiku", provider: "anthropic", model: "claude-3-haiku-20240307" },
  { label: "GPT-4o", provider: "openai", model: "gpt-4o" },
  { label: "GPT-4o Mini", provider: "openai", model: "gpt-4o-mini" },
  { label: "Gemini Flash", provider: "gemini", model: "gemini-1.5-flash" },
  { label: "Gemini Pro", provider: "gemini", model: "gemini-1.5-pro" },
  { label: "Grok", provider: "xai", model: "grok-2" },
];

// Initial state
const initialState = {
  // Session management
  sessions: {},
  order: [],
  activeId: null,
  selectedModel: DEFAULT_MODELS[0],
  availableModels: DEFAULT_MODELS,
  
  // Usage tracking
  guestMessageCount: 0,
  
  // Left panel items - now with full CRUD operations
  contextFiles: [
    {
      key: "sys-prompt",
      label: "sys-prompt.txt",
      content: "You are a helpful AI assistant. Be concise and accurate.",
      type: "text/plain",
      size: 64,
      createdAt: new Date().toISOString(),
    }
  ],
  
  behaviors: [
    {
      key: "cordial",
      label: "Respond cordially and friendly.",
      content: "Always maintain a warm, professional, and helpful tone in all interactions.",
      createdAt: new Date().toISOString(),
    }
  ],
  
  commands: [
    {
      key: "research",
      label: "Research?",
      content: "Conduct thorough research on the given topic and provide comprehensive insights.",
      createdAt: new Date().toISOString(),
    },
    {
      key: "analyze",
      label: "Analyze?",
      content: "Perform detailed analysis of the provided information or data.",
      createdAt: new Date().toISOString(),
    }
  ],
  
  projects: [
    {
      key: "carolina-research",
      label: "Carolina Research",
      description: "Academic research project for University of North Carolina",
      createdAt: new Date().toISOString(),
    },
    {
      key: "graphic-design",
      label: "Graphic Design",
      description: "Creative design projects and visual content creation",
      createdAt: new Date().toISOString(),
    }
  ],
  
  // Collaboration features
  sharedChats: {},
  collaborators: {},
  
  // Drawing/sketching data
  sketches: {},
  
  // Settings
  settings: {
    autoSave: true,
    darkMode: false,
    notificationsEnabled: true,
    defaultModel: DEFAULT_MODELS[0],
  }
};

export const useSessionStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      // ==================== SESSION MANAGEMENT ====================
      
      createSession: (model = null) => {
        const id = genId();
        const newSession = {
          id,
          title: "New chat",
          messages: [],
          model: model || get().selectedModel,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        set((state) => ({
          sessions: { ...state.sessions, [id]: newSession },
          order: [id, ...state.order],
          activeId: id,
        }));
        
        return id;
      },

      selectSession: (id) => {
        set({ activeId: id });
      },

      deleteSession: (id) => {
        set((state) => {
          const newSessions = { ...state.sessions };
          delete newSessions[id];
          
          const newOrder = state.order.filter((sessionId) => sessionId !== id);
          const newActiveId = state.activeId === id 
            ? (newOrder.length > 0 ? newOrder[0] : null)
            : state.activeId;

          return {
            sessions: newSessions,
            order: newOrder,
            activeId: newActiveId,
          };
        });
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [id]: {
              ...state.sessions[id],
              title,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      // ==================== MESSAGE MANAGEMENT ====================
      
      appendToActive: (message) => {
        const { activeId } = get();
        if (!activeId) return;

        const messageWithId = {
          id: genId(),
          timestamp: new Date().toISOString(),
          ...message,
        };

        set((state) => {
          const session = state.sessions[activeId];
          if (!session) return state;

          // Update guest message count for user messages
          let newGuestMessageCount = state.guestMessageCount;
          if (message.role === "user" && !session.userId) {
            newGuestMessageCount += 1;
          }

          // Auto-generate title from first user message
          let newTitle = session.title;
          if (message.role === "user" && session.messages.length === 0) {
            newTitle = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
          }

          return {
            sessions: {
              ...state.sessions,
              [activeId]: {
                ...session,
                title: newTitle,
                messages: [...session.messages, messageWithId],
                updatedAt: new Date().toISOString(),
              },
            },
            order: [activeId, ...state.order.filter(id => id !== activeId)],
            guestMessageCount: newGuestMessageCount,
          };
        });
      },

      clearActiveMessages: () => {
        const { activeId } = get();
        if (!activeId) return;

        set((state) => ({
          sessions: {
            ...state.sessions,
            [activeId]: {
              ...state.sessions[activeId],
              messages: [],
              title: "New chat",
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      // ==================== MODEL MANAGEMENT ====================
      
      setSelectedModel: (model) => {
        set({ selectedModel: model });
      },

      updateSessionModel: (sessionId, model) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              model,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      // ==================== CONTEXT FILES MANAGEMENT ====================
      
      addContextFile: (file) => {
        const fileWithMetadata = {
          key: file.key || genId(),
          label: file.label || file.name || "Untitled File",
          content: file.content || "",
          type: file.type || "text/plain",
          size: file.size || 0,
          createdAt: new Date().toISOString(),
          ...file,
        };

        set((state) => ({
          contextFiles: [...state.contextFiles, fileWithMetadata],
        }));
      },

      updateContextFile: (key, updates) => {
        set((state) => ({
          contextFiles: state.contextFiles.map(file =>
            file.key === key 
              ? { ...file, ...updates, updatedAt: new Date().toISOString() }
              : file
          ),
        }));
      },

      deleteContextFile: (key) => {
        set((state) => ({
          contextFiles: state.contextFiles.filter(file => file.key !== key),
        }));
      },

      // ==================== BEHAVIORS MANAGEMENT ====================
      
      addBehavior: (behavior) => {
        const behaviorWithMetadata = {
          key: behavior.key || genId(),
          label: behavior.label || "Untitled Behavior",
          content: behavior.content || "",
          createdAt: new Date().toISOString(),
          ...behavior,
        };

        set((state) => ({
          behaviors: [...state.behaviors, behaviorWithMetadata],
        }));
      },

      updateBehavior: (key, updates) => {
        set((state) => ({
          behaviors: state.behaviors.map(behavior =>
            behavior.key === key 
              ? { ...behavior, ...updates, updatedAt: new Date().toISOString() }
              : behavior
          ),
        }));
      },

      deleteBehavior: (key) => {
        set((state) => ({
          behaviors: state.behaviors.filter(behavior => behavior.key !== key),
        }));
      },

      // ==================== COMMANDS MANAGEMENT ====================
      
      addCommand: (command) => {
        const commandWithMetadata = {
          key: command.key || genId(),
          label: command.label || "Untitled Command",
          content: command.content || "",
          createdAt: new Date().toISOString(),
          ...command,
        };

        set((state) => ({
          commands: [...state.commands, commandWithMetadata],
        }));
      },

      updateCommand: (key, updates) => {
        set((state) => ({
          commands: state.commands.map(command =>
            command.key === key 
              ? { ...command, ...updates, updatedAt: new Date().toISOString() }
              : command
          ),
        }));
      },

      deleteCommand: (key) => {
        set((state) => ({
          commands: state.commands.filter(command => command.key !== key),
        }));
      },

      // ==================== PROJECTS MANAGEMENT ====================
      
      addProject: (project) => {
        const projectWithMetadata = {
          key: project.key || genId(),
          label: project.label || "Untitled Project",
          description: project.description || "",
          createdAt: new Date().toISOString(),
          ...project,
        };

        set((state) => ({
          projects: [...state.projects, projectWithMetadata],
        }));
      },

      updateProject: (key, updates) => {
        set((state) => ({
          projects: state.projects.map(project =>
            project.key === key 
              ? { ...project, ...updates, updatedAt: new Date().toISOString() }
              : project
          ),
        }));
      },

      deleteProject: (key) => {
        set((state) => ({
          projects: state.projects.filter(project => project.key !== key),
        }));
      },

      // ==================== COLLABORATION FEATURES ====================
      
      shareChat: (sessionId, options = {}) => {
        const shareId = genId();
        const session = get().sessions[sessionId];
        if (!session) return null;

        const sharedChat = {
          id: shareId,
          sessionId,
          title: session.title,
          messages: session.messages,
          sharedAt: new Date().toISOString(),
          expiresAt: options.expiresAt,
          allowComments: options.allowComments || false,
          isPublic: options.isPublic || false,
          password: options.password,
        };

        set((state) => ({
          sharedChats: {
            ...state.sharedChats,
            [shareId]: sharedChat,
          },
        }));

        return shareId;
      },

      unshareChat: (shareId) => {
        set((state) => {
          const newSharedChats = { ...state.sharedChats };
          delete newSharedChats[shareId];
          return { sharedChats: newSharedChats };
        });
      },

      addCollaborator: (sessionId, collaborator) => {
        set((state) => ({
          collaborators: {
            ...state.collaborators,
            [sessionId]: [
              ...(state.collaborators[sessionId] || []),
              {
                id: genId(),
                ...collaborator,
                addedAt: new Date().toISOString(),
              },
            ],
          },
        }));
      },

      removeCollaborator: (sessionId, collaboratorId) => {
        set((state) => ({
          collaborators: {
            ...state.collaborators,
            [sessionId]: (state.collaborators[sessionId] || []).filter(
              collab => collab.id !== collaboratorId
            ),
          },
        }));
      },

      // ==================== SKETCHING/DRAWING FEATURES ====================
      
      addSketch: (sessionId, sketchData) => {
        const sketchId = genId();
        const sketch = {
          id: sketchId,
          sessionId,
          createdAt: new Date().toISOString(),
          ...sketchData,
        };

        set((state) => ({
          sketches: {
            ...state.sketches,
            [sketchId]: sketch,
          },
        }));

        return sketchId;
      },

      updateSketch: (sketchId, updates) => {
        set((state) => ({
          sketches: {
            ...state.sketches,
            [sketchId]: {
              ...state.sketches[sketchId],
              ...updates,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      deleteSketch: (sketchId) => {
        set((state) => {
          const newSketches = { ...state.sketches };
          delete newSketches[sketchId];
          return { sketches: newSketches };
        });
      },

      // ==================== DATA EXPORT/IMPORT ====================
      
      exportSession: (sessionId, format = 'json') => {
        const session = get().sessions[sessionId];
        if (!session) return null;

        if (format === 'json') {
          return JSON.stringify(session, null, 2);
        } else if (format === 'markdown') {
          const content = session.messages.map(msg => {
            const role = msg.role === 'user' ? 'You' : 'Assistant';
            return `## ${role}\n\n${msg.content}\n`;
          }).join('\n');
          
          return `# ${session.title}\n\nCreated: ${session.createdAt}\n\n${content}`;
        } else if (format === 'txt') {
          return session.messages.map(msg => {
            const role = msg.role === 'user' ? 'You' : 'Assistant';
            return `${role}: ${msg.content}`;
          }).join('\n\n');
        }
        
        return null;
      },

      exportAllData: () => {
        const state = get();
        return {
          sessions: state.sessions,
          contextFiles: state.contextFiles,
          behaviors: state.behaviors,
          commands: state.commands,
          projects: state.projects,
          settings: state.settings,
          exportedAt: new Date().toISOString(),
        };
      },

      importData: (data) => {
        try {
          set((state) => ({
            ...state,
            ...data,
            // Preserve certain client-side state
            activeId: state.activeId,
            guestMessageCount: state.guestMessageCount,
          }));
          return true;
        } catch (error) {
          console.error('Import failed:', error);
          return false;
        }
      },

      // ==================== SETTINGS ====================
      
      updateSettings: (updates) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...updates,
          },
        }));
      },

      // ==================== UTILITY METHODS ====================
      
      resetStore: () => {
        set(initialState);
      },

      getSessionStats: () => {
        const { sessions, guestMessageCount } = get();
        const sessionCount = Object.keys(sessions).length;
        const totalMessages = Object.values(sessions).reduce(
          (total, session) => total + session.messages.length, 
          0
        );
        const userMessages = Object.values(sessions).reduce(
          (total, session) => total + session.messages.filter(m => m.role === 'user').length,
          0
        );

        return {
          sessionCount,
          totalMessages,
          userMessages,
          guestMessageCount,
        };
      },

      // Search functionality
      searchSessions: (query) => {
        const { sessions } = get();
        const lowercaseQuery = query.toLowerCase();
        
        return Object.values(sessions).filter(session => {
          return session.title.toLowerCase().includes(lowercaseQuery) ||
                 session.messages.some(msg => 
                   msg.content.toLowerCase().includes(lowercaseQuery)
                 );
        });
      },

      searchContextFiles: (query) => {
        const { contextFiles } = get();
        const lowercaseQuery = query.toLowerCase();
        
        return contextFiles.filter(file => 
          file.label.toLowerCase().includes(lowercaseQuery) ||
          file.content.toLowerCase().includes(lowercaseQuery)
        );
      },
    }),
    {
      name: "lynk-sessions-v3", // Updated version
      version: 3,
      migrate: (persistedState, version) => {
        // Handle migration from older versions
        if (version < 3) {
          return {
            ...initialState,
            sessions: persistedState.sessions || {},
            order: persistedState.order || [],
            activeId: persistedState.activeId || null,
            selectedModel: persistedState.selectedModel || DEFAULT_MODELS[0],
            guestMessageCount: persistedState.guestMessageCount || 0,
          };
        }
        return persistedState;
      },
    }
  )
);