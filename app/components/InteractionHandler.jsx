"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// Enhanced Drawing Canvas with Photoshop-like features
function EnhancedDrawingCanvas({ isOpen, onClose, onSave }) {
  const canvasRef = useRef(null);
  const [context, setContext] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('brush'); // brush, eraser, select, text
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState('#000000');
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);

  // Initialize canvas and first layer
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.width = 800;
      canvas.height = 600;
      
      // Create initial layer
      const initialLayer = {
        id: 0,
        name: 'Layer 1',
        canvas: document.createElement('canvas'),
        visible: true,
        opacity: 1
      };
      initialLayer.canvas.width = 800;
      initialLayer.canvas.height = 600;
      const layerCtx = initialLayer.canvas.getContext('2d');
      layerCtx.fillStyle = 'white';
      layerCtx.fillRect(0, 0, 800, 600);
      
      setLayers([initialLayer]);
      setActiveLayer(0);
      setContext(ctx);
      redrawCanvas([initialLayer], ctx);
    }
  }, [isOpen]);

  const redrawCanvas = useCallback((layerList, ctx) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 800, 600);
    layerList.forEach(layer => {
      if (layer.visible) {
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.canvas, 0, 0);
      }
    });
    ctx.globalAlpha = 1;
  }, []);

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyStep + 1);
    const snapshot = layers.map(layer => ({
      ...layer,
      canvas: cloneCanvas(layer.canvas)
    }));
    newHistory.push(snapshot);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [layers, history, historyStep]);

  const cloneCanvas = (canvas) => {
    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    clone.getContext('2d').drawImage(canvas, 0, 0);
    return clone;
  };

  const startDrawing = (e) => {
    if (!layers[activeLayer]) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoordinates(e);
    const layerCtx = layers[activeLayer].canvas.getContext('2d');
    
    if (tool === 'brush') {
      layerCtx.globalCompositeOperation = 'source-over';
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = brushSize;
      layerCtx.lineCap = 'round';
    } else if (tool === 'eraser') {
      layerCtx.globalCompositeOperation = 'destination-out';
      layerCtx.lineWidth = brushSize;
      layerCtx.lineCap = 'round';
    }
    
    layerCtx.beginPath();
    layerCtx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing || !layers[activeLayer]) return;
    const { x, y } = getCanvasCoordinates(e);
    const layerCtx = layers[activeLayer].canvas.getContext('2d');
    
    layerCtx.lineTo(x, y);
    layerCtx.stroke();
    
    redrawCanvas(layers, context);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (layers[activeLayer]) {
      const layerCtx = layers[activeLayer].canvas.getContext('2d');
      layerCtx.beginPath();
    }
    saveToHistory();
  };

  const addLayer = () => {
    const newLayer = {
      id: Date.now(),
      name: `Layer ${layers.length + 1}`,
      canvas: document.createElement('canvas'),
      visible: true,
      opacity: 1
    };
    newLayer.canvas.width = 800;
    newLayer.canvas.height = 600;
    const newLayers = [...layers, newLayer];
    setLayers(newLayers);
    setActiveLayer(newLayers.length - 1);
  };

  const deleteLayer = (layerIndex) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter((_, index) => index !== layerIndex);
    setLayers(newLayers);
    setActiveLayer(Math.max(0, Math.min(activeLayer, newLayers.length - 1)));
    redrawCanvas(newLayers, context);
  };

  const toggleLayerVisibility = (layerIndex) => {
    const newLayers = [...layers];
    newLayers[layerIndex].visible = !newLayers[layerIndex].visible;
    setLayers(newLayers);
    redrawCanvas(newLayers, context);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Add new layer for uploaded image
        const imageLayer = {
          id: Date.now(),
          name: `Image ${layers.length + 1}`,
          canvas: document.createElement('canvas'),
          visible: true,
          opacity: 1
        };
        imageLayer.canvas.width = 800;
        imageLayer.canvas.height = 600;
        const layerCtx = imageLayer.canvas.getContext('2d');
        
        // Scale image to fit canvas while maintaining aspect ratio
        const scale = Math.min(800 / img.width, 600 / img.height);
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (800 - width) / 2;
        const y = (600 - height) / 2;
        
        layerCtx.drawImage(img, x, y, width, height);
        
        const newLayers = [...layers, imageLayer];
        setLayers(newLayers);
        setActiveLayer(newLayers.length - 1);
        redrawCanvas(newLayers, context);
        saveToHistory();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const undo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const snapshot = history[newStep];
      setLayers(snapshot.map(layer => ({
        ...layer,
        canvas: cloneCanvas(layer.canvas)
      })));
      setHistoryStep(newStep);
      redrawCanvas(snapshot, context);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      const snapshot = history[newStep];
      setLayers(snapshot.map(layer => ({
        ...layer,
        canvas: cloneCanvas(layer.canvas)
      })));
      setHistoryStep(newStep);
      redrawCanvas(snapshot, context);
    }
  };

  const clearCanvas = () => {
    if (layers[activeLayer]) {
      const layerCtx = layers[activeLayer].canvas.getContext('2d');
      layerCtx.clearRect(0, 0, 800, 600);
      redrawCanvas(layers, context);
      saveToHistory();
    }
  };

  const saveDrawing = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    onSave(dataURL);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-4 max-w-6xl w-full mx-4 max-h-[95vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Advanced Drawing Studio</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="flex gap-4">
          {/* Left Panel - Tools & Settings */}
          <div className="w-64 space-y-4">
            {/* Tools */}
            <div className="border rounded-lg p-3">
              <h3 className="font-semibold mb-2">Tools</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTool('brush')}
                  className={`p-2 rounded ${tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                  🖌️ Brush
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`p-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                  🧽 Eraser
                </button>
              </div>
            </div>

            {/* Brush Settings */}
            <div className="border rounded-lg p-3">
              <h3 className="font-semibold mb-2">Brush Settings</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm">Size: {brushSize}px</label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm">Color:</label>
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-full h-8 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Image Upload */}
            <div className="border rounded-lg p-3">
              <h3 className="font-semibold mb-2">Add Image</h3>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-sm"
              />
            </div>

            {/* Layers Panel */}
            <div className="border rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">Layers</h3>
                <button
                  onClick={addLayer}
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {layers.map((layer, index) => (
                  <div
                    key={layer.id}
                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                      index === activeLayer ? 'bg-blue-100' : 'bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => toggleLayerVisibility(index)}
                      className="text-xs"
                    >
                      {layer.visible ? '👁️' : '🚫'}
                    </button>
                    <span
                      className="flex-1 cursor-pointer"
                      onClick={() => setActiveLayer(index)}
                    >
                      {layer.name}
                    </span>
                    {layers.length > 1 && (
                      <button
                        onClick={() => deleteLayer(index)}
                        className="text-xs text-red-500"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Canvas */}
          <div className="flex-1">
            <div className="border border-gray-300 rounded-lg overflow-hidden mb-4">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="block cursor-crosshair max-w-full bg-white"
                style={{ width: '100%', height: 'auto' }}
              />
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3 justify-between">
              <div className="flex gap-2">
                <button
                  onClick={undo}
                  disabled={historyStep <= 0}
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={redo}
                  disabled={historyStep >= history.length - 1}
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  ↷ Redo
                </button>
                <button
                  onClick={clearCanvas}
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Clear Layer
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDrawing}
                  className="px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90"
                >
                  Save & Send to Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Share Chat Modal (unchanged from before)
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
              className="w-full px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90"
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
                className="px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90 whitespace-nowrap"
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
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              TXT
            </button>
            <button
              onClick={() => downloadTranscript('markdown')}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Markdown
            </button>
            <button
              onClick={() => downloadTranscript('json')}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// File Attachment Modal (unchanged)
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
            className="w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#176A82] hover:bg-gray-50 text-center"
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

    // Add drawing as message with attachment that the AI can see
    appendToActive({
      role: "user",
      content: "I've created an image. Please analyze what you see in this image.",
      attachments: [{
        type: "image",
        data: dataURL,
        timestamp: new Date().toISOString()
      }]
    });
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
      <EnhancedDrawingCanvas
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