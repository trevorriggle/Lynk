"use client";
import "./globals.css";
import TopBar from "./components/TopBar";
import { usePathname } from "next/navigation";

export const metadata = { title: "Lynk", description: "Conversational workspace" };

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const isAccountPage = pathname === "/account";

  return (
    <html lang="en">
      <body 
        className={`h-dvh bg-white flex flex-col ${
          isAccountPage ? "" : "overflow-hidden"
        }`} 
        style={{ "--header-h": "56px" }}
      >
        <TopBar />
        <div className="-mt-px flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}