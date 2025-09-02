"use client";

import { useState } from "react";

export default function AccountPage() {
  const [rollingArchive, setRollingArchive] = useState(true);
  const [tokenAlerts, setTokenAlerts] = useState(false);

  return (
    <div className="flex flex-col items-center w-full h-full overflow-y-auto p-6">
      {/* Main container */}
      <div className="flex flex-row w-full max-w-5xl bg-white shadow-md rounded-2xl p-8 gap-12">
        {/* Left side – Profile + Settings */}
        <div className="flex flex-col w-1/2 space-y-6">
          {/* Avatar + Info */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-sky-500 text-white text-xl font-bold">
              TR
            </div>
            <div>
              <h2 className="font-semibold text-lg">Trevor Riggle</h2>
              <p className="text-sm text-gray-600">trevorriggle@gmail.com</p>
              <p className="text-xs text-gray-500">Basic</p>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col space-y-4">
            <label className="flex items-center justify-between">
              <span>Create rolling archive? (Uses more tokens)</span>
              <input
                type="checkbox"
                checked={rollingArchive}
                onChange={() => setRollingArchive(!rollingArchive)}
                className="toggle-checkbox"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Token Usage Alerts</span>
              <input
                type="checkbox"
                checked={tokenAlerts}
                onChange={() => setTokenAlerts(!tokenAlerts)}
                className="toggle-checkbox"
              />
            </label>
          </div>

          {/* Account actions */}
          <div className="flex flex-col space-y-2 text-sky-600 cursor-pointer">
            <p>Import your own keys</p>
            <p>Change login information</p>
            <p>Delete all chats</p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-300" />

        {/* Right side – Token Usage */}
        <div className="flex flex-col w-1/2 space-y-6">
          <div>
            <h3 className="font-semibold">Token Usage</h3>
            <div className="w-full bg-gray-200 rounded-full h-4 mt-2">
              <div
                className="bg-sky-500 h-4 rounded-full"
                style={{ width: "80%" }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-1">
              800,289 / 1,000,000 (80% full)
            </p>
          </div>

          <button className="bg-yellow-400 text-black font-semibold px-4 py-2 rounded-xl">
            Upgrade Your Services
          </button>

          <div>
            <p className="font-medium">Upgrading your plan unlocks new features!</p>
            <ul className="list-disc list-inside text-gray-700 mt-2 space-y-1">
              <li>More Tokens</li>
              <li>More Models</li>
              <li>Memory Upgrades</li>
              <li>Commands</li>
              <li>Larger File Support</li>
              <li>Much More</li>
            </ul>
            <p className="mt-3 text-sm">
              Find the plan that works best for you,{" "}
              <a href="#" className="text-sky-600 underline">
                here
              </a>
              .
            </p>
          </div>

          <button className="bg-sky-600 text-white font-semibold px-4 py-2 rounded-xl">
            Help Lynk Grow
          </button>
        </div>
      </div>
    </div>
  );
}
