import "./globals.css";
import TopBar from "./components/TopBar";
import ClientWrapper from "./components/ClientWrapper";

export const metadata = { title: "Lynk", description: "Conversational workspace" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <ClientWrapper>
        <TopBar />
        <div className="-mt-px flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </ClientWrapper>
    </html>
  );
}