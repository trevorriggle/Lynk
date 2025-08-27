import "./globals.css";
import TopBar from "./components/TopBar";

export const metadata = { title: "Lynk", description: "Conversational workspace" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* Expose the header height as a CSS variable so pages can size to viewport minus header */}
      <body className="min-h-screen bg-white" style={{ "--header-h": "56px" }}>
        <TopBar />
        {/* TopBar is h-14 (56px). -mt-px closes any faint 1px seam below it. */}
        <div className="-mt-px">{children}</div>
      </body>
    </html>
  );
}
