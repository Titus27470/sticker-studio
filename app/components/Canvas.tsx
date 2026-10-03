"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import {
  AnimationType,
  startPreviewAnimation,
  exportAnimatedGif,
  downloadBlob,
} from "./gifExport";

const EMOJIS = ["😀", "😂", "😍", "🔥", "💯", "⭐", "❤️", "🎉", "👍", "🙌", "😎", "🤩", "💜", "✨", "🌈", "🍕"];

const COLORS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#78716c", "#a16207",
];

const ANIMATIONS: { key: AnimationType; label: string; emoji: string }[] = [
  { key: "bounce", label: "Bounce", emoji: "🏀" },
  { key: "spin", label: "Spin", emoji: "🌀" },
  { key: "wiggle", label: "Wiggle", emoji: "🐍" },
  { key: "pulse", label: "Pulse", emoji: "💓" },
  { key: "fade", label: "Fade", emoji: "🌙" },
];

const MASK_SHAPES = [
  { key: "circle", label: "Circle" },
  { key: "rounded", label: "Rounded" },
  { key: "star", label: "Star" },
  { key: "heart", label: "Heart" },
  { key: "triangle", label: "Triangle" },
] as const;

type MaskShape = (typeof MASK_SHAPES)[number]["key"];

const CANVAS_W = 600;
const CANVAS_H = 600;

export default function Canvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isRestoringRef = useRef<boolean>(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const [activeAnimations, setActiveAnimations] = useState<AnimationType[]>([]);
  const stopPreviewRef = useRef<(() => void) | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [isCropping, setIsCropping] = useState(false);
  const cropRectRef = useRef<fabric.Rect | null>(null);
  const cropTargetRef = useRef<fabric.FabricImage | null>(null);
  const originalOpacityRef = useRef<number>(1);

  const [isMasking, setIsMasking] = useState(false);
  const [maskShape, setMaskShape] = useState<MaskShape | null>(null);
  const maskPreviewRef = useRef<fabric.Object | null>(null);
  const maskTargetRef = useRef<fabric.FabricImage | null>(null);

  const saveHistory = () => {
    const canvas = fabricRef.current;
    if (!canvas || isRestoringRef.current) return;
    const json = JSON.stringify(canvas.toJSON());
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  const restoreFromHistory = async (index: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = historyRef.current[index];
    if (!json) return;
    isRestoringRef.current = true;
    await canvas.loadFromJSON(json);
    canvas.renderAll();
    isRestoringRef.current = false;
  };

  const undo = async () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    await restoreFromHistory(historyIndexRef.current);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const redo = async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    await restoreFromHistory(historyIndexRef.current);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;
    if (fabricRef.current) return;

    const canvas = new fabric.Canvas(el, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#ffffff",
    });
    fabricRef.current = canvas;

    historyRef.current = [JSON.stringify(canvas.toJSON())];
    historyIndexRef.current = 0;

    canvas.on("object:added", saveHistory);
    canvas.on("object:removed", saveHistory);
    canvas.on("object:modified", saveHistory);

    const handleSelection = () => {
      const active = canvas.getActiveObject();
      if (active) setSelectedType(active.type || null);
      else {
        setSelectedType(null);
        // Stop animation preview when deselected
        if (stopPreviewRef.current) {
          stopPreviewRef.current();
          stopPreviewRef.current = null;
          setActiveAnimations([]);
        }
      }
    };
    canvas.on("selection:created", handleSelection);
    canvas.on("selection:updated", handleSelection);
    canvas.on("selection:cleared", handleSelection);

    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (isTyping) return;
        e.preventDefault();
        if (e.shiftKey) await redo(); else await undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (isTyping) return;
        e.preventDefault();
        await redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObject();
        if (active && !isTyping) {
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.off("object:added", saveHistory);
      canvas.off("object:removed", saveHistory);
      canvas.off("object:modified", saveHistory);
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const canvas = fabricRef.current;
      if (!canvas) return;
      try {
        const img = await fabric.FabricImage.fromURL(dataUrl);
        const imgW = img.width || 1;
        const imgH = img.height || 1;
        const scale = Math.min((CANVAS_W - 100) / imgW, (CANVAS_H - 100) / imgH, 1);
        const scaledW = imgW * scale;
        const scaledH = imgH * scale;
        img.set({
          left: (CANVAS_W - scaledW) / 2,
          top: (CANVAS_H - scaledH) / 2,
          scaleX: scale,
          scaleY: scale,
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        console.error("Upload failed:", err);
        alert("Could not load that image. Try a different file.");
      }
    };
    reader.readAsDataURL(file);
  };

  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const text = new fabric.Textbox("Your text here", {
      left: CANVAS_W / 2 - 100, top: CANVAS_H / 2 - 20, width: 200,
      fontSize: 32, fontFamily: "Arial", fill: "#000000",
      fontWeight: "bold", textAlign: "center",
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const addEmoji = (emoji: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const sticker = new fabric.Textbox(emoji, {
      left: CANVAS_W / 2 - 50, top: CANVAS_H / 2 - 50, width: 100,
      fontSize: 80, textAlign: "center",
    });
    canvas.add(sticker);
    canvas.setActiveObject(sticker);
    canvas.renderAll();
  };

  const addRect = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = new fabric.Rect({
      left: CANVAS_W / 2 - 75, top: CANVAS_H / 2 - 50,
      width: 150, height: 100, fill: "#8b5cf6",
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  };

  const addCircle = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const circle = new fabric.Circle({
      left: CANVAS_W / 2 - 60, top: CANVAS_H / 2 - 60, radius: 60, fill: "#ec4899",
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();
  };

  const addTriangle = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const triangle = new fabric.Triangle({
      left: CANVAS_W / 2 - 60, top: CANVAS_H / 2 - 50,
      width: 120, height: 100, fill: "#22c55e",
    });
    canvas.add(triangle);
    canvas.setActiveObject(triangle);
    canvas.renderAll();
  };

  const addStar = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const star = new fabric.Polygon(
      [
        { x: 50, y: 0 }, { x: 61, y: 35 }, { x: 98, y: 35 }, { x: 68, y: 57 },
        { x: 79, y: 91 }, { x: 50, y: 70 }, { x: 21, y: 91 }, { x: 32, y: 57 },
        { x: 2, y: 35 }, { x: 39, y: 35 },
      ],
      { left: CANVAS_W / 2 - 50, top: CANVAS_H / 2 - 50, fill: "#eab308" }
    );
    canvas.add(star);
    canvas.setActiveObject(star);
    canvas.renderAll();
  };

  const addLine = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const line = new fabric.Line(
      [CANVAS_W / 2 - 100, CANVAS_H / 2, CANVAS_W / 2 + 100, CANVAS_H / 2],
      { stroke: "#000000", strokeWidth: 4 }
    );
    canvas.add(line);
    canvas.setActiveObject(line);
    canvas.renderAll();
  };

  const changeColor = (color: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    const objects =
      active.type === "activeSelection"
        ? (active as fabric.ActiveSelection).getObjects()
        : [active];
    objects.forEach((obj) => {
      if (obj instanceof fabric.Textbox || obj instanceof fabric.Text) obj.set("fill", color);
      else if (obj instanceof fabric.Rect || obj instanceof fabric.Circle ||
               obj instanceof fabric.Triangle || obj instanceof fabric.Polygon) obj.set("fill", color);
      else if (obj instanceof fabric.Line) obj.set("stroke", color);
    });
    canvas.renderAll();
    saveHistory();
  };

  // Toggle an animation on/off and restart preview with the new set
  const toggleAnimation = (animation: AnimationType) => {
    setActiveAnimations((prev) => {
      const next = prev.includes(animation)
        ? prev.filter((a) => a !== animation)
        : [...prev, animation];

      const canvas = fabricRef.current;
      if (canvas) {
        const active = canvas.getActiveObject();
        if (active) {
          if (stopPreviewRef.current) {
            stopPreviewRef.current();
            stopPreviewRef.current = null;
          }
          if (next.length > 0) {
            stopPreviewRef.current = startPreviewAnimation(canvas, active, next);
          }
        }
      }

      return next;
    });
  };

  const stopAnimation = () => {
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
      stopPreviewRef.current = null;
    }
    setActiveAnimations([]);
  };

  const exportGif = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || activeAnimations.length === 0) {
      alert("Select an object and choose at least one animation first.");
      return;
    }
    stopAnimation();
    setIsExporting(true);
    try {
      const blob = await exportAnimatedGif({
        canvas,
        target: active,
        animations: activeAnimations,
      });
      downloadBlob(blob, `sticker-studio-${Date.now()}.gif`);
    } catch (err) {
      console.error("GIF export failed:", err);
      alert("GIF export failed. Try a smaller animation.");
    } finally {
      setIsExporting(false);
    }
  };

  // ================== CROP ==================
  const startCrop = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || active.type !== "image") {
      alert("Please select an image first.");
      return;
    }
    const img = active as fabric.FabricImage;
    originalOpacityRef.current = img.opacity ?? 1;
    img.set("opacity", 0.4);

    const bounds = img.getBoundingRect();
    const cropW = Math.min(200, bounds.width * 0.6);
    const cropH = Math.min(200, bounds.height * 0.6);

    const cropRect = new fabric.Rect({
      left: bounds.left + (bounds.width - cropW) / 2,
      top: bounds.top + (bounds.height - cropH) / 2,
      width: cropW,
      height: cropH,
      fill: "rgba(139, 92, 246, 0.2)",
      stroke: "#8b5cf6",
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      cornerColor: "#8b5cf6",
      cornerSize: 12,
      transparentCorners: false,
      hasRotatingPoint: false,
    });

    canvas.add(cropRect);
    canvas.setActiveObject(cropRect);
    canvas.renderAll();

    cropRectRef.current = cropRect;
    cropTargetRef.current = img;
    setIsCropping(true);
  };

  const applyCrop = () => {
    const canvas = fabricRef.current;
    const cropRect = cropRectRef.current;
    const img = cropTargetRef.current;
    if (!canvas || !cropRect || !img) return;

    const imgLeft = img.left ?? 0;
    const imgTop = img.top ?? 0;
    const imgScaleX = img.scaleX ?? 1;
    const imgScaleY = img.scaleY ?? 1;
    const cropLeft = cropRect.left ?? 0;
    const cropTop = cropRect.top ?? 0;
    const cropW = cropRect.width * (cropRect.scaleX ?? 1);
    const cropH = cropRect.height * (cropRect.scaleY ?? 1);

    const offsetX = (cropLeft - imgLeft) / imgScaleX;
    const offsetY = (cropTop - imgTop) / imgScaleY;
    const cropWOrig = cropW / imgScaleX;
    const cropHOrig = cropH / imgScaleY;

    const element = img.getElement() as HTMLImageElement;
    const off = document.createElement("canvas");
    off.width = cropWOrig;
    off.height = cropHOrig;
    const ctx = off.getContext("2d")!;
    ctx.drawImage(element, offsetX, offsetY, cropWOrig, cropHOrig, 0, 0, cropWOrig, cropHOrig);

    fabric.FabricImage.fromURL(off.toDataURL()).then((newImg) => {
      newImg.set({
        left: cropLeft, top: cropTop,
        scaleX: imgScaleX, scaleY: imgScaleY,
        opacity: originalOpacityRef.current,
      });
      canvas.remove(img);
      canvas.remove(cropRect);
      canvas.add(newImg);
      canvas.setActiveObject(newImg);
      canvas.renderAll();
      cropRectRef.current = null;
      cropTargetRef.current = null;
      setIsCropping(false);
    });
  };

  const cancelCrop = () => {
    const canvas = fabricRef.current;
    const cropRect = cropRectRef.current;
    const img = cropTargetRef.current;
    if (!canvas || !cropRect || !img) return;
    img.set("opacity", originalOpacityRef.current);
    canvas.remove(cropRect);
    canvas.setActiveObject(img);
    canvas.renderAll();
    cropRectRef.current = null;
    cropTargetRef.current = null;
    setIsCropping(false);
  };

  // ================== SHAPE MASK ==================
  const buildMaskShape = (shape: MaskShape): fabric.Object => {
    const s = 1;
    switch (shape) {
      case "circle":
        return new fabric.Circle({
          radius: s / 2, originX: "center", originY: "center", left: 0, top: 0,
        });
      case "rounded":
        return new fabric.Rect({
          width: s, height: s,
          rx: s * 0.18, ry: s * 0.18,
          originX: "center", originY: "center", left: 0, top: 0,
        });
      case "star": {
        const pts: { x: number; y: number }[] = [];
        const outerR = s / 2;
        const innerR = outerR * 0.45;
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          pts.push({
            x: outerR + Math.cos(angle) * r,
            y: outerR + Math.sin(angle) * r,
          });
        }
        return new fabric.Polygon(pts, {
          originX: "center", originY: "center", left: 0, top: 0,
        });
      }
      case "heart": {
        const w = s;
        const h = s;
        const path =
          `M ${w * 0.5} ${h * 0.88} ` +
          `C ${w * 0.15} ${h * 0.65}, ${w * 0.05} ${h * 0.35}, ${w * 0.25} ${h * 0.22} ` +
          `C ${w * 0.38} ${h * 0.12}, ${w * 0.46} ${h * 0.22}, ${w * 0.5} ${h * 0.35} ` +
          `C ${w * 0.54} ${h * 0.22}, ${w * 0.62} ${h * 0.12}, ${w * 0.75} ${h * 0.22} ` +
          `C ${w * 0.95} ${h * 0.35}, ${w * 0.85} ${h * 0.65}, ${w * 0.5} ${h * 0.88} Z`;
        return new fabric.Path(path, {
          originX: "center", originY: "center", left: 0, top: 0,
        });
      }
      case "triangle":
        return new fabric.Triangle({
          width: s, height: s,
          originX: "center", originY: "center", left: 0, top: 0,
        });
    }
  };

  const startMaskPreview = (shape: MaskShape) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || active.type !== "image") {
      alert("Please select an image first.");
      return;
    }

    if (maskPreviewRef.current) {
      canvas.remove(maskPreviewRef.current);
      maskPreviewRef.current = null;
    }

    const img = active as fabric.FabricImage;
    const center = img.getCenterPoint();

    const onScreenW = (img.width ?? 100) * (img.scaleX ?? 1);
    const onScreenH = (img.height ?? 100) * (img.scaleY ?? 1);
    const desiredSize = Math.min(onScreenW, onScreenH) * 0.7;

    const preview = buildMaskShape(shape);
    preview.set({
      fill: "rgba(139, 92, 246, 0.15)",
      stroke: "#8b5cf6",
      strokeWidth: 2 / desiredSize,
      strokeDashArray: [6 / desiredSize, 4 / desiredSize],
      cornerColor: "#8b5cf6",
      cornerStrokeColor: "#8b5cf6",
      cornerSize: 12,
      transparentCorners: false,
      hasRotatingPoint: false,
      left: center.x,
      top: center.y,
      scaleX: desiredSize,
      scaleY: desiredSize,
    });

    canvas.add(preview);
    canvas.setActiveObject(preview);
    canvas.renderAll();

    maskPreviewRef.current = preview;
    maskTargetRef.current = img;
    setMaskShape(shape);
    setIsMasking(true);
  };

  const applyMask = () => {
    const canvas = fabricRef.current;
    const preview = maskPreviewRef.current;
    const img = maskTargetRef.current;
    if (!canvas || !preview || !img) return;

    const previewCenter = preview.getCenterPoint();
    const imgMatrix = img.calcTransformMatrix();
    const invImgMatrix = fabric.util.invertTransform(imgMatrix);
    const localCenter = fabric.util.transformPoint(
      new fabric.Point(previewCenter.x, previewCenter.y),
      invImgMatrix
    );

    const imgScaleX = img.scaleX ?? 1;
    const imgScaleY = img.scaleY ?? 1;

    const previewW = (preview.width ?? 0) * (preview.scaleX ?? 1);
    const previewH = (preview.height ?? 0) * (preview.scaleY ?? 1);

    const localW = previewW / imgScaleX;
    const localH = previewH / imgScaleY;

    const clipPath = buildMaskShape(maskShape!);
    clipPath.set({
      originX: "center",
      originY: "center",
      left: localCenter.x,
      top: localCenter.y,
      scaleX: localW,
      scaleY: localH,
    });

    img.set("clipPath", clipPath);
    img.set("dirty", true);

    canvas.remove(preview);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();

    maskPreviewRef.current = null;
    maskTargetRef.current = null;
    setMaskShape(null);
    setIsMasking(false);
    saveHistory();
  };

  const cancelMask = () => {
    const canvas = fabricRef.current;
    const preview = maskPreviewRef.current;
    const img = maskTargetRef.current;
    if (!canvas) return;
    if (preview) canvas.remove(preview);
    if (img) canvas.setActiveObject(img);
    canvas.renderAll();
    maskPreviewRef.current = null;
    maskTargetRef.current = null;
    setMaskShape(null);
    setIsMasking(false);
  };

  const removeMask = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || active.type !== "image") return;
    (active as fabric.FabricImage).set("clipPath", undefined);
    (active as fabric.FabricImage).set("dirty", true);
    canvas.renderAll();
    saveHistory();
  };

  const clearCanvas = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (canvas.getObjects().length === 0) return;
    if (!confirm("Clear the entire canvas? You can undo with Ctrl+Z.")) return;
    stopAnimation();
    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.renderAll();
    saveHistory();
  };

  const downloadImage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: "png", quality: 1, multiplier: 2 });
    const link = document.createElement("a");
    link.download = `sticker-studio-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const isTextSelected =
    selectedType === "textbox" || selectedType === "text" || selectedType === "i-text";
  const isShapeSelected =
    selectedType === "rect" || selectedType === "circle" || selectedType === "triangle" ||
    selectedType === "polygon" || selectedType === "line";
  const isImageSelected = selectedType === "image";
  const showColorPicker = isTextSelected || isShapeSelected;
  const showAnimator = selectedType !== null && !isCropping && !isMasking;
  const showImageTools = isImageSelected && !isCropping && !isMasking;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2 flex-wrap justify-center bg-gray-800 p-2 rounded-lg">
        <button onClick={() => fileInputRef.current?.click()} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md transition">Upload Image</button>
        <button onClick={addText} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md transition">Add Text</button>
        <div className="w-px bg-gray-700 mx-1" />
        <button onClick={undo} disabled={!canUndo} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 rounded-md transition">↶ Undo</button>
        <button onClick={redo} disabled={!canRedo} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 rounded-md transition">↷ Redo</button>
        <div className="w-px bg-gray-700 mx-1" />
        <button onClick={downloadImage} className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-md transition">Download PNG</button>
        <button onClick={clearCanvas} className="text-sm font-medium text-red-400 hover:text-red-300 px-4 py-2 rounded-md transition">Clear All</button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
      </div>

      <div className="flex gap-2 flex-wrap justify-center bg-gray-800 p-2 rounded-lg">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 self-center px-2">Shapes</p>
        <button onClick={addRect} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">▭ Rect</button>
        <button onClick={addCircle} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">◯ Circle</button>
        <button onClick={addTriangle} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">△ Triangle</button>
        <button onClick={addStar} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">★ Star</button>
        <button onClick={addLine} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">╱ Line</button>
      </div>

      {showImageTools && (
        <div className="flex flex-col items-center gap-2 bg-gray-800 p-3 rounded-lg">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Image Tools</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={startCrop} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">✂️ Crop</button>
            <div className="w-px bg-gray-700 mx-1" />
            <p className="text-xs text-gray-400 self-center px-1">Shape:</p>
            {MASK_SHAPES.map(({ key, label }) => (
              <button key={key} onClick={() => startMaskPreview(key)}
                className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition">
                {label}
              </button>
            ))}
            <button onClick={removeMask} className="text-sm font-medium text-red-400 hover:text-red-300 px-3 py-2 rounded-md transition">✗ Remove Shape</button>
          </div>
        </div>
      )}

      {isCropping && (
        <div className="flex flex-col items-center gap-2 bg-yellow-900/40 border border-yellow-600 p-3 rounded-lg">
          <p className="text-sm text-yellow-200 font-medium">
            ✂️ Crop mode: drag and resize the dashed rectangle, then Apply.
          </p>
          <div className="flex gap-2">
            <button onClick={applyCrop} className="text-sm font-bold text-white bg-green-600 hover:bg-green-500 px-6 py-2 rounded-md transition">✓ Apply Crop</button>
            <button onClick={cancelCrop} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-md transition">✗ Cancel</button>
          </div>
        </div>
      )}

      {isMasking && (
        <div className="flex flex-col items-center gap-2 bg-purple-900/40 border border-purple-600 p-3 rounded-lg">
          <p className="text-sm text-purple-200 font-medium">
            ⭕ Shape mode: drag and resize the shape to choose what part of the image shows.
          </p>
          <div className="flex gap-2">
            <button onClick={applyMask} className="text-sm font-bold text-white bg-green-600 hover:bg-green-500 px-6 py-2 rounded-md transition">✓ Apply Shape</button>
            <button onClick={cancelMask} className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-md transition">✗ Cancel</button>
          </div>
        </div>
      )}

      {showColorPicker && (
        <div className="flex flex-col items-center gap-2 bg-gray-800 p-3 rounded-lg">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">
            {isTextSelected ? "Text Color" : "Shape Color"}
          </p>
          <div className="flex flex-wrap gap-2 justify-center max-w-md">
            {COLORS.map((color) => (
              <button key={color} onClick={() => changeColor(color)}
                className="w-8 h-8 rounded-full border-2 border-gray-600 hover:border-white transition-transform hover:scale-110"
                style={{ backgroundColor: color }} title={color} />
            ))}
          </div>
        </div>
      )}

      {showAnimator && (
        <div className="flex flex-col items-center gap-2 bg-gray-800 p-3 rounded-lg">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">
            Animate Selected Object (mix & match)
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {ANIMATIONS.map(({ key, label, emoji }) => {
              const isActive = activeAnimations.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleAnimation(key)}
                  className={`text-sm font-medium px-3 py-2 rounded-md transition ${
                    isActive
                      ? "bg-purple-600 text-white ring-2 ring-purple-400"
                      : "bg-gray-700 text-white hover:bg-gray-600"
                  }`}
                >
                  {emoji} {label}
                </button>
              );
            })}
            {activeAnimations.length > 0 && (
              <button onClick={stopAnimation}
                className="text-sm font-medium px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition">
                ■ Stop
              </button>
            )}
            <button onClick={exportGif}
              disabled={activeAnimations.length === 0 || isExporting}
              className="text-sm font-bold px-4 py-2 rounded-md bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition">
              {isExporting ? "Exporting..." : "⬇ Export GIF"}
            </button>
          </div>
          {activeAnimations.length > 1 && (
            <p className="text-xs text-purple-300">
              ✨ {activeAnimations.length} animations combined
            </p>
          )}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-3 max-w-2xl">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 text-center">Stickers</p>
        <div className="flex flex-wrap gap-1 justify-center">
          {EMOJIS.map((emoji) => (
            <button key={emoji} onClick={() => addEmoji(emoji)}
              className="text-2xl hover:bg-gray-700 rounded-md w-10 h-10 flex items-center justify-center transition"
              title={`Add ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
        <canvas ref={canvasElRef} width={CANVAS_W} height={CANVAS_H} />
      </div>

      <p className="text-xs text-gray-500">
        Tip: Select any object to animate. Click multiple animations to combine them.
      </p>
    </div>
  );
}