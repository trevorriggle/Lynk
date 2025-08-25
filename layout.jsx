export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif", padding: 40 }}>
        {children}
      </body>
    </html>
  );
}
