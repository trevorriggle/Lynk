// app/layout.tsx
import { Poppins } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"], // includes Black
  variable: "--font-poppins",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable} font-sans bg-lynk-bg text-lynk-ink`}
      >
        {/* Global top navigation */}
        <TopBar />

        {/* Page content */}
        {children}
      </body>
    </html>
  );
}
