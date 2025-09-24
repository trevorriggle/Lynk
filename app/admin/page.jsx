"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/admin/update-user-tier");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      } else if (response.status === 403) {
        setMessage("Admin access required. Add your user ID to the ADMIN_USER_IDS array.");
      } else {
        setMessage("Failed to fetch users");
      }
    } catch (error) {
      setMessage("Error fetching users");
    } finally {
      setLoading(false);
    }
  };

  const updateUserTier = async (userId, newTier) => {
    setUpdating(userId);
    try {
      const response = await fetch("/api/admin/update-user-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier: newTier })
      });

      if (response.ok) {
        setMessage(`User updated to ${newTier} tier`);
        fetchUsers(); // Refresh the list
      } else {
        const error = await response.text();
        setMessage(`Failed to update user: ${error}`);
      }
    } catch (error) {
      setMessage("Error updating user");
    } finally {
      setUpdating(null);
    }
  };

  const getTierColor = (tier) => {
    switch (tier) {
      case "PRO": return "bg-green-100 text-green-800";
      case "FREE_VERIFIED": return "bg-blue-100 text-blue-800";
      case "FREE_GUEST": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#176A82] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-1">Manage user tiers and access levels</p>
          </div>

          {message && (
            <div className="mx-6 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800">{message}</p>
            </div>
          )}

          <div className="p-6">
            {users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No users found or admin access required</p>
                <p className="text-sm text-gray-400 mt-2">
                  Add your Supabase user ID to the ADMIN_USER_IDS array in /app/api/admin/update-user-tier/route.js
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Tier
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {user.email || "No email"}
                            </div>
                            <div className="text-sm text-gray-500 font-mono">
                              {user.id.slice(0, 8)}...
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTierColor(user.tier)}`}>
                            {user.tier}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            user.emailConfirmed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {user.emailConfirmed ? 'Verified' : 'Unverified'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          {["FREE_GUEST", "FREE_VERIFIED", "PRO"].map((tier) => (
                            <button
                              key={tier}
                              onClick={() => updateUserTier(user.id, tier)}
                              disabled={updating === user.id || user.tier === tier}
                              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                user.tier === tier
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : updating === user.id
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-[#176A82] text-white hover:opacity-90"
                              }`}
                            >
                              {updating === user.id ? "..." : `→ ${tier}`}
                            </button>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Setup Instructions</h2>
          <div className="space-y-4 text-sm text-gray-600">
            <div>
              <h3 className="font-medium text-gray-900">1. Get your User ID</h3>
              <p>Go to your Supabase Dashboard → Authentication → Users and copy your user ID</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">2. Add yourself as admin</h3>
              <p>Edit <code className="bg-gray-100 px-1 rounded">/app/api/admin/update-user-tier/route.js</code> and add your user ID to the ADMIN_USER_IDS array</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">3. Access this page</h3>
              <p>Visit <code className="bg-gray-100 px-1 rounded">/admin</code> to manage users</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}