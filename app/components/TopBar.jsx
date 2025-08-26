"use client";

function ChevronDown({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.28l3.71-3.05a.75.75 0 111.04 1.08l-4.23 3.48a.75.75 0 01-.96 0L5.21 8.31a.75.75 0 01.02-1.1z"/>
    </svg>
  );
}
function Magnifier({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      <circle cx="11" cy="11" r="7" strokeWidth="2"></circle>
      <path d="M20 20l-3.5-3.5" strokeWidth="2"></path>
    </svg>
  );
}

export default function TopBar() {
  return (
    <header className="sticky top-0 z-[100] w-full bg-[#E6E8EA]">
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          {/* Left: logo + project/workspace */}
          <div className="flex min-w-0 items-center gap-4">
            {/* Use plain <img> to avoid Next/Image config surprises */}
            <img
              src="/lynk-logo.png"
              alt="Lynk"
              className="h-7 w-auto select-none"
              draggable="false"
            />

            <div className="hidden items-center gap-2 sm:flex text-gray-600">
              <span className="text-sm">Project</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md bg-white/70 px-3 py-1 text-sm font-medium text-gray-700 ring-1 ring-black/10 hover:bg-white"
              >
                Workspace
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Center: search */}
          <div className="flex w-full max-w-[720px] flex-1">
            <label className="flex w-full items-center gap-3 rounded-full bg-white px-4 py-2 ring-1 ring-black/10">
              <Magnifier className="h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search files, chats, and commands..."
                className="w-full bg-transparent text-[15px] leading-6 text-gray-800 placeholder:font-medium focus:outline-none"
              />
            </label>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-3">
            <button className="!rounded-full !bg-[#176A82] !px-4 !py-2 !text-sm !font-semibold !text-white hover:opacity-95">
              New Chat
            </button>
            <button className="!rounded-full !bg-[#176A82] !px-4 !py-2 !text-sm !font-semibold !text-white hover:opacity-95">
              Upload
            </button>
            <button className="!rounded-full !bg-[#176A82] !px-4 !py-2 !text-sm !font-semibold !text-white hover:opacity-95">
              Settings
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#176A82] bg-white text-[13px] font-semibold text-gray-600">
              AC
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
