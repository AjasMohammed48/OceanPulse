import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ServerStatus from "./components/ServerStatus";
import OceanBackground from "./components/OceanBackground";
import OceanCursor from "./components/OceanCursor";
import PageWrapper from "./components/PageWrapper";

export const metadata: Metadata = {
  title: "OceanPulse — Indian Ocean Intelligence",
  description: "AI-powered ocean monitoring dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* 3D animated canvas background — sits behind everything */}
        <OceanBackground />

        {/* Custom jellyfish cursor — mounted at root so it covers whole page */}
        <OceanCursor />

        <ServerStatus />

        <div className="app-layout">
          <Sidebar />

          <main className="main-content">
            <PageWrapper>
              {children}
            </PageWrapper>
          </main>
        </div>
      </body>
    </html>
  );
}