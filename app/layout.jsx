// app/layout.jsx
import "./globals.css";
import TopBar from "./components/TopBar";
import ClientWrapper from "./components/ClientWrapper";
import InteractionHandler from "./components/InteractionHandler";

export const metadata = { 
  title: "Lynk", 
  description: "Multi-model AI chat with smart insights and productivity features" 
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <ClientWrapper>
          <div className="flex h-screen flex-col">
            <TopBar />
            <div className="-mt-px flex-1 min-h-0 overflow-hidden relative">
              {children}
              <InteractionHandler />
            </div>
          </div>
        </ClientWrapper>
      </body>
    </html>
  );
}