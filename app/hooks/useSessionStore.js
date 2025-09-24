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
  { label: "OpenAI", provider: "openai", model: "gpt-4o-mini" },
  { label: "Claude", provider: "anthropic", model: "claude-3-haiku-20240307" },
  { label: "Gemini", provider: "gemini", model: "gemini-1.5-flash" },
  { label: "Grok", provider: "xai", model: "grok-2" },
];

// Debounce function for API calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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
  
  // Sync state
  isLoading: false,
  lastSyncAt: null,
  pendingSyncs: new Set(),
  
  // Left panel items
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
  
  
  // Collaboration features
  sharedChats: {},
  collaborators: {},
  
  // Drawing/sketching data
  sketches: {},
  
  // Settings
  settings: {
    autoSave: true,
    syncEnabled: true,
    darkMode: false,
    notificationsEnabled: true,
    defaultModel: DEFAULT_MODELS[0],
  }
};

export const useSessionStore = create(
  persist(
    (set, get) => {
      // Sync functions
      const syncToDatabase = async (type, data) => {
        if (!get().settings.syncEnabled) return;
        
        try {
          const response = await fetch('/api/chat-storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ type, data }),
          });
          
          if (!response.ok && response.status !== 401) {
            console.warn(`Failed to sync ${type}:`, response.statusText);
          }
        } catch (error) {
          console.warn(`Failed to sync ${type}:`, error);
        }
      };

      const debouncedSync = debounce(syncToDatabase, 1000);

      const loadFromDatabase = async () => {
        if (!get().settings.syncEnabled) return;
        
        set({ isLoading: true });
        
        try {
          const response = await fetch('/api/chat-storage', {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            set({
              sessions: data.sessions || {},
              order: data.order || [],
              contextFiles: data.contextFiles || get().contextFiles,
              behaviors: data.behaviors || get().behaviors,
              commands: data.commands || get().commands,
              lastSyncAt: new Date().toISOString(),
              isLoading: false,
            });
          } else if (response.status !== 401) {
            console.warn('Failed to load from database:', response.statusText);
            set({ isLoading: false });
          } else {
            // User not authenticated, keep local state
            set({ isLoading: false });
          }
        } catch (error) {
          console.warn('Failed to load from database:', error);
          set({ isLoading: false });
        }
      };

      // Check authentication status and load data if authenticated
      const checkAuthAndLoad = async () => {
        try {
          const response = await fetch('/api/me', { credentials: 'include' });
          if (response.ok) {
            const userData = await response.json();
            if (userData?.userId) {
              await loadFromDatabase();
            }
          }
        } catch (error) {
          console.warn('Auth check failed:', error);
        }
      };

      // Load initial data
      if (typeof window !== 'undefined') {
        setTimeout(checkAuthAndLoad, 100);

        // Listen for message responses to capture snapshots and sync them
        const handleMessageResponse = (event) => {
          const data = event.detail;
          const sessionId = data?.sessionMeta?.sessionId;

          if (sessionId) {
            const currentSessions = get().sessions;
            if (currentSessions[sessionId]) {
              let needsUpdate = false;
              const updates = {};

              // Capture snapshots and store them with the session
              if (data?.inspector?.live_history) {
                updates.liveHistory = data.inspector.live_history;
                needsUpdate = true;
              }

              // Capture dynamic commands from topic tracking
              if (data?.inspector?.commands) {
                // Merge with existing commands, avoiding duplicates
                const existingCommands = get().commands || [];
                const newCommands = data.inspector.commands;

                const mergedCommands = [...existingCommands];
                newCommands.forEach(newCmd => {
                  const exists = existingCommands.find(cmd =>
                    cmd.slug === newCmd.slug || cmd.command === newCmd.command
                  );
                  if (!exists) {
                    mergedCommands.push({
                      key: newCmd.slug || genId(),
                      label: newCmd.command || newCmd.slug,
                      content: `Based on your conversation: ${newCmd.command || newCmd.slug}`,
                      createdAt: newCmd.created_at || new Date().toISOString(),
                      source: 'ai-generated',
                      confidence: newCmd.confidence || 'medium',
                    });
                  }
                });

                if (mergedCommands.length > existingCommands.length) {
                  set({ commands: mergedCommands });
                  // Sync new commands
                  const newCommandsOnly = mergedCommands.slice(existingCommands.length);
                  newCommandsOnly.forEach(cmd => debouncedSync('save_command', cmd));
                }
              }

              // Update session if needed
              if (needsUpdate) {
                const updatedSession = {
                  ...currentSessions[sessionId],
                  ...updates,
                  updatedAt: new Date().toISOString(),
                };

                set((state) => ({
                  sessions: {
                    ...state.sessions,
                    [sessionId]: updatedSession,
                  },
                }));

                // Sync session updates to database
                debouncedSync('save_session', updatedSession);
              }
            }
          }
        };

        window.addEventListener('message:response', handleMessageResponse);

        // Cleanup function will be handled by the store cleanup
      }

      return {
        ...initialState,

        // ==================== SYNC METHODS ====================
        
        loadFromDatabase,
        syncToDatabase,
        
        toggleSync: () => {
          set((state) => ({
            settings: {
              ...state.settings,
              syncEnabled: !state.settings.syncEnabled,
            },
          }));
        },

        // ==================== SESSION MANAGEMENT ====================
        
        createSession: (model = null, userId = null) => {
          const id = genId();
          const sessionModel = model || get().selectedModel;
          const newSession = {
            id,
            title: "New chat",
            messages: [],
            model: sessionModel,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: userId, // Set immediately from caller
            liveHistory: [], // Initialize empty snapshot history
            _lastSnapshotUserCount: 0, // Track snapshots per session
          };
          
          set((state) => ({
            sessions: { ...state.sessions, [id]: newSession },
            order: [id, ...state.order],
            activeId: id,
          }));

          // Sync to database
          debouncedSync('save_session', newSession);
          
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

          // Delete from database
          fetch(`/api/chat-storage?type=session&id=${id}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(console.warn);
        },

        updateSessionTitle: (id, title) => {
          set((state) => {
            const session = state.sessions[id];
            if (!session) return state;

            const updatedSession = {
              ...session,
              title,
              updatedAt: new Date().toISOString(),
            };

            return {
              sessions: {
                ...state.sessions,
                [id]: updatedSession,
              },
            };
          });

          // Sync to database
          const session = get().sessions[id];
          if (session) {
            debouncedSync('save_session', session);
          }
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

            const updatedSession = {
              ...session,
              title: newTitle,
              messages: [...session.messages, messageWithId],
              updatedAt: new Date().toISOString(),
            };

            return {
              sessions: {
                ...state.sessions,
                [activeId]: updatedSession,
              },
              order: [activeId, ...state.order.filter(id => id !== activeId)],
              guestMessageCount: newGuestMessageCount,
            };
          });

          // Sync session and message to database
          const updatedSession = get().sessions[activeId];
          if (updatedSession) {
            debouncedSync('save_session', updatedSession);
            debouncedSync('save_message', {
              ...messageWithId,
              sessionId: activeId,
            });
          }
        },

        clearActiveMessages: () => {
          const { activeId } = get();
          if (!activeId) return;

          set((state) => {
            const updatedSession = {
              ...state.sessions[activeId],
              messages: [],
              title: "New chat",
              updatedAt: new Date().toISOString(),
            };

            return {
              sessions: {
                ...state.sessions,
                [activeId]: updatedSession,
              },
            };
          });

          // Sync to database
          const session = get().sessions[activeId];
          if (session) {
            debouncedSync('save_session', session);
          }
        },

        // ==================== MODEL MANAGEMENT ====================
        
        setSelectedModel: (model) => {
          set({ selectedModel: model });
        },

        updateSessionModel: (sessionId, model) => {
          set((state) => {
            const updatedSession = {
              ...state.sessions[sessionId],
              model,
              updatedAt: new Date().toISOString(),
            };

            return {
              sessions: {
                ...state.sessions,
                [sessionId]: updatedSession,
              },
            };
          });

          // Sync to database
          const session = get().sessions[sessionId];
          if (session) {
            debouncedSync('save_session', session);
          }
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

          // Sync to database
          debouncedSync('save_context_file', fileWithMetadata);
        },

        updateContextFile: (key, updates) => {
          let updatedFile;
          set((state) => {
            const newContextFiles = state.contextFiles.map(file => {
              if (file.key === key) {
                updatedFile = { ...file, ...updates, updatedAt: new Date().toISOString() };
                return updatedFile;
              }
              return file;
            });
            
            return { contextFiles: newContextFiles };
          });

          // Sync to database
          if (updatedFile) {
            debouncedSync('save_context_file', updatedFile);
          }
        },

        deleteContextFile: (key) => {
          set((state) => ({
            contextFiles: state.contextFiles.filter(file => file.key !== key),
          }));

          // Delete from database
          fetch(`/api/chat-storage?type=context_file&key=${encodeURIComponent(key)}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(console.warn);
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

          // Sync to database
          debouncedSync('save_behavior', behaviorWithMetadata);
        },

        updateBehavior: (key, updates) => {
          let updatedBehavior;
          set((state) => {
            const newBehaviors = state.behaviors.map(behavior => {
              if (behavior.key === key) {
                updatedBehavior = { ...behavior, ...updates, updatedAt: new Date().toISOString() };
                return updatedBehavior;
              }
              return behavior;
            });
            
            return { behaviors: newBehaviors };
          });

          // Sync to database
          if (updatedBehavior) {
            debouncedSync('save_behavior', updatedBehavior);
          }
        },

        deleteBehavior: (key) => {
          set((state) => ({
            behaviors: state.behaviors.filter(behavior => behavior.key !== key),
          }));

          // Delete from database
          fetch(`/api/chat-storage?type=behavior&key=${encodeURIComponent(key)}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(console.warn);
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

          // Sync to database
          debouncedSync('save_command', commandWithMetadata);
        },

        updateCommand: (key, updates) => {
          let updatedCommand;
          set((state) => {
            const newCommands = state.commands.map(command => {
              if (command.key === key) {
                updatedCommand = { ...command, ...updates, updatedAt: new Date().toISOString() };
                return updatedCommand;
              }
              return command;
            });
            
            return { commands: newCommands };
          });

          // Sync to database
          if (updatedCommand) {
            debouncedSync('save_command', updatedCommand);
          }
        },

        deleteCommand: (key) => {
          set((state) => ({
            commands: state.commands.filter(command => command.key !== key),
          }));

          // Delete from database
          fetch(`/api/chat-storage?type=command&key=${encodeURIComponent(key)}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(console.warn);
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
        
        clearSessions: () => {
          set({
            sessions: {},
            order: [],
            activeId: null,
            guestMessageCount: 0,
          });
        },

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

        sendMessage: (message) => {
          // Helper function for commands to send messages
          const { activeId, appendToActive } = get();
          if (activeId) {
            appendToActive({ role: "user", content: message });
          }
        },
      };
    },
    {
      name: "lynk-sessions-v2", // Use consistent versioning
      version: 2,
      migrate: (persistedState, version) => {
        // Handle migration from older versions
        if (version < 2) {
          return {
            ...initialState,
            sessions: persistedState.sessions || {},
            order: persistedState.order || [],
            activeId: persistedState.activeId || null,
            selectedModel: persistedState.selectedModel || DEFAULT_MODELS[0],
            guestMessageCount: persistedState.guestMessageCount || 0,
            contextFiles: persistedState.contextFiles || initialState.contextFiles,
            behaviors: persistedState.behaviors || initialState.behaviors,
            commands: persistedState.commands || initialState.commands,
          };
        }
        return persistedState;
      },
    }
  )
);