import { Poppins } from "next/font/google";
import "./globals.css";
import TopBar from "./components/TopBar"; // note: "./components/TopBar"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
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
