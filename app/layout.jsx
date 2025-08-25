// app/layout.jsx
import { Poppins } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar"; // change to a relative path if your alias "@" isn't set

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"], // includes Black
  variable: "--font-poppins",
});

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans bg-lynk-bg text-lynk-ink`}>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
