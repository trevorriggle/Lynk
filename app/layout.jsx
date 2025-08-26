// app/layout.jsx
import "./globals.css";
import { Poppins } from "next/font/google";
import TopBar from "./components/TopBar";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "900"], // 400 Regular, 900 Black
  variable: "--font-poppins",
});

export const metadata = {
  title: "Lynk",
  description: "Conversational workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
