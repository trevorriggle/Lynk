import "./globals.css";

export const metadata = { title: "Lynk", description: "Lynk — research & build hub" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
