import "./globals.css";
import { Montserrat, Poppins } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans", // main UI
});

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-display", // headings
});

export const metadata = { title: "Lynk", description: "Lynk — research & build hub" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children<body className={`${montserrat.variable} ${poppins.variable} font-sans`}>
  {children}
  
}</body>
    </html>
  );
}
