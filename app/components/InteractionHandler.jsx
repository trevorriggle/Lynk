"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSessionStore } from "../hooks/useSessionStore";

// Enhanced Photoshop-like Drawing Canvas
function EnhancedDrawingCanvas({ isOpen, onClose, onSave }) {
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const [context, setContext] = useState(null);
  const [previewContext, setPreviewContext] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState('#000000');
  const [layers, setLayers] = useState([]);
  const [activeLayer, setActiveLayer] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [message, setMessage] = useState('');

  // Selection and manipulation state
  const [selectedElement, setSelectedElement] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState(null);

  // Canvas initialization
  useEffect(() => {
    if (isOpen && canvasRef.current && previewCanvasRef.current) {
      const canvas = canvasRef.current;
      const previewCanvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const previewCtx = previewCanvas.getContext('2d');

      // Set canvas actual dimensions
      const containerWidth = canvas.parentElement.clientWidth - 32; // Account for padding
      const containerHeight = canvas.parentElement.clientHeight - 32;
      const aspectRatio = 4/3; // 4:3 aspect ratio

      let canvasWidth, canvasHeight;
      if (containerWidth / containerHeight > aspectRatio) {
        canvasHeight = containerHeight;
        canvasWidth = canvasHeight * aspectRatio;
      } else {
        canvasWidth = containerWidth;
        canvasHeight = canvasWidth / aspectRatio;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      previewCanvas.width = canvasWidth;
      previewCanvas.height = canvasHeight;

      // Set CSS dimensions to match
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      previewCanvas.style.width = `${canvasWidth}px`;
      previewCanvas.style.height = `${canvasHeight}px`;

      const initialLayer = {
        id: Date.now(),
        name: 'Background',
        canvas: document.createElement('canvas'),
        visible: true,
        opacity: 1,
        locked: false,
        elements: [] // Store drawable elements for manipulation
      };
      initialLayer.canvas.width = canvasWidth;
      initialLayer.canvas.height = canvasHeight;
      const layerCtx = initialLayer.canvas.getContext('2d');
      layerCtx.fillStyle = 'white';
      layerCtx.fillRect(0, 0, canvasWidth, canvasHeight);

      const initialState = [initialLayer];
      setLayers(initialState);
      setActiveLayer(0);
      setContext(ctx);
      setPreviewContext(previewCtx);

      // Initialize history with the initial state
      const historyEntry = {
        layers: JSON.parse(JSON.stringify(initialState.map(layer => ({
          ...layer,
          canvas: layer.canvas.toDataURL()
        })))),
        timestamp: Date.now()
      };
      setHistory([historyEntry]);
      setHistoryStep(0);

      redrawCanvas(initialState, ctx);
    }
  }, [isOpen]);

  // Enhanced redraw function with selection handles
  const redrawCanvas = useCallback((layerList, ctx) => {
    if (!ctx || !canvasRef.current) return;
    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    layerList.forEach(layer => {
      if (layer.visible) {
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.canvas, 0, 0);
      }
    });
    ctx.globalAlpha = 1;

    // Draw selection handles for selected element
    if (selectedElement) {
      drawSelectionHandles(ctx, selectedElement);
    }
  }, [selectedElement]);

  // Save state to history for undo/redo
  const saveToHistory = useCallback((layerList) => {
    const historyEntry = {
      layers: layerList.map(layer => ({
        ...layer,
        canvas: layer.canvas.toDataURL(),
        elements: [...layer.elements]
      })),
      timestamp: Date.now()
    };

    // Remove future history if we're not at the end
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(historyEntry);

    // Limit history to 50 entries
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryStep(historyStep + 1);
    }

    setHistory(newHistory);
  }, [history, historyStep]);

  // Undo function
  const undo = useCallback(() => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const historyEntry = history[newStep];

      const restoredLayers = historyEntry.layers.map(layerData => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 700;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          redrawCanvas(restoredLayers, context);
        };
        img.src = layerData.canvas;

        return {
          ...layerData,
          canvas,
          elements: [...layerData.elements]
        };
      });

      setLayers(restoredLayers);
      setHistoryStep(newStep);
      setSelectedElement(null);
    }
  }, [history, historyStep, context, redrawCanvas]);

  // Redo function
  const redo = useCallback(() => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      const historyEntry = history[newStep];

      const restoredLayers = historyEntry.layers.map(layerData => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 700;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          redrawCanvas(restoredLayers, context);
        };
        img.src = layerData.canvas;

        return {
          ...layerData,
          canvas,
          elements: [...layerData.elements]
        };
      });

      setLayers(restoredLayers);
      setHistoryStep(newStep);
      setSelectedElement(null);
    }
  }, [history, historyStep, context, redrawCanvas]);

  // Draw selection handles for selected elements
  const drawSelectionHandles = (ctx, element) => {
    const handleSize = 8;
    const { x, y, width, height } = element;

    // Draw selection border with Lynk brand color
    ctx.strokeStyle = '#176A82';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    // Draw resize handles
    ctx.fillStyle = '#176A82';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    const handles = [
      { x: x - handleSize/2, y: y - handleSize/2, cursor: 'nw-resize', type: 'nw' },
      { x: x + width/2 - handleSize/2, y: y - handleSize/2, cursor: 'n-resize', type: 'n' },
      { x: x + width - handleSize/2, y: y - handleSize/2, cursor: 'ne-resize', type: 'ne' },
      { x: x + width - handleSize/2, y: y + height/2 - handleSize/2, cursor: 'e-resize', type: 'e' },
      { x: x + width - handleSize/2, y: y + height - handleSize/2, cursor: 'se-resize', type: 'se' },
      { x: x + width/2 - handleSize/2, y: y + height - handleSize/2, cursor: 's-resize', type: 's' },
      { x: x - handleSize/2, y: y + height - handleSize/2, cursor: 'sw-resize', type: 'sw' },
      { x: x - handleSize/2, y: y + height/2 - handleSize/2, cursor: 'w-resize', type: 'w' }
    ];

    handles.forEach(handle => {
      ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
      ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
    });

    return handles;
  };

  // Get resize handle at point
  const getResizeHandleAt = (x, y, element) => {
    if (!element) return null;

    const handleSize = 8;
    const handles = [
      { x: element.x - handleSize/2, y: element.y - handleSize/2, type: 'nw' },
      { x: element.x + element.width/2 - handleSize/2, y: element.y - handleSize/2, type: 'n' },
      { x: element.x + element.width - handleSize/2, y: element.y - handleSize/2, type: 'ne' },
      { x: element.x + element.width - handleSize/2, y: element.y + element.height/2 - handleSize/2, type: 'e' },
      { x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2, type: 'se' },
      { x: element.x + element.width/2 - handleSize/2, y: element.y + element.height - handleSize/2, type: 's' },
      { x: element.x - handleSize/2, y: element.y + element.height - handleSize/2, type: 'sw' },
      { x: element.x - handleSize/2, y: element.y + element.height/2 - handleSize/2, type: 'w' }
    ];

    for (const handle of handles) {
      if (x >= handle.x && x <= handle.x + handleSize &&
          y >= handle.y && y <= handle.y + handleSize) {
        return handle.type;
      }
    }
    return null;
  };

  // Get accurate canvas coordinates accounting for CSS scaling
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // Find element at point
  const getElementAt = (x, y, layerIndex = null) => {
    const targetLayers = layerIndex !== null ? [layers[layerIndex]] : [...layers].reverse();

    for (const layer of targetLayers) {
      if (!layer.visible || !layer.elements) continue;

      for (const element of [...layer.elements].reverse()) {
        if (element && x >= element.x && x <= element.x + element.width &&
            y >= element.y && y <= element.y + element.height) {
          return { element, layer };
        }
      }
    }
    return null;
  };

  // Utility function to clone canvas
  const cloneCanvas = (canvas) => {
    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    clone.getContext('2d').drawImage(canvas, 0, 0);
    return clone;
  };

  // Enhanced mouse down handler
  const handleMouseDown = (e) => {
    const { x, y } = getCanvasCoordinates(e);
    e.preventDefault();

    if (tool === 'select') {
      // Check if clicking on resize handle of selected element
      if (selectedElement) {
        const handle = getResizeHandleAt(x, y, selectedElement);
        if (handle) {
          setIsResizing(true);
          setResizeHandle(handle);
          setDragStart({ x, y });
          return;
        }
      }

      // Check if clicking on an element
      const elementAtPoint = getElementAt(x, y);
      if (elementAtPoint) {
        setSelectedElement(elementAtPoint.element);
        setIsDragging(true);
        setDragStart({ x: x - elementAtPoint.element.x, y: y - elementAtPoint.element.y });
      } else {
        setSelectedElement(null);
      }
      redrawCanvas(layers, context);
      return;
    }

    // Clear selection when drawing
    setSelectedElement(null);

    if (!layers[activeLayer]) return;
    setIsDrawing(true);
    setDragStart({ x, y });

    const layerCtx = layers[activeLayer].canvas.getContext('2d');

    if (tool === 'brush') {
      layerCtx.globalCompositeOperation = 'source-over';
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = brushSize;
      layerCtx.lineCap = 'round';
      layerCtx.lineJoin = 'round';
      layerCtx.beginPath();
      layerCtx.moveTo(x, y);
    } else if (tool === 'eraser') {
      layerCtx.globalCompositeOperation = 'destination-out';
      layerCtx.lineWidth = brushSize;
      layerCtx.lineCap = 'round';
      layerCtx.lineJoin = 'round';
      layerCtx.beginPath();
      layerCtx.moveTo(x, y);
    }
  };

  // Enhanced mouse move handler
  const handleMouseMove = (e) => {
    const { x, y } = getCanvasCoordinates(e);

    if (tool === 'select') {
      // Handle dragging selected element
      if (isDragging && selectedElement) {
        const newLayers = [...layers];
        const layerIndex = newLayers.findIndex(layer =>
          layer.elements.some(el => el.id === selectedElement.id)
        );

        if (layerIndex !== -1) {
          const elementIndex = newLayers[layerIndex].elements.findIndex(el => el.id === selectedElement.id);
          if (elementIndex !== -1) {
            const newElement = {
              ...selectedElement,
              x: x - dragStart.x,
              y: y - dragStart.y
            };
            newLayers[layerIndex].elements[elementIndex] = newElement;
            setSelectedElement(newElement);
            setLayers(newLayers);
            redrawCanvas(newLayers, context);
          }
        }
        return;
      }

      // Handle resizing selected element
      if (isResizing && selectedElement && resizeHandle) {
        const newLayers = [...layers];
        const layerIndex = newLayers.findIndex(layer =>
          layer.elements.some(el => el.id === selectedElement.id)
        );

        if (layerIndex !== -1) {
          const elementIndex = newLayers[layerIndex].elements.findIndex(el => el.id === selectedElement.id);
          if (elementIndex !== -1) {
            const element = selectedElement;
            const dx = x - dragStart.x;
            const dy = y - dragStart.y;

            let newElement = { ...element };

            // Handle different resize handles
            switch (resizeHandle) {
              case 'se':
                newElement.width = Math.max(20, element.width + dx);
                newElement.height = Math.max(20, element.height + dy);
                break;
              case 'sw':
                newElement.width = Math.max(20, element.width - dx);
                newElement.height = Math.max(20, element.height + dy);
                newElement.x = element.x + (element.width - newElement.width);
                break;
              case 'ne':
                newElement.width = Math.max(20, element.width + dx);
                newElement.height = Math.max(20, element.height - dy);
                newElement.y = element.y + (element.height - newElement.height);
                break;
              case 'nw':
                newElement.width = Math.max(20, element.width - dx);
                newElement.height = Math.max(20, element.height - dy);
                newElement.x = element.x + (element.width - newElement.width);
                newElement.y = element.y + (element.height - newElement.height);
                break;
            }

            newLayers[layerIndex].elements[elementIndex] = newElement;
            setSelectedElement(newElement);
            setLayers(newLayers);
            redrawCanvas(newLayers, context);
          }
        }
        return;
      }

      // Update cursor based on hover
      if (selectedElement) {
        const handle = getResizeHandleAt(x, y, selectedElement);
        if (handle) {
          const cursors = {
            'nw': 'nw-resize', 'n': 'n-resize', 'ne': 'ne-resize',
            'w': 'w-resize', 'e': 'e-resize',
            'sw': 'sw-resize', 's': 's-resize', 'se': 'se-resize'
          };
          canvasRef.current.style.cursor = cursors[handle] || 'default';
        } else if (x >= selectedElement.x && x <= selectedElement.x + selectedElement.width &&
                   y >= selectedElement.y && y <= selectedElement.y + selectedElement.height) {
          canvasRef.current.style.cursor = 'move';
        } else {
          canvasRef.current.style.cursor = 'default';
        }
      } else {
        canvasRef.current.style.cursor = 'default';
      }
      return;
    }

    // Handle drawing
    if (!isDrawing || !layers[activeLayer]) return;

    const layerCtx = layers[activeLayer].canvas.getContext('2d');

    if (tool === 'brush' || tool === 'eraser') {
      layerCtx.lineTo(x, y);
      layerCtx.stroke();
      redrawCanvas(layers, context);
    }
  };

  // Enhanced mouse up handler
  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (layers[activeLayer]) {
        const layerCtx = layers[activeLayer].canvas.getContext('2d');
        layerCtx.beginPath();
        // Save to history after drawing
        setTimeout(() => saveToHistory(layers), 0);
      }
    }

    if (isDragging) {
      setIsDragging(false);
      // Save to history after dragging
      setTimeout(() => saveToHistory(layers), 0);
    }

    if (isResizing) {
      setIsResizing(false);
      setResizeHandle(null);
      // Save to history after resizing
      setTimeout(() => saveToHistory(layers), 0);
    }

    // Reset cursor
    if (canvasRef.current) {
      canvasRef.current.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }
  };

  // Enhanced layer management
  const addLayer = () => {
    const newLayer = {
      id: Date.now(),
      name: `Layer ${layers.length + 1}`,
      canvas: document.createElement('canvas'),
      visible: true,
      opacity: 1,
      locked: false,
      elements: []
    };
    newLayer.canvas.width = 1000;
    newLayer.canvas.height = 700;
    const newLayers = [...layers, newLayer];
    setLayers(newLayers);
    setActiveLayer(newLayers.length - 1);
    saveToHistory(newLayers);
  };

  const deleteLayer = (layerIndex) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter((_, index) => index !== layerIndex);
    setLayers(newLayers);
    setActiveLayer(Math.max(0, Math.min(activeLayer, newLayers.length - 1)));
    setSelectedElement(null);
    redrawCanvas(newLayers, context);
    saveToHistory(newLayers);
  };

  const toggleLayerVisibility = (layerIndex) => {
    const newLayers = [...layers];
    newLayers[layerIndex].visible = !newLayers[layerIndex].visible;
    setLayers(newLayers);
    redrawCanvas(newLayers, context);
    saveToHistory(newLayers);
  };

  const toggleLayerLock = (layerIndex) => {
    const newLayers = [...layers];
    newLayers[layerIndex].locked = !newLayers[layerIndex].locked;
    setLayers(newLayers);
    saveToHistory(newLayers);
  };

  const updateLayerOpacity = (layerIndex, opacity) => {
    const newLayers = [...layers];
    newLayers[layerIndex].opacity = opacity;
    setLayers(newLayers);
    redrawCanvas(newLayers, context);
  };

  const duplicateLayer = (layerIndex) => {
    const layerToDuplicate = layers[layerIndex];
    const newLayer = {
      id: Date.now(),
      name: `${layerToDuplicate.name} Copy`,
      canvas: cloneCanvas(layerToDuplicate.canvas),
      visible: true,
      opacity: layerToDuplicate.opacity,
      locked: false,
      elements: layerToDuplicate.elements.map(el => ({ ...el, id: Date.now() + Math.random() }))
    };

    const newLayers = [...layers];
    newLayers.splice(layerIndex + 1, 0, newLayer);
    setLayers(newLayers);
    setActiveLayer(layerIndex + 1);
    redrawCanvas(newLayers, context);
    saveToHistory(newLayers);
  };

  // Enhanced image upload with element tracking
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1000;
        const maxHeight = 700;
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (maxWidth - width) / 2;
        const y = (maxHeight - height) / 2;

        // Create a new element for the image
        const imageElement = {
          id: Date.now(),
          type: 'image',
          x, y, width, height,
          img,
          originalWidth: img.width,
          originalHeight: img.height,
          rotation: 0,
          opacity: 1
        };

        const newLayers = [...layers];
        if (!newLayers[activeLayer].elements) {
          newLayers[activeLayer].elements = [];
        }
        newLayers[activeLayer].elements.push(imageElement);

        // Draw to canvas
        const layerCtx = newLayers[activeLayer].canvas.getContext('2d');
        layerCtx.save();
        layerCtx.globalAlpha = imageElement.opacity;
        layerCtx.drawImage(img, x, y, width, height);
        layerCtx.restore();

        setLayers(newLayers);
        redrawCanvas(newLayers, context);
        saveToHistory(newLayers);

        // Auto-select the newly added image
        setSelectedElement(imageElement);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    // Clear the input value to allow uploading the same file again
    e.target.value = '';
  };

  // Enhanced save with message integration
  const saveDrawing = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png', 0.9);

    // Send both the image and message as a two-part conversation
    onSave({
      image: dataURL,
      message: message.trim() || 'I\'ve created an image for analysis.'
    });
    onClose();
  };

  // Clear canvas
  const clearCanvas = () => {
    if (window.confirm('Are you sure you want to clear the entire canvas? This action cannot be undone.')) {
      const newLayers = [{
        id: Date.now(),
        name: 'Background',
        canvas: document.createElement('canvas'),
        visible: true,
        opacity: 1,
        locked: false,
        elements: []
      }];
      newLayers[0].canvas.width = 1000;
      newLayers[0].canvas.height = 700;
      const ctx = newLayers[0].canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 1000, 700);

      setLayers(newLayers);
      setActiveLayer(0);
      setSelectedElement(null);
      setHistory([{
        layers: newLayers.map(layer => ({
          ...layer,
          canvas: layer.canvas.toDataURL()
        })),
        timestamp: Date.now()
      }]);
      setHistoryStep(0);
      redrawCanvas(newLayers, context);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200]">
      <div className="bg-gray-100 rounded-xl shadow-2xl w-[95vw] h-[95vh] max-w-[1400px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#176A82] text-white px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Lynk Image Editor</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyStep <= 0}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              ↶ Undo
            </button>
            <button
              onClick={redo}
              disabled={historyStep >= history.length - 1}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              ↷ Redo
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Left Panel - File Operations */}
          <div className="w-16 bg-gray-200 flex flex-col items-center py-4 space-y-3 border-r">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="w-12 h-12 rounded-lg flex items-center justify-center hover:bg-gray-300 cursor-pointer transition-colors bg-white shadow-sm"
              title="Upload Image"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                <path d="M12,11L16,15H13V19H11V15H8L12,11Z"/>
              </svg>
            </label>

            <button
              onClick={clearCanvas}
              className="w-12 h-12 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors bg-white shadow-sm text-red-600"
              title="Clear Canvas"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
              </svg>
            </button>
          </div>

          {/* Tools and Properties Panel */}
          <div className="w-64 bg-white flex flex-col border-r">
            {/* Tools Row */}
            <div className="p-4 border-b">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setTool('brush')}
                  className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                    tool === 'brush' ? 'bg-[#176A82] text-white' : 'hover:bg-gray-100 bg-gray-50'
                  }`}
                  title="Brush Tool"
                >
                  <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.71,4.63L19.37,3.29C19,2.9 18.35,2.9 17.96,3.29L9,12.25L11.75,15L20.71,6.04C21.1,5.65 21.1,5 20.71,4.63M7,14A3,3 0 0,0 4,17C4,18.31 2.84,19 2,19C2.92,20.22 4.5,21 6,21A4,4 0 0,0 10,17A3,3 0 0,0 7,14Z"/>
                  </svg>
                  <span className="text-xs">Brush</span>
                </button>

                <button
                  onClick={() => setTool('eraser')}
                  className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                    tool === 'eraser' ? 'bg-[#176A82] text-white' : 'hover:bg-gray-100 bg-gray-50'
                  }`}
                  title="Eraser Tool"
                >
                  <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.24,3.56L21.19,8.5C21.97,9.29 21.97,10.55 21.19,11.34L12,20.53C10.44,22.09 7.91,22.09 6.34,20.53L2.81,17C2.03,16.21 2.03,14.95 2.81,14.16L13.41,3.56C14.2,2.78 15.46,2.78 16.24,3.56M4.22,15.58L7.76,19.11C8.54,19.9 9.8,19.9 10.59,19.11L14.12,15.58L9.17,10.63L4.22,15.58Z"/>
                  </svg>
                  <span className="text-xs">Erase</span>
                </button>

                <button
                  onClick={() => setTool('select')}
                  className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                    tool === 'select' ? 'bg-[#176A82] text-white' : 'hover:bg-gray-100 bg-gray-50'
                  }`}
                  title="Select Tool"
                >
                  <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2,2V11H6.5L12,5.5L18.5,12L13,17.5V22H22V13H17.5L12,18.5L5.5,12L11,6.5V2H2M4,4H9V7.5L4,12.5V4M15,13H20V20H15V16.5L20,11.5V20H15V13Z"/>
                  </svg>
                  <span className="text-xs">Select</span>
                </button>
              </div>
            </div>

            {/* Tool Properties */}
            <div className="p-4 border-b">
              {(tool === 'brush' || tool === 'eraser') && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Size: {brushSize}px
                    </label>
                    <input
                      type="range"
                      min="1" max="100" value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full accent-[#176A82]"
                    />
                  </div>

                  {tool === 'brush' && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color" value={brushColor}
                          onChange={(e) => setBrushColor(e.target.value)}
                          className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text" value={brushColor}
                          onChange={(e) => setBrushColor(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Layers Panel */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center p-4 pb-2">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Layers</h3>
                <button
                  onClick={addLayer}
                  className="w-6 h-6 bg-[#176A82] text-white rounded flex items-center justify-center hover:bg-[#155a6d] transition-colors"
                  title="Add Layer"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="space-y-2">
                  {[...layers].reverse().map((layer, reverseIndex) => {
                    const index = layers.length - 1 - reverseIndex;
                    return (
                      <div
                        key={layer.id}
                        className={`group p-3 rounded-lg border cursor-pointer transition-colors ${
                          index === activeLayer
                            ? 'border-[#176A82] bg-[#176A82]/10'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setActiveLayer(index)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLayerVisibility(index);
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded"
                            title={layer.visible ? "Hide layer" : "Show layer"}
                          >
                            {layer.visible ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/>
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.09L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.76,7.13 11.37,7 12,7Z"/>
                              </svg>
                            )}
                          </button>

                          <span className="flex-1 text-sm font-medium truncate">
                            {layer.name}
                          </span>

                          {layers.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteLayer(index);
                              }}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Delete layer"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                              </svg>
                            </button>
                          )}
                        </div>

                        <div>
                          <input
                            type="range"
                            min="0" max="1" step="0.01" value={layer.opacity}
                            onChange={(e) => updateLayerOpacity(index, Number(e.target.value))}
                            className="w-full accent-[#176A82]"
                            onClick={(e) => e.stopPropagation()}
                            title={`Opacity: ${Math.round(layer.opacity * 100)}%`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 flex flex-col bg-gray-50">
            <div className="flex-1 p-4">
              <div className="relative w-full h-full bg-white rounded-lg border border-gray-300 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={previewCanvasRef}
                  className="absolute pointer-events-none z-10"
                />
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className={`block ${
                    tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
                  }`}
                />
              </div>
            </div>

            {/* Message Input */}
            <div className="bg-white border-t p-4">
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Message to send with image:
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what you'd like me to analyze about this image..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-[#176A82] focus:border-[#176A82] text-sm"
                  rows="2"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDrawing}
                  className="px-6 py-2 bg-[#176A82] text-white rounded-lg hover:bg-[#155a6d] font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                  </svg>
                  Send to Chat
                </button>
              </div>
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

  const handleDrawingSave = (data) => {
    if (!activeId) return;

    // Send single message with image attachment and user's message
    const imageData = typeof data === 'string' ? data : data.image;
    const message = data.message || "I've created an image. Please analyze what you see in this image.";

    appendToActive({
      role: "user",
      content: message,
      attachments: [{
        type: "image",
        data: imageData,
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