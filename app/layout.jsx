import "./globals.css";
import TopBar from "./components/TopBar";

export const metadata = { title: "Lynk", description: "Conversational workspace" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <TopBar />
        {/* Header is 56px (h-14). The -mt-px erases any 1px seam from borders below. */}
        <div className="pt-14 -mt-px">{children}</div>
      </body>
    </html>
  );
}
