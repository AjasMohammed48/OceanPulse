"use client";

import React from "react";
import Sidebar from "./Sidebar";

interface PageShellProps {
  children: React.ReactNode;
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="app-shell ocean-grid-bg">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  );
}
