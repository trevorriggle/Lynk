"use client"; // 👈 important, makes this run in the browser

import { useState } from "react";

export function useChat() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(text: string) {
    setIsLoading(true);
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...messages, userMsg] }),
    });

    // Read the streaming response
    const reader = resp.body?.getReader();
    let assistantContent = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        assistantContent += chunk;

        // Update assistant message as it streams
        setMessages((prev) => [
          ...prev.filter((m) => m.role !== "assistant"),
          { role: "assistant", content: assistantContent },
        ]);
      }
    }

    setIsLoading(false);
  }

  return { messages, sendMessage, isLoading };
}
