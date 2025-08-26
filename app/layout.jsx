// app/layout.jsx
import "./globals.css";
import { Poppins } from "next/font/google";
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
