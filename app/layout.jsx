// app/layout.jsx
import "./globals.css";
import { Poppins } from "next/font/google";
import TopBar from "./components/TopBar";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <TopBar />
        <div className="pt-12">{children}</div>
      </body>
    </html>
  );
}

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "900"], // 400 = Regular, 900 = Black
  variable: "--font-poppins",
});

export const metadata = {
  title: "HubAI",
  description: "…",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
