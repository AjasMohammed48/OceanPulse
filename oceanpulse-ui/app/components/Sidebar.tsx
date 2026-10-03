"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    group: "Main",
    items: [
      { href: "/",     label: "Dashboard",  icon: "◈", description: "Live ocean status" },
      { href: "/chat", label: "Ocean Chat", icon: "◎", description: "Ask the AI assistant" },
    ],
  },
  {
    group: "Visualisations",
    items: [
      { href: "/heatmap",  label: "Temperature Map",          icon: "⬡", description: "Sea surface temperature" },
      { href: "/heatwaves",label: "Marine Heatwave Events",   icon: "◉", description: "Detected heatwave history" },
      { href: "/trends",   label: "Long-term Ocean Trends",   icon: "◌", description: "Decade-scale changes" },
      { href: "/analysis", label: "Deep Ocean Analysis",      icon: "⬢", description: "Physics & correlation charts" },
      {
        href: "/argo-map",
        label: "Argo Float Map",
        description: "Live float positions & profiles",
        icon: "◉",   // or whatever icon shape your sidebar uses
      }
    ],
  },
  {
    group: "Data",
    items: [
      { href: "/argo", label: "Find Argo Float Profiles", icon: "◍", description: "Search underwater robot data" },
    ],
  },
  {
    group: "Info",
    items: [
      { href: "/about", label: "About OceanPulse", icon: "◇", description: "What this platform does" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">🌊</div>
        <div>
          <p className="brand-name">OceanPulse</p>
          <p className="brand-tagline">Indian Ocean Intelligence</p>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div key={group.group} className="nav-group">
            <p className="nav-group-label">{group.group}</p>
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`}>
                  <span className="nav-icon">{item.icon}</span>
                  <div className="nav-text">
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-desc">{item.description}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="status-dot" />
        <span className="status-label">Live data feed active</span>
      </div>
    </aside>
  );
}