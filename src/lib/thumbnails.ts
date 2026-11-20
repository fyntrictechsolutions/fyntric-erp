import type { FileKind } from "@/lib/gallery";

/**
 * Thumbnails and details made in the browser while uploading, so the gallery grid loads small
 * pictures instead of whole files: a resized photo, a frame of a video, the first page of a PDF,
 * or a waveform of a recording.
 */
export interface FileInfo {
  thumb: Blob | null;
  width?: number;
  height?: number;
  duration?: number;
  pages?: number;
}

const MAX_SIDE = 640;
const TIMEOUT = 15_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

function toBlob(canvas: HTMLCanvasElement, type = "image/jpeg"): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.82));
}

/** Draws a picture scaled to fit MAX_SIDE, on white (so transparent PNGs and PDFs look right). */
function drawScaled(source: CanvasImageSource, w: number, h: number, background = "#fff") {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function imageInfo(file: File): Promise<FileInfo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await withTimeout(
      new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("unreadable"));
        i.src = url;
      }),
    );
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    return { thumb: await toBlob(drawScaled(img, w, h)), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoInfo(file: File): Promise<FileInfo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("unreadable"));
        video.src = url;
      }),
    );
    const duration = Number.isFinite(video.duration) ? video.duration : undefined;
    // A frame a second in (or halfway through a very short clip) is rarely black.
    await withTimeout(
      new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(1, (duration ?? 2) / 2);
      }),
      8000,
    ).catch(() => undefined);
    const w = video.videoWidth;
    const h = video.videoHeight;
    const thumb = w && h ? await toBlob(drawScaled(video, w, h, "#000")) : null;
    return { thumb, width: w || undefined, height: h || undefined, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function audioInfo(file: File): Promise<FileInfo> {
  // Decoding a long recording takes a lot of memory; skip the waveform for big files.
  if (file.size > 40 * 1024 * 1024) return { thumb: null, duration: await audioDuration(file).catch(() => undefined) };
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return { thumb: null };
  const ctx = new Ctx();
  try {
    const audio = await withTimeout(ctx.decodeAudioData(await file.arrayBuffer()), 30_000);
    const data = audio.getChannelData(0);
    const bars = 64;
    const step = Math.floor(data.length / bars) || 1;
    const peaks = Array.from({ length: bars }, (_, i) => {
      let max = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) max = Math.max(max, Math.abs(data[j]));
      return max;
    });
    const top = Math.max(...peaks, 0.01);
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 140;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#3b82f6";
    const bw = canvas.width / bars;
    peaks.forEach((p, i) => {
      const h = Math.max(4, (p / top) * (canvas.height - 10));
      g.beginPath();
      g.roundRect(i * bw + 1.5, (canvas.height - h) / 2, bw - 3, h, 2);
      g.fill();
    });
    return { thumb: await toBlob(canvas, "image/png"), duration: audio.duration };
  } finally {
    void ctx.close();
  }
}

function audioDuration(file: File): Promise<number | undefined> {
  const url = URL.createObjectURL(file);
  const a = document.createElement("audio");
  return withTimeout(
    new Promise<number | undefined>((resolve) => {
      a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : undefined);
      a.onerror = () => resolve(undefined);
      a.src = url;
    }),
  ).finally(() => URL.revokeObjectURL(url));
}

async function pdfInfo(file: File): Promise<FileInfo> {
  // pdf.js is large, so it loads only when a PDF is uploaded.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await withTimeout(pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, 30_000);
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { thumb: await toBlob(canvas), pages: pdf.numPages, width: Math.round(base.width), height: Math.round(base.height) };
  } finally {
    void pdf.destroy();
  }
}

/** Thumbnail and details for a file. Never throws for unreadable files: returns no thumbnail instead. */
export async function makeThumbnail(file: File, kind: FileKind): Promise<FileInfo> {
  try {
    if (kind === "image") return await imageInfo(file);
    if (kind === "video") return await videoInfo(file);
    if (kind === "audio") return await audioInfo(file);
    if (kind === "pdf") return await pdfInfo(file);
  } catch {
    /* fall through: no thumbnail */
  }
  return { thumb: null };
}
