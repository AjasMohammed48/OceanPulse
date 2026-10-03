"use client";

import { useEffect, useRef } from "react";

// ══════════════════════════════════════════════════════════════
// OCEAN BACKGROUND — 3D particle field + animated wave bands
// Uses canvas for GPU-accelerated rendering, zero layout impact
// ══════════════════════════════════════════════════════════════
export default function OceanBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = window.innerWidth;
    let H = window.innerHeight;
    let raf = 0;
    let t = 0;

    // ── Particle system ─────────────────────────────────────
    const PARTICLE_COUNT = 80;
    type Particle = {
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      size: number; opacity: number;
      color: string; glowing: boolean;
    };

    const colors = [
      "rgba(0,212,186,",
      "rgba(0,168,150,",
      "rgba(77,184,255,",
      "rgba(0,255,179,",
    ];

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random() * 3 + 0.2,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.15 - 0.05,
      vz: (Math.random() - 0.5) * 0.003,
      size: Math.random() * 2.5 + 0.4,
      opacity: Math.random() * 0.5 + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
      glowing: Math.random() > 0.75,
    }));

    // ── Resize ───────────────────────────────────────────────
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Wave path helper ─────────────────────────────────────
    const drawWave = (
      yBase: number, amplitude: number, frequency: number,
      phase: number, color: string, blur = 0
    ) => {
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        const y = yBase
          + Math.sin((x / W) * frequency * Math.PI * 2 + phase) * amplitude
          + Math.sin((x / W) * frequency * 0.5 * Math.PI * 2 + phase * 1.3) * (amplitude * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      if (blur) ctx.filter = "none";
    };

    // ── Render loop ──────────────────────────────────────────
    const render = () => {
      t += 0.004;

      // Background void gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#03080f");
      bg.addColorStop(0.5, "#060e1a");
      bg.addColorStop(1, "#081525");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Grid texture (very faint)
      ctx.strokeStyle = "rgba(0,212,186,0.025)";
      ctx.lineWidth = 0.5;
      const GRID = 52;
      for (let x = 0; x < W; x += GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Deep wave bands (bottom 40% of screen)
      const waveBase = H * 0.78;
      drawWave(waveBase + 40, 18, 2.5, t * 0.7,        "rgba(0,21,37,0.7)",  2);
      drawWave(waveBase + 20, 22, 2.2, t * 0.9 + 0.8,  "rgba(0,15,28,0.6)",  1);
      drawWave(waveBase,      26, 1.8, t * 1.1 + 1.6,  "rgba(0,212,186,0.025)");
      drawWave(waveBase - 8,  18, 3.0, t * 0.6 + 2.4,  "rgba(0,212,186,0.018)");

      // Subtle depth glow at the very bottom
      const depthGlow = ctx.createLinearGradient(0, H * 0.85, 0, H);
      depthGlow.addColorStop(0, "transparent");
      depthGlow.addColorStop(1, "rgba(0,168,150,0.04)");
      ctx.fillStyle = depthGlow;
      ctx.fillRect(0, H * 0.85, W, H * 0.15);

      // Ambient light shafts (very subtle, top-down)
      for (let i = 0; i < 3; i++) {
        const sx = W * (0.2 + i * 0.3) + Math.sin(t * 0.3 + i) * 60;
        const grad = ctx.createLinearGradient(sx, 0, sx + 80, H * 0.6);
        grad.addColorStop(0, `rgba(0,212,186,${0.015 + i * 0.005})`);
        grad.addColorStop(1, "transparent");
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx - 30, 0);
        ctx.lineTo(sx + 80, 0);
        ctx.lineTo(sx + 100, H * 0.6);
        ctx.lineTo(sx - 50, H * 0.6);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // Particles
      particles.forEach(p => {
        // 3D parallax: deeper (smaller z) = slower, dimmer
        const scale   = p.z / 3;
        const opacity = p.opacity * scale;
        const radius  = p.size * scale;

        if (p.glowing) {
          // Bioluminescent glow
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 6);
          grd.addColorStop(0, `${p.color}${(opacity * 0.9).toFixed(2)})`);
          grd.addColorStop(1, `${p.color}0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 6, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(radius, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${Math.min(opacity * 1.5, 1).toFixed(2)})`;
        ctx.fill();

        // Move
        p.x  += p.vx * p.z;
        p.y  += p.vy * p.z;
        p.z  += p.vz;
        p.opacity += Math.sin(t * 2 + p.x * 0.01) * 0.003;

        // Wrap
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
        if (p.z < 0.2) p.z = 3;
        if (p.z > 3.5) p.z = 0.2;
        p.opacity = Math.max(0.05, Math.min(0.6, p.opacity));
      });

      // Connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(0,212,186,${(0.06 * (1 - dist / 100)).toFixed(3)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
