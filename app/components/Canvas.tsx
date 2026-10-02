"use client";

import { useEffect, useRef } from "react";
import * as fabric from "fabric";

const EMOJIS = ["😀", "😂", "😍", "🔥", "💯", "⭐", "❤️", "🎉", "👍", "🙌", "😎", "🤩", "💜", "✨", "🌈", "🍕"];

export default function Canvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;
    if (fabricRef.current) return;

    console.log("🔧 Fabric initializing on canvas element");

    const canvas = new fabric.Canvas(el, {
      width: 600,
      height: 600,
      backgroundColor: "#ffffff",
    });

    fabricRef.current = canvas;
    console.log(" Fabric ready");

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObject();
        const target = e.target as HTMLElement;
        if (active && target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") {
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.dispose();
      fabricRef.current = null;
    };
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

        const scale = Math.min(500 / imgW, 500 / imgH, 1);
        const scaledW = imgW * scale;
        const scaledH = imgH * scale;

        img.set({
          left: (600 - scaledW) / 2,
          top: (600 - scaledH) / 2,
          scaleX: scale,
          scaleY: scale,
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        console.log(" Image added. Total:", canvas.getObjects().length);

        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        console.error(" Upload failed:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const text = new fabric.Textbox("Your text here", {
      left: 200, top: 280, width: 200, fontSize: 32, fontFamily: "Arial",
      fill: "#000000", fontWeight: "bold", textAlign: "center",
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const addEmoji = (emoji: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const sticker = new fabric.Textbox(emoji, {
      left: 250, top: 250, width: 100, fontSize: 80, textAlign: "center",
    });
    canvas.add(sticker);
    canvas.setActiveObject(sticker);
    canvas.renderAll();
  };

  const clearCanvas = () => {
    if (!fabricRef.current) return;
    fabricRef.current.clear();
    fabricRef.current.backgroundColor = "#ffffff";
    fabricRef.current.renderAll();
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

  return (
    <div className="flex flex-col items-center gap-6">
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
        <button
          onClick={downloadImage}
          className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-md transition"
        >
          Download PNG
        </button>
        <button
          onClick={clearCanvas}
          className="text-sm font-medium text-gray-300 hover:text-white px-4 py-2 rounded-md transition"
        >
          Clear
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

      {/* Canvas — plain HTML canvas that React owns */}
      <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
        <canvas ref={canvasElRef} width={600} height={600} />
      </div>
    </div>
  );
}