"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// Enhanced Drawing Canvas with auto-send and image resizing
function EnhancedDrawingCanvas({ isOpen, onClose, onSave }) {
  const canvasRef = useRef(null);
  const [context, setContext] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState('#000000');
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);
  
  // Image resizing state
  const [selectedImage, setSelectedImage] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.width = 800;
      canvas.height = 600;
      
      const initialLayer = {
        id: 0,
        name: 'Layer 1',
        canvas: document.createElement('canvas'),
        visible: true,
        opacity: 1,
        images: [] // Track images in this layer for resizing
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
        
        // Draw resize handles for selected image
        if (selectedImage && layer.images) {
          const img = layer.images.find(i => i.id === selectedImage.id);
          if (img) {
            drawResizeHandles(ctx, img);
          }
        }
      }
    });
    ctx.globalAlpha = 1;
  }, [selectedImage]);

  const drawResizeHandles = (ctx, img) => {
    const handleSize = 8;
    const { x, y, width, height } = img;
    
    // Draw selection border
    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
    
    // Draw resize handles
    ctx.fillStyle = '#0066cc';
    const handles = [
      { x: x - handleSize/2, y: y - handleSize/2 }, // top-left
      { x: x + width - handleSize/2, y: y - handleSize/2 }, // top-right
      { x: x - handleSize/2, y: y + height - handleSize/2 }, // bottom-left
      { x: x + width - handleSize/2, y: y + height - handleSize/2 }, // bottom-right
    ];
    
    handles.forEach(handle => {
      ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
    });
  };

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

  const cloneCanvas = (canvas) => {
    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    clone.getContext('2d').drawImage(canvas, 0, 0);
    return clone;
  };

  const startDrawing = (e) => {
    const { x, y } = getCanvasCoordinates(e);
    
    // Check if clicking on an image first
    const currentLayer = layers[activeLayer];
    if (currentLayer && currentLayer.images) {
      const clickedImage = currentLayer.images.find(img => 
        x >= img.x && x <= img.x + img.width &&
        y >= img.y && y <= img.y + img.height
      );
      
      if (clickedImage) {
        setSelectedImage(clickedImage);
        setTool('select');
        redrawCanvas(layers, context);
        return;
      }
    }
    
    setSelectedImage(null);
    
    if (!layers[activeLayer] || tool === 'select') return;
    setIsDrawing(true);
    
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
    if (!isDrawing || !layers[activeLayer] || tool === 'select') return;
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
  };

  const addLayer = () => {
    const newLayer = {
      id: Date.now(),
      name: `Layer ${layers.length + 1}`,
      canvas: document.createElement('canvas'),
      visible: true,
      opacity: 1,
      images: []
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
        const scale = Math.min(800 / img.width, 600 / img.height, 1);
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (800 - width) / 2;
        const y = (600 - height) / 2;
        
        // Add to current layer's images array for resizing
        const imageData = {
          id: Date.now(),
          img,
          x, y, width, height,
          originalWidth: img.width,
          originalHeight: img.height
        };
        
        const newLayers = [...layers];
        if (!newLayers[activeLayer].images) {
          newLayers[activeLayer].images = [];
        }
        newLayers[activeLayer].images.push(imageData);
        
        // Draw to canvas
        const layerCtx = newLayers[activeLayer].canvas.getContext('2d');
        layerCtx.drawImage(img, x, y, width, height);
        
        setLayers(newLayers);
        redrawCanvas(newLayers, context);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveDrawing = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    
    // Auto-send the image immediately
    onSave(dataURL);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-4 max-w-6xl w-full mx-4 max-h-[95vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Advanced Drawing Studio</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        
        <div className="flex gap-4">
          <div className="w-64 space-y-4">
            <div className="border rounded-lg p-3">
              <h3 className="font-semibold mb-2">Tools</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTool('brush')}
                  className={`p-2 rounded text-xs ${tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                  Brush
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`p-2 rounded text-xs ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                  Eraser
                </button>
                <button
                  onClick={() => setTool('select')}
                  className={`p-2 rounded text-xs ${tool === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                  Select
                </button>
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <h3 className="font-semibold mb-2">Brush Settings</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm">Size: {brushSize}px</label>
                  <input
                    type="range" min="1" max="50" value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm">Color:</label>
                  <input
                    type="color" value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-full h-8 rounded"
                  />
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <h3 className="font-semibold mb-2">Add Image</h3>
              <input
                type="file" accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-sm"
              />
            </div>

            <div className="border rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">Layers</h3>
                <button onClick={addLayer} className="text-xs bg-blue-500 text-white px-2 py-1 rounded">+ Add</button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {layers.map((layer, index) => (
                  <div key={layer.id} className={`flex items-center gap-2 p-2 rounded text-sm ${index === activeLayer ? 'bg-blue-100' : 'bg-gray-50'}`}>
                    <button onClick={() => toggleLayerVisibility(index)} className="text-xs">
                      {layer.visible ? '👁️' : '🚫'}
                    </button>
                    <span className="flex-1 cursor-pointer" onClick={() => setActiveLayer(index)}>
                      {layer.name}
                    </span>
                    {layers.length > 1 && (
                      <button onClick={() => deleteLayer(index)} className="text-xs text-red-500">🗑️</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

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
            
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={saveDrawing} className="px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90">
                Send to Chat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Enhanced File Attachment Modal with image preview
function FileAttachModal({ isOpen, onClose, onFileSelect }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFileSelect(files);
      onClose();
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileSelect(files);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Attach Files</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">Select files to attach to your conversation.</p>
          
          <div
            className={`relative px-4 py-8 border-2 border-dashed rounded-lg text-center transition-colors ${
              dragActive ? 'border-[#176A82] bg-[#176A82]/5' : 'border-gray-300 hover:border-[#176A82] hover:bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-gray-600">
              <div className="text-2xl mb-2">📎</div>
              <div>Click to browse files or drag and drop</div>
              <div className="text-sm text-gray-500 mt-1">Images, documents, code files</div>
            </div>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.csv,.js,.py,.jsx,.tsx,.ts,.pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <p className="text-xs text-gray-500">
            Supported: Images (JPG, PNG, GIF), Text files, Code files, Documents
          </p>
        </div>
      </div>
    </div>
  );
}

// Share Chat Modal (keeping existing functionality)
function ShareChatModal({ isOpen, onClose, sessionId }) {
  const { shareChat, exportSession } = useSessionStore();
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    try {
      const shareId = shareChat(sessionId, { allowComments: true, isPublic: true });
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
        const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
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
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        
        {!shareUrl ? (
          <div className="space-y-4">
            <p className="text-gray-600">Create a shareable link for this conversation.</p>
            <button onClick={handleShare} className="w-full px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90">
              Generate Share Link
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600">Share this link:</p>
            <div className="flex gap-2">
              <input
                type="text" value={shareUrl} readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
              />
              <button onClick={copyToClipboard} className="px-4 py-2 bg-[#176A82] text-white rounded-lg hover:opacity-90 whitespace-nowrap">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-3">Download Transcript:</p>
          <div className="grid grid-cols-3 gap-2">
            {['txt', 'markdown', 'json'].map(format => (
              <button
                key={format}
                onClick={() => downloadTranscript(format)}
                className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
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
          }
          break;
        case 'attach':
          setActiveModal('attach');
          break;
        default:
          console.log(`Interaction type: ${type}`);
      }
    };

    window.addEventListener('interact:open', handleInteract);
    return () => window.removeEventListener('interact:open', handleInteract);
  }, [activeId]);

  const handleDrawingSave = (dataURL) => {
    if (!activeId) return;

    // Add drawing to user's chat with proper attachment
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
      if (file.type.startsWith('image/')) {
        // Handle image files
        const reader = new FileReader();
        reader.onload = (e) => {
          if (activeId) {
            appendToActive({
              role: "user",
              content: `I've uploaded an image: ${file.name}. Please analyze this image.`,
              attachments: [{
                type: "image",
                data: e.target.result,
                filename: file.name,
                timestamp: new Date().toISOString()
              }]
            });
          }
        };
        reader.readAsDataURL(file);
      } else {
        // Handle other file types
        const reader = new FileReader();
        reader.onload = (e) => {
          addContextFile({
            label: file.name,
            content: e.target.result,
            type: file.type,
            size: file.size
          });
          
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
        };
        reader.readAsText(file);
      }
    });
  };

  return (
    <>
      <EnhancedDrawingCanvas
        isOpen={activeModal === 'draw'}
        onClose={() => setActiveModal(null)}
        onSave={handleDrawingSave}
      />
      
      <ShareChatModal
        isOpen={activeModal === 'share'}
        onClose={() => setActiveModal(null)}
        sessionId={activeId}
      />
      
      <FileAttachModal
        isOpen={activeModal === 'attach'}
        onClose={() => setActiveModal(null)}
        onFileSelect={handleFileSelect}
      />
    </>
  );
}