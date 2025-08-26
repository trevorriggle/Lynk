import "./globals.css";
import TopBar from "./components/TopBar";

export const metadata = { title: "Lynk", description: "Conversational workspace" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <TopBar />
        {/* TopBar is h-14 (56px). -mt-px closes any faint 1px seam below it. */}
        <div className="pt-14 -mt-px">{children}</div>
      </body>
    </html>
  );
}
