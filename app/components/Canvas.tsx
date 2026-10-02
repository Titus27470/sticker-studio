"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";

const EMOJIS = ["😀", "😂", "😍", "🔥", "💯", "⭐", "❤️", "🎉", "👍", "🙌", "😎", "🤩", "💜", "✨", "🌈", "🍕"];

const CANVAS_W = 600;
const CANVAS_H = 600;

export default function Canvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo history
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isRestoringRef = useRef<boolean>(false);

  // UI state for button enable/disable
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Save current canvas state into history
  const saveHistory = () => {
    const canvas = fabricRef.current;
    if (!canvas || isRestoringRef.current) return;

    const json = JSON.stringify(canvas.toJSON());

    // If we've undone and then make a new action, drop the "future" states
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;

    // Limit history size
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

    // Save initial state
    historyRef.current = [JSON.stringify(canvas.toJSON())];
    historyIndexRef.current = 0;

    // Save history whenever objects are added, removed, or modified
    canvas.on("object:added", saveHistory);
    canvas.on("object:removed", saveHistory);
    canvas.on("object:modified", saveHistory);

    // Keyboard shortcuts
    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "TEXTAREA" || target.tagName === "INPUT";

      // Ctrl/Cmd + Z = Undo, Ctrl/Cmd + Shift + Z or Ctrl+Y = Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (isTyping) return;
        e.preventDefault();
        if (e.shiftKey) {
          await redo();
        } else {
          await undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (isTyping) return;
        e.preventDefault();
        await redo();
        return;
      }

      // Delete/Backspace removes selected object
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

        const scale = Math.min(
          (CANVAS_W - 100) / imgW,
          (CANVAS_H - 100) / imgH,
          1
        );
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
      left: CANVAS_W / 2 - 100,
      top: CANVAS_H / 2 - 20,
      width: 200,
      fontSize: 32,
      fontFamily: "Arial",
      fill: "#000000",
      fontWeight: "bold",
      textAlign: "center",
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const addEmoji = (emoji: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const sticker = new fabric.Textbox(emoji, {
      left: CANVAS_W / 2 - 50,
      top: CANVAS_H / 2 - 50,
      width: 100,
      fontSize: 80,
      textAlign: "center",
    });

    canvas.add(sticker);
    canvas.setActiveObject(sticker);
    canvas.renderAll();
  };

  const clearCanvas = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (canvas.getObjects().length === 0) return;
    if (!confirm("Clear the entire canvas? You can undo with Ctrl+Z.")) return;

    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.renderAll();

    // Force-save this state to history (since clear() doesn't fire object:removed events cleanly)
    saveHistory();
  };

  const downloadImage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.discardActiveObject();
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2,
    });

    const link = document.createElement("a");
    link.download = `sticker-studio-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap justify-center bg-gray-800 p-2 rounded-lg">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md transition"
        >
          Upload Image
        </button>
        <button
          onClick={addText}
          className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md transition"
        >
          Add Text
        </button>

        <div className="w-px bg-gray-700 mx-1" />

        <button
          onClick={undo}
          disabled={!canUndo}
          className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 rounded-md transition"
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 rounded-md transition"
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>

        <div className="w-px bg-gray-700 mx-1" />

        <button
          onClick={downloadImage}
          className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-md transition"
        >
          Download PNG
        </button>
        <button
          onClick={clearCanvas}
          className="text-sm font-medium text-red-400 hover:text-red-300 px-4 py-2 rounded-md transition"
        >
          Clear All
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Sticker palette */}
      <div className="bg-gray-800 rounded-lg p-3 max-w-2xl">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 text-center">
          Stickers
        </p>
        <div className="flex flex-wrap gap-1 justify-center">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="text-2xl hover:bg-gray-700 rounded-md w-10 h-10 flex items-center justify-center transition"
              title={`Add ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
        <canvas ref={canvasElRef} width={CANVAS_W} height={CANVAS_H} />
      </div>
    </div>
  );
}