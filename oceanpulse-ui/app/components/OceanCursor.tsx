"use client";

import { useEffect, useRef, useState } from "react";

// ══════════════════════════════════════════════════════════════
// Wave class — concentric elliptical ripple rings (water surface)
// ══════════════════════════════════════════════════════════════
class Wave {
  x: number; y: number;
  radius: number; maxRadius: number;
  speed: number; opacity: number;
  lineWidth: number; rings: number;
  dead = false;

  constructor(x: number, y: number, big: boolean) {
    this.x         = x;
    this.y         = y;
    this.radius    = big ? 2 : 1;
    this.maxRadius = big ? 90 + Math.random() * 40 : 30 + Math.random() * 20;
    this.speed     = big ? 1.6 : 0.85 + Math.random() * 0.5;
    this.opacity   = big ? 0.8 : 0.6;
    this.lineWidth = big ? 1.8 : 1.1;
    this.rings     = big ? 3 : 1;
  }

  tick() {
    this.radius  += this.speed;
    this.opacity -= (this.speed / this.maxRadius) * 1.1;
    if (this.radius >= this.maxRadius || this.opacity <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0) return;
    ctx.save();
    for (let r = 0; r < this.rings; r++) {
      const rr = this.radius - r * 12;
      if (rr <= 0) continue;
      const progress = rr / this.maxRadius;
      const alpha    = Math.max(0, this.opacity * (1 - r * 0.32) * (1 - progress * 0.4));

      ctx.beginPath();
      // flattened ellipse = water surface perspective
      ctx.ellipse(this.x, this.y, rr, rr * 0.36, 0, 0, Math.PI * 2);

      // teal → cyan gradient stroke
      const grad = ctx.createRadialGradient(this.x, this.y, rr * 0.6, this.x, this.y, rr);
      grad.addColorStop(0,   `rgba(0,220,190,${alpha})`);
      grad.addColorStop(0.5, `rgba(0,200,220,${alpha * 0.65})`);
      grad.addColorStop(1,   `rgba(0,180,255,0)`);

      ctx.strokeStyle = grad;
      ctx.lineWidth   = this.lineWidth * (1 - progress * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════
export default function OceanCursor() {
  const cursorRef  = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<HTMLDivElement>(null);
  const posRef     = useRef({ x: -200, y: -200 });
  const rafRef     = useRef<number>(0);
  const wavesRef   = useRef<Wave[]>([]);
  const lastSpawn  = useRef(0);
  const [clicking, setClicking] = useState(false);
  const [hovering, setHovering] = useState(false);

  const spawnWave = (x: number, y: number, big: boolean) => {
    const now = performance.now();
    if (!big && now - lastSpawn.current < 42) return;
    lastSpawn.current = now;
    wavesRef.current.push(new Wave(x, y, big));
  };

  useEffect(() => {
    document.documentElement.style.cursor = "none";

    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      const t = e.target as HTMLElement;
      setHovering(!!t.closest("a,button,[role='button'],input,select,textarea"));
      spawnWave(e.clientX, e.clientY, false);
    };

    const onDown = (e: MouseEvent) => {
      setClicking(true);
      // triple-wave splash
      [0, 70, 140].forEach(delay =>
        setTimeout(() => spawnWave(e.clientX, e.clientY, true), delay)
      );
      // DOM click ring
      const el = ripplesRef.current;
      if (!el) return;
      const ring = document.createElement("div");
      ring.style.cssText = `
        position:fixed; left:${e.clientX}px; top:${e.clientY}px;
        width:0; height:0; border-radius:50%;
        border:2px solid rgba(0,212,186,0.8);
        transform:translate(-50%,-50%);
        animation:clickSplash 0.75s ease-out forwards;
        pointer-events:none; z-index:99997;
      `;
      el.appendChild(ring);
      setTimeout(() => ring.remove(), 750);
    };

    const onUp = () => setClicking(false);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // cursor arrow
      if (cursorRef.current) {
        const { x, y } = posRef.current;
        cursorRef.current.style.transform = `translate(${x}px,${y}px)`;
      }

      // waves
      wavesRef.current = wavesRef.current.filter(w => {
        w.tick();
        w.draw(ctx);
        return !w.dead;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      document.documentElement.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <style>{`
        * { cursor: none !important; }

        @keyframes arrowPulse {
          0%,100% {
            filter: drop-shadow(0 0 3px rgba(0,212,186,0.85))
                    drop-shadow(0 0 8px  rgba(0,212,186,0.4));
          }
          50% {
            filter: drop-shadow(0 0 6px rgba(0,212,186,1))
                    drop-shadow(0 0 16px rgba(0,212,186,0.55))
                    drop-shadow(0 0 28px rgba(0,212,186,0.2));
          }
        }

        @keyframes clickSplash {
          to { width:90px; height:90px; opacity:0; border-color:rgba(0,212,186,0); }
        }
      `}</style>

      {/* Full-screen canvas — water waves */}
      <canvas
        ref={canvasRef}
        style={{
          position:      "fixed",
          inset:          0,
          pointerEvents: "none",
          zIndex:         99990,
        }}
      />

      {/* Glowing arrow */}
      <div
        ref={cursorRef}
        style={{
          position:     "fixed",
          top: 0, left: 0,
          pointerEvents:"none",
          zIndex:        99999,
          willChange:   "transform",
          transform:    "translate(-200px,-200px)",
        }}
      >
        <svg
          width="24"
          height="30"
          viewBox="0 0 24 30"
          fill="none"
          style={{
            display:         "block",
            animation:       "arrowPulse 2s ease-in-out infinite",
            transform:        clicking ? "scale(0.82)" : hovering ? "scale(1.12)" : "scale(1)",
            transition:      "transform 0.12s ease",
            transformOrigin: "2px 2px",
          }}
        >
          {/* soft outer glow layer */}
          <path
            d="M2 2 L2 24 L9 18 L13 28 L17 26.5 L13 17 L21 17 Z"
            fill="none"
            stroke="rgba(0,212,186,0.25)"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* dark fill so arrow reads against any bg */}
          <path
            d="M2 2 L2 24 L9 18 L13 28 L17 26.5 L13 17 L21 17 Z"
            fill="rgba(0,18,16,0.88)"
            stroke="rgba(0,212,186,1)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* bright tip */}
          <circle cx="2" cy="2" r="2.2" fill="rgba(0,255,210,1)" />

          {/* hover ring */}
          {hovering && (
            <circle
              cx="2" cy="2" r="5.5"
              fill="rgba(0,255,179,0.12)"
              stroke="rgba(0,255,179,0.55)"
              strokeWidth="0.8"
            />
          )}
        </svg>
      </div>

      {/* DOM ripple container */}
      <div
        ref={ripplesRef}
        style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:99998 }}
      />
    </>
  );
}