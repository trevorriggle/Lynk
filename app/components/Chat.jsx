// app/components/Chat.jsx
"use client";

export default function Chat() {
  return (
    <div className="flex flex-col space-y-4 p-6">
      {/* Agent bubble */}
      <div className="max-w-xl rounded-2xl bg-lynk-agent text-lynk-ink px-4 py-3 shadow-soft">
        Welcome to Lynk. Continue, discuss new ideas, or do anything else.
      </div>

      {/* User bubble */}
      <div className="max-w-xl ml-auto rounded-2xl bg-lynk-user text-lynk-ink px-4 py-3 shadow-soft">
        Got it, thanks!
      </div>
    </div>
  );
}
