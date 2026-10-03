"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface ArgoProfile {
  profile_id: string;
  float_id: string;
  time: string;
  latitude: number;
  longitude: number;
  basin: string;
  sst_argo: number | null;
  mld: number | null;
  ohc_700m: number | null;
  confidence: number;
  sparse_flag: boolean;
  sst_seasonal_anom: number | null;
}

type ColorMode = "basin" | "sst" | "mld" | "ohc" | "confidence";

const T = {
  teal: "#00d4ba", red: "#ff4d6d", orange: "#ff8c42",
  amber: "#ffb347", blue: "#4db8ff", purple: "#a78bfa",
  green: "#4ade80", textSec: "#8ab4c8", textMut: "#3d6478",
  bgVoid: "#03080f",
};

const BASINS: Record<string, string> = {
  "Arabian Sea": T.orange,
  "Bay of Bengal": T.blue,
  "Southern Indian Ocean": T.purple,
  "Equatorial Indian Ocean": T.green,
  "Indian Ocean": T.textSec,
};

const TRAIL_COLORS = [
  "#00d4ba", "#4db8ff", "#ff8c42", "#ff4d6d", "#ffb347",
  "#a78bfa", "#4ade80", "#f472b6", "#60a5fa", "#fbbf24",
];

function sstColor(v: number): string {
  const t = Math.max(0, Math.min(1, (v - 20) / 16));
  if (t < 0.25) { const s = t / 0.25; return `rgb(${Math.round(30 + s * 20)},${Math.round(80 + s * 100)},${Math.round(220 - s * 20)})`; }
  if (t < 0.5)  { const s = (t - 0.25) / 0.25; return `rgb(${Math.round(50 + s * 150)},${Math.round(180 + s * 60)},${Math.round(200 - s * 140)})`; }
  if (t < 0.75) { const s = (t - 0.5) / 0.25; return `rgb(${Math.round(200 + s * 55)},${Math.round(240 - s * 150)},${Math.round(60 - s * 50)})`; }
  const s = (t - 0.75) / 0.25; return `rgb(255,${Math.round(90 - s * 80)},${Math.round(10 - s * 8)})`;
}
function mldColor(v: number): string {
  const t = Math.max(0, Math.min(1, v / 150));
  if (t < 0.4) { const s = t / 0.4; return `rgb(${Math.round(255 - s * 200)},${Math.round(180 - s * 30)},${Math.round(50 + s * 50)})`; }
  const s = (t - 0.4) / 0.6;
  return `rgb(${Math.round(55 - s * 25)},${Math.round(150 + s * 60)},${Math.round(100 + s * 155)})`;
}
function confColor(v: number): string {
  if (v >= 0.8) return T.teal;
  if (v >= 0.5) return T.amber;
  return T.red;
}
function getColor(p: ArgoProfile, mode: ColorMode): string {
  switch (mode) {
    case "basin":      return BASINS[p.basin] ?? T.textSec;
    case "sst":        return p.sst_argo  != null ? sstColor(p.sst_argo)                     : T.textMut;
    case "mld":        return p.mld       != null ? mldColor(p.mld)                           : T.textMut;
    case "ohc":        return p.ohc_700m  != null ? sstColor((p.ohc_700m / 1e9) * 0.5 + 25)  : T.textMut;
    case "confidence": return confColor(p.confidence);
    default:           return T.teal;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number,
  dx: number, dy: number,
  size: number,
  color: string,
  alpha: number,
) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / len, ny = dy / len;
  const ang = 0.42;
  const p1x = tx - size * (nx * Math.cos(ang) - ny * Math.sin(ang));
  const p1y = ty - size * (ny * Math.cos(ang) + nx * Math.sin(ang));
  const p2x = tx - size * (nx * Math.cos(-ang) - ny * Math.sin(-ang));
  const p2y = ty - size * (ny * Math.cos(-ang) + nx * Math.sin(-ang));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function safeLatLngToPoint(map: any, lat: number, lng: number): { x: number; y: number } | null {
  try {
    if (!map || !map._loaded) return null;
    const pane = map.getPane("mapPane");
    if (!pane || !(pane as any)._leaflet_pos) return null;
    const pt = map.latLngToContainerPoint([lat, lng]);
    if (pt == null || typeof pt.x !== "number" || typeof pt.y !== "number") return null;
    return pt;
  } catch {
    return null;
  }
}

export default function LeafletArgoMap({
  profiles,
  mode,
  selected,
  onHover,
  onMapClick,
  allTrails,
  currentDayProfiles,
  prevDayProfiles,
  selectedFloat,
  isPlaying,
}: {
  profiles: ArgoProfile[];
  mode: ColorMode;
  selected: ArgoProfile | null;
  onHover: (p: ArgoProfile | null, x: number, y: number) => void;
  onMapClick: () => void;
  allTrails?: Map<string, { lat: number; lng: number; time: string }[]>;
  currentDayProfiles?: ArgoProfile[];
  prevDayProfiles?: ArgoProfile[];
  selectedFloat?: string;
  isPlaying?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const animRef      = useRef<number | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const destroyedRef    = useRef(false);
  const initializingRef = useRef(false);           // ← NEW: blocks concurrent init attempts
  const floatColorMapRef = useRef<Map<string, number>>(new Map());

  // ── LIVE DATA REFS ─────────────────────────────────────────
  const modeRef               = useRef(mode);
  const selectedRef           = useRef(selected);
  const allTrailsRef          = useRef(allTrails);
  const currentDayProfilesRef = useRef(currentDayProfiles);
  const prevDayProfilesRef    = useRef(prevDayProfiles);
  const selectedFloatRef      = useRef(selectedFloat);
  const isPlayingRef          = useRef(isPlaying);

  // Sync refs on every render (synchronous — no useEffect needed)
  modeRef.current               = mode;
  selectedRef.current           = selected;
  allTrailsRef.current          = allTrails;
  currentDayProfilesRef.current = currentDayProfiles;
  prevDayProfilesRef.current    = prevDayProfiles;
  selectedFloatRef.current      = selectedFloat;
  isPlayingRef.current          = isPlaying;

  // ── Map init: only runs when the full dataset changes ───────
  useEffect(() => {
    if (!containerRef.current) return;
    destroyedRef.current = false;

    async function init() {
      const L = (await import("leaflet")).default;
      const container = containerRef.current!;

      // ── Guard: block if already initialized OR already initializing ──
      // initializingRef is set SYNCHRONOUSLY so a second StrictMode call
      // is blocked even before the async import resolves.
      if (mapRef.current || initializingRef.current) return;
      initializingRef.current = true;

      // Bail out if the component unmounted during the async import
      if (destroyedRef.current) { initializingRef.current = false; return; }

      if ((container as any)._leaflet_id) {
        try { mapRef.current?.remove(); } catch (_) {}
        mapRef.current = null;
        delete (container as any)._leaflet_id;
      }
      container.querySelector("canvas.argo-overlay")?.remove();

      const map = L.map(container, {
        center: [-10, 70], zoom: 4, minZoom: 3, maxZoom: 9, zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        { attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 20 }
      ).addTo(map);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        { attribution: "", maxZoom: 20, pane: "shadowPane" }
      ).addTo(map);

      const canvas = document.createElement("canvas");
      canvas.className = "argo-overlay";
      canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:500;";
      container.appendChild(canvas);
      canvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;

      function resize() {
        if (destroyedRef.current) return;
        canvas.width  = container.offsetWidth;
        canvas.height = container.offsetHeight;
        canvas.style.width  = container.offsetWidth  + "px";
        canvas.style.height = container.offsetHeight + "px";
      }
      resize();

      // Assign a stable color to every float once
      const floatColorMap = floatColorMapRef.current;
      floatColorMap.clear();
      let colorCounter = 0;
      for (const p of profiles) {
        if (p.float_id && !floatColorMap.has(p.float_id)) {
          floatColorMap.set(p.float_id, colorCounter++ % TRAIL_COLORS.length);
        }
      }

      // ── THE DRAW LOOP ────────────────────────────────────────
      function draw(time: number) {
        if (destroyedRef.current || !mapRef.current) return;

        const curMode     = modeRef.current;
        const curSelected = selectedRef.current;
        const curTrails   = allTrailsRef.current;
        const curDots     = currentDayProfilesRef.current ?? profiles;
        const prevDots    = prevDayProfilesRef.current;
        const curFloat    = selectedFloatRef.current;
        const curPlaying  = isPlayingRef.current ?? false;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const R = 5;

        // ── Trail for selected float ───────────────────────────
        if (curTrails && curFloat) {
          const pts = curTrails.get(curFloat);
          if (pts && pts.length >= 2) {
            const colorIdx  = floatColorMap.get(curFloat) ?? 0;
            const baseColor = TRAIL_COLORS[colorIdx];
            const { r, g, b } = hexToRgb(baseColor);

            for (let i = 1; i < pts.length; i++) {
              const prev = safeLatLngToPoint(map, pts[i - 1].lat, pts[i - 1].lng);
              const curr = safeLatLngToPoint(map, pts[i].lat,     pts[i].lng);
              if (!prev || !curr) continue;
              const age = i / (pts.length - 1);
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(curr.x, curr.y);
              ctx.strokeStyle = `rgba(${r},${g},${b},${0.12 + 0.78 * age})`;
              ctx.lineWidth = age > 0.8 ? 3 : 2;
              ctx.setLineDash([]);
              ctx.stroke();
            }

            if (pts.length >= 3) {
              const step = Math.max(1, Math.floor(pts.length / 6));
              for (let i = step; i < pts.length - 1; i += step) {
                const prev = safeLatLngToPoint(map, pts[i - 1].lat, pts[i - 1].lng);
                const curr = safeLatLngToPoint(map, pts[i].lat,     pts[i].lng);
                if (!prev || !curr) continue;
                const dx = curr.x - prev.x, dy = curr.y - prev.y;
                const mx = (prev.x + curr.x) / 2, my = (prev.y + curr.y) / 2;
                drawArrowhead(ctx, mx, my, dx, dy, 7, baseColor, 0.5 * (i / (pts.length - 1)));
              }
            }

            const tipLast = safeLatLngToPoint(map, pts[pts.length - 1].lat, pts[pts.length - 1].lng);
            const tipPrev = safeLatLngToPoint(map, pts[pts.length - 2].lat, pts[pts.length - 2].lng);
            if (tipLast && tipPrev)
              drawArrowhead(ctx, tipLast.x, tipLast.y, tipLast.x - tipPrev.x, tipLast.y - tipPrev.y, 10, baseColor, 0.95);

            const headPt = safeLatLngToPoint(map, pts[pts.length - 1].lat, pts[pts.length - 1].lng);
            if (headPt) {
              const pulse = 0.5 + 0.5 * Math.sin(time * 0.005);

              for (let ring = 3; ring >= 1; ring--) {
                ctx.beginPath();
                ctx.arc(headPt.x, headPt.y, R + 4 + ring * 5 + pulse * 4, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 * ring * pulse})`;
                ctx.lineWidth = 1.5; ctx.stroke();
              }

              const grad = ctx.createRadialGradient(headPt.x, headPt.y, 0, headPt.x, headPt.y, R + 12 + pulse * 6);
              grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
              grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
              ctx.beginPath();
              ctx.arc(headPt.x, headPt.y, R + 12 + pulse * 6, 0, Math.PI * 2);
              ctx.fillStyle = grad; ctx.fill();

              ctx.beginPath();
              ctx.arc(headPt.x, headPt.y, R + 3, 0, Math.PI * 2);
              ctx.fillStyle = baseColor; ctx.globalAlpha = 1; ctx.fill();
              ctx.beginPath();
              ctx.arc(headPt.x, headPt.y, (R + 3) * 0.38, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill();
              ctx.globalAlpha = 1;

              if (curPlaying && pts.length >= 2) {
                const prev2 = safeLatLngToPoint(map, pts[pts.length - 2].lat, pts[pts.length - 2].lng);
                if (prev2) {
                  const dx = headPt.x - prev2.x, dy = headPt.y - prev2.y;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  const nx = dx / len, ny = dy / len;
                  for (let s = 1; s <= 5; s++) {
                    ctx.beginPath();
                    ctx.moveTo(headPt.x - nx * s * 5, headPt.y - ny * s * 5);
                    ctx.lineTo(headPt.x - nx * (s + 1) * 5, headPt.y - ny * (s + 1) * 5);
                    ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 / s})`;
                    ctx.lineWidth = Math.max(0.5, R + 2 - s * 0.6);
                    ctx.lineCap = "round"; ctx.stroke();
                  }
                }
              }
            }
          }
        }

        // ── Movement arrows: prev position ──► current position ─
        if (prevDots && prevDots.length > 0) {
          const prevMap = new Map<string, ArgoProfile>();
          for (const p of prevDots) prevMap.set(p.float_id, p);

          for (const cur of curDots) {
            if (destroyedRef.current) break;
            const prev = prevMap.get(cur.float_id);
            if (!prev) continue;

            if (Math.abs(cur.latitude - prev.latitude) < 0.001 &&
                Math.abs(cur.longitude - prev.longitude) < 0.001) continue;

            const fromPt = safeLatLngToPoint(map, prev.latitude, prev.longitude);
            const toPt   = safeLatLngToPoint(map, cur.latitude,  cur.longitude);
            if (!fromPt || !toPt) continue;

            const dx = toPt.x - fromPt.x;
            const dy = toPt.y - fromPt.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 3) continue;

            const col = getColor(cur, curMode);
            const isFocused = !curFloat || curFloat === cur.float_id;
            const alpha = isFocused ? 0.85 : 0.18;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(fromPt.x, fromPt.y);
            ctx.lineTo(toPt.x, toPt.y);
            ctx.strokeStyle = col;
            ctx.lineWidth = isFocused ? 1.8 : 1;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            drawArrowhead(ctx, toPt.x, toPt.y, dx, dy, isFocused ? 9 : 6, col, alpha);

            ctx.save();
            ctx.globalAlpha = isFocused ? 0.35 : 0.1;
            ctx.beginPath();
            ctx.arc(fromPt.x, fromPt.y, R - 1, 0, Math.PI * 2);
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }

        // ── Float dots ─────────────────────────────────────────
        for (const p of curDots) {
          if (destroyedRef.current) break;

          if (curFloat && p.float_id === curFloat) continue;

          const pt = safeLatLngToPoint(map, p.latitude, p.longitude);
          if (!pt) continue;

          const col       = getColor(p, curMode);
          const isSel     = curSelected?.profile_id === p.profile_id;
          const isFocused = !curFloat || curFloat === p.float_id;
          const dotAlpha  = isFocused ? 0.92 : 0.18;

          if (isSel) {
            const pulse = 0.5 + 0.5 * Math.sin(time * 0.003);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, R + 4 + pulse * 4, 0, Math.PI * 2);
            ctx.strokeStyle = col; ctx.globalAlpha = 0.3 * pulse;
            ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, R + 2, 0, Math.PI * 2);
            ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(pt.x + 1, pt.y + 1, R, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.globalAlpha = dotAlpha; ctx.fill();

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSel ? R + 1 : R, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.globalAlpha = dotAlpha; ctx.fill();
          ctx.globalAlpha = 1;

          ctx.beginPath();
          ctx.arc(pt.x - R * 0.25, pt.y - R * 0.25, R * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${isFocused ? 0.25 : 0.05})`; ctx.fill();
        }

        if (!destroyedRef.current) {
          animRef.current = requestAnimationFrame(draw);
        }
      }

      animRef.current = requestAnimationFrame(draw);
      map.on("move zoom resize", () => { if (!destroyedRef.current) resize(); });

      const onMouseMove = (e: MouseEvent) => {
        if (destroyedRef.current) return;
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let nearest: ArgoProfile | null = null;
        let minD2 = 400;
        const checkList = currentDayProfilesRef.current ?? profiles;
        for (const p of checkList) {
          if (selectedFloatRef.current && p.float_id !== selectedFloatRef.current) continue;
          const pt = safeLatLngToPoint(map, p.latitude, p.longitude);
          if (!pt) continue;
          const d2 = (pt.x - mx) ** 2 + (pt.y - my) ** 2;
          if (d2 < minD2) { minD2 = d2; nearest = p; }
        }
        onHover(nearest, e.clientX, e.clientY);
      };

      container.addEventListener("mousemove", onMouseMove);
      container.addEventListener("mouseleave", () => onHover(null, 0, 0));
      container.addEventListener("click", onMapClick);
    }

    init();

    return () => {
      destroyedRef.current    = true;
      initializingRef.current = false;   // ← reset so a future remount can re-init
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      canvasRef.current?.remove();
      canvasRef.current = null;
      try { mapRef.current?.remove(); } catch (_) {}
      mapRef.current = null;
    };
  // ONLY re-mount when the full dataset changes (new API fetch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "520px", background: T.bgVoid }} />
  );
}