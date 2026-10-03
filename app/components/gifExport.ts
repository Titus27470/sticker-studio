import GIF from "gif.js";
import * as fabric from "fabric";

export type AnimationType = "bounce" | "spin" | "wiggle" | "pulse" | "fade";

export interface AnimateOptions {
  canvas: fabric.Canvas;
  target: fabric.Object;
  animations: AnimationType[];
  duration?: number;
  fps?: number;
}

interface BaseState {
  left: number;
  top: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

function captureBase(target: fabric.Object): BaseState {
  return {
    left: target.get("left") ?? 0,
    top: target.get("top") ?? 0,
    angle: target.get("angle") ?? 0,
    scaleX: target.get("scaleX") ?? 1,
    scaleY: target.get("scaleY") ?? 1,
    opacity: target.get("opacity") ?? 1,
  };
}

function applyAnimations(
  target: fabric.Object,
  base: BaseState,
  animations: AnimationType[],
  progress: number
) {
  // Always reset to base first
  target.set({
    left: base.left,
    top: base.top,
    angle: base.angle,
    scaleX: base.scaleX,
    scaleY: base.scaleY,
    opacity: base.opacity,
  });

  const t = progress * Math.PI * 2;

  // Track combined transformations
  let offsetTop = 0;
  let offsetAngle = 0;
  let scaleMultiplier = 1;
  let opacityMultiplier = 1;

  animations.forEach((animation) => {
    switch (animation) {
      case "bounce":
        offsetTop -= Math.abs(Math.sin(t)) * 60;
        break;
      case "spin":
        offsetAngle += progress * 360;
        break;
      case "wiggle":
        offsetAngle += Math.sin(t * 3) * 20;
        break;
      case "pulse": {
        const scale = 1 + Math.sin(t) * 0.15;
        scaleMultiplier *= scale;
        break;
      }
      case "fade": {
        const opacity = 0.3 + Math.abs(Math.sin(t)) * 0.7;
        opacityMultiplier *= opacity / 1; // multiply
        break;
      }
    }
  });

  // Apply combined transforms
  target.set({
    top: base.top + offsetTop,
    angle: base.angle + offsetAngle,
    scaleX: base.scaleX * scaleMultiplier,
    scaleY: base.scaleY * scaleMultiplier,
    opacity: Math.max(0.2, Math.min(1, base.opacity * opacityMultiplier)),
  });
}

export function startPreviewAnimation(
  canvas: fabric.Canvas,
  target: fabric.Object,
  animations: AnimationType[]
): () => void {
  const base = captureBase(target);
  let rafId: number;
  const start = performance.now();

  const loop = () => {
    const elapsed = performance.now() - start;
    const progress = (elapsed % 1500) / 1500;
    applyAnimations(target, base, animations, progress);
    canvas.renderAll();
    rafId = requestAnimationFrame(loop);
  };
  loop();

  return () => {
    cancelAnimationFrame(rafId);
    applyAnimations(target, base, animations, 0);
    canvas.renderAll();
  };
}

export async function exportAnimatedGif({
  canvas,
  target,
  animations,
  duration = 1500,
  fps = 15,
}: AnimateOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const totalFrames = Math.round((duration / 1000) * fps);
    const base = captureBase(target);

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: canvas.getWidth(),
      height: canvas.getHeight(),
      workerScript: "/gif.worker.js",
    });

    let frameIndex = 0;

    const captureFrame = () => {
      if (frameIndex >= totalFrames) {
        applyAnimations(target, base, animations, 0);
        canvas.renderAll();

        gif.on("finished", (blob: Blob) => resolve(blob));
        gif.on("abort", () => reject(new Error("GIF encoding aborted")));
        gif.render();
        return;
      }

      const progress = frameIndex / totalFrames;
      applyAnimations(target, base, animations, progress);
      canvas.renderAll();

      const dataUrl = canvas.toDataURL({ format: "png", quality: 1 });

      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.getWidth();
        tempCanvas.height = canvas.getHeight();
        const ctx = tempCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        gif.addFrame(ctx, { copy: true, delay: 1000 / fps });
        frameIndex++;
        captureFrame();
      };
      img.onerror = () => reject(new Error("Frame capture failed"));
      img.src = dataUrl;
    };

    captureFrame();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}