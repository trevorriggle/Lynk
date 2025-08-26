// app/layout.jsx
import "./globals.css";
import { Poppins } from "next/font/google";
import TopBar from "./components/TopBar";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "900"],
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
        <TopBar />
        {/* Push content below the fixed bar */}
        <div className="pt-12">{children}</div>
      </body>
    </html>
  );
}

// If you created the top bar earlier, keep this import. If not, delete the line.
// import TopBar from "./components/TopBar";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "900"], // 400 = Regular, 900 = Black
  variable: "--font-poppins",
});

export const metadata = {
  title: "HubAI",
  description: "Conversational workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        {/* Uncomment if you have TopBar.jsx */}
        {/* <TopBar /> */}
        {/* If you use TopBar, add pt-12 here: <div className="pt-12">{children}</div> */}
        {children}
      </body>
    </html>
  );
}
