"use client";
import { usePathname } from "next/navigation";

export default function ClientWrapper({ children }) {
  const pathname = usePathname();
  const isAccountPage = pathname === "/account";

  return (
    <body 
      className={`h-dvh bg-white flex flex-col ${
        isAccountPage ? "" : "overflow-hidden"
      }`} 
      style={{ "--header-h": "56px" }}
    >
      {children}
    </body>
  );
}