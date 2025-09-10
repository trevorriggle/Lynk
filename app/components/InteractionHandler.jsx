"use client";
import React, { useEffect, useState, useRef } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// Drawing Canvas Modal
function DrawingCanvas({ isOpen, onClose, onSave }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      setContext(ctx);
      
      // Set canvas size
      canvas.width = 800;
      canvas.height = 600;
      
      // White background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Drawing settings
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }
  }, [isOpen]);

  const startDrawing = (e) => {
    if (!context) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    context.beginPath();
    context.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing || !context) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    if (!context) return;
    setIsDrawing(false);
    context.beginPath();
  };

  const saveDrawing = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    onSave(dataURL);
    onClose();
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !context) return;
    const canvas = canvasRef.current;
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Draw & Sketch</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="border border-gray-300 rounded-lg overflow-hidden mb-4">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className="block cursor-crosshair max-w-full"
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
        
        <div className="flex gap-3 justify-between">
          <button
            onClick={clearCanvas}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveDrawing}
              className="px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Save & Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Share Chat Modal
function ShareChatModal({ isOpen, onClose, sessionId }) {
  const { shareChat, exportSession } = useSessionStore();
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    try {
      const shareId = shareChat(sessionId, {
        allowComments: true,
        isPublic: true,
      });
      
      const url = `${window.location.origin}/shared/${shareId}`;
      setShareUrl(url);
    } catch (error) {
      console.error('Failed to create share link:', error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  };

  const downloadTranscript = (format) => {
    try {
      const content = exportSession(sessionId, format);
      if (content) {
        const blob = new Blob([content], { 
          type: format === 'json' ? 'application/json' : 'text/plain' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-transcript.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download transcript:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Share & Export</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        {!shareUrl ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              Create a shareable link for this conversation.
            </p>
            <button
              onClick={handleShare}
              className="w-full px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Generate Share Link
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600">Share this link:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
              />
              <button
                onClick={copyToClipboard}
                className="px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-3">Download Transcript:</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => downloadTranscript('txt')}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              TXT
            </button>
            <button
              onClick={() => downloadTranscript('markdown')}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Markdown
            </button>
            <button
              onClick={() => downloadTranscript('json')}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// File Attachment Modal
function FileAttachModal({ isOpen, onClose, onFileSelect }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFileSelect(files);
      onClose();
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Attach Files</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            Select files to attach to your conversation.
          </p>
          
          <button
            onClick={openFileDialog}
            className="w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#176A82] hover:bg-gray-50 transition-colors text-center"
          >
            <div className="text-gray-600">
              <div className="text-lg mb-2">📁</div>
              <div>Click to browse files</div>
              <div className="text-sm text-gray-500 mt-1">or drag and drop</div>
            </div>
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.js,.py,.jsx,.tsx,.ts,.pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <p className="text-xs text-gray-500">
            Supported: Text, Markdown, JSON, CSV, Code files, PDFs, Documents
          </p>
        </div>
      </div>
    </div>
  );
}

// Main Interaction Handler
export default function InteractionHandler() {
  const [activeModal, setActiveModal] = useState(null);
  const { activeId, appendToActive, addContextFile } = useSessionStore();

  useEffect(() => {
    const handleInteract = (e) => {
      const { type } = e.detail || {};
      
      switch (type) {
        case 'draw':
          setActiveModal('draw');
          break;
        case 'share':
          if (activeId) {
            setActiveModal('share');
          } else {
            console.warn('No active chat to share');
          }
          break;
        case 'invite':
          console.log('Invite to chat - feature coming soon!');
          break;
        case 'download':
          if (activeId) {
            setActiveModal('share');
          } else {
            console.warn('No active chat to download');
          }
          break;
        case 'attach':
          setActiveModal('attach');
          break;
        case 'camera':
          console.log('Camera capture - feature coming soon!');
          break;
        default:
          console.log(`Unknown interaction type: ${type}`);
      }
    };

    const handleUpload = (e) => {
      const { type } = e.detail || {};
      if (type === 'context') {
        setActiveModal('attach');
      }
    };

    window.addEventListener('interact:open', handleInteract);
    window.addEventListener('upload:open', handleUpload);
    
    return () => {
      window.removeEventListener('interact:open', handleInteract);
      window.removeEventListener('upload:open', handleUpload);
    };
  }, [activeId]);

  const handleDrawingSave = (dataURL) => {
    if (!activeId) {
      console.warn('No active chat to save drawing to');
      return;
    }

    // Add drawing as message with attachment
    appendToActive({
      role: "user",
      content: "[Drawing attached - analyzing with vision model...]",
      attachments: [{
        type: "image",
        data: dataURL,
        timestamp: new Date().toISOString()
      }]
    });
    
    // Simulate vision model response
    setTimeout(() => {
      appendToActive({
        role: "assistant",
        content: "I can see your drawing! This is where vision model analysis would appear. The drawing has been saved and is ready for integration with GPT-4V or Claude Vision."
      });
    }, 1000);
  };

  const handleFileSelect = (files) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // Add to context files
          addContextFile({
            label: file.name,
            content: e.target.result,
            type: file.type,
            size: file.size
          });
          
          // Also add as message if in active chat
          if (activeId) {
            appendToActive({
              role: "user",
              content: `[File attached: ${file.name}]`,
              attachments: [{
                type: "file",
                name: file.name,
                content: e.target.result,
                timestamp: new Date().toISOString()
              }]
            });
          }
        } catch (error) {
          console.error('Failed to process file:', error);
        }
      };
      
      reader.onerror = () => {
        console.error('Failed to read file:', file.name);
      };
      
      reader.readAsText(file);
    });
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  return (
    <>
      <DrawingCanvas
        isOpen={activeModal === 'draw'}
        onClose={closeModal}
        onSave={handleDrawingSave}
      />
      
      <ShareChatModal
        isOpen={activeModal === 'share'}
        onClose={closeModal}
        sessionId={activeId}
      />
      
      <FileAttachModal
        isOpen={activeModal === 'attach'}
        onClose={closeModal}
        onFileSelect={handleFileSelect}
      />
    </>
  );
}