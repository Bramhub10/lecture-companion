"use client";

import { useEffect, useRef } from "react";

/**
 * Calm, ambient neon dot field for the page background. Kept deliberately sparse
 * and slow so it stays atmospheric rather than distracting: few dots, gentle
 * upward drift, soft glow, and a slow twinkle. Honors prefers-reduced-motion by
 * rendering a single static frame.
 */

const COLORS = ["#38bdf8", "#4f7cff", "#818cf8", "#a78bfa", "#22d3ee"];

type Dot = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  base: number; // base opacity
  phase: number; // twinkle phase
  twinkle: number; // twinkle speed
  color: string;
};

export default function NeonDots() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots: Dot[] = [];
    let width = 0;
    let height = 0;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const build = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Sparse: roughly one dot per 30k px², capped, so it never gets busy.
      const count = Math.min(Math.floor((width * height) / 30000), 60);
      dots = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        r: rand(1, 3.2),
        vx: rand(-0.08, 0.08),
        vy: rand(-0.22, -0.05), // slow, mostly upward
        base: rand(0.18, 0.6),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.0006, 0.0018),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter"; // additive glow reads as neon
      for (const d of dots) {
        const alpha = Math.max(
          0,
          Math.min(1, d.base + Math.sin(t * d.twinkle + d.phase) * 0.18)
        );
        ctx.beginPath();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = d.color;
        ctx.shadowBlur = d.r * 5;
        ctx.shadowColor = d.color;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    };

    const step = (t: number) => {
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        // Wrap softly around the edges.
        if (d.y < -8) d.y = height + 8;
        if (d.y > height + 8) d.y = -8;
        if (d.x < -8) d.x = width + 8;
        if (d.x > width + 8) d.x = -8;
      }
      draw(t);
      raf = requestAnimationFrame(step);
    };

    let raf = 0;
    build();
    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(step);
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        if (reduced) draw(0);
      }, 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
