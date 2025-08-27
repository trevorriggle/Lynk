import "./globals.css";
import TopBar from "./components/TopBar";

export const metadata = { title: "Lynk", description: "Conversational workspace" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* Pin app to the viewport and prevent page-level scrolling */}
      <body className="h-dvh overflow-hidden bg-white flex flex-col" style={{ "--header-h": "56px" }}>
        <TopBar />
        {/* Give the app area below the header full height and no outer overflow */}
        <div className="-mt-px flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
