export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Helper function to get user from request
async function getUserFromRequest(req) {
  try {
    const cookies = req.headers.get("cookie") || "";
    const cookieObj = {};
    cookies.split(/; */).forEach(part => {
      const [key, ...values] = part.split("=");
      if (key && values.length > 0) {
        cookieObj[key.trim()] = decodeURIComponent(values.join("="));
      }
    });
    
    const access_token = cookieObj["sb-access-token"];
    if (!access_token) return null;

    const userResponse = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 
        apikey: SERVICE, 
        Authorization: `Bearer ${access_token}` 
      },
    });
    
    if (!userResponse.ok) return null;
    const user = await userResponse.json();
    return user?.id || null;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// Helper function for Supabase requests
async function supabaseRequest(path, options = {}) {
  const url = `${SUPA_URL}/rest/v1${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE,
      'Authorization': `Bearer ${SERVICE}`,
      'Prefer': 'return=representation',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}`);
  }
  
  return response.json();
}

// GET - Fetch all user data (sessions, messages, context files, etc.)
export async function GET(req) {
  try {
    const userId = await getUserFromRequest(req);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Fetch all user data in parallel
    const [sessions, contextFiles, behaviors, commands] = await Promise.all([
      // Get sessions with their messages
      supabaseRequest(`/chat_sessions?user_id=eq.${userId}&order=updated_at.desc`),
      supabaseRequest(`/context_files?user_id=eq.${userId}&order=created_at.desc`),
      supabaseRequest(`/user_behaviors?user_id=eq.${userId}&order=created_at.desc`),
      supabaseRequest(`/user_commands?user_id=eq.${userId}&order=created_at.desc`)
    ]);

    // Get messages for all sessions
    const sessionIds = sessions.map(s => s.id);
    let messages = [];
    if (sessionIds.length > 0) {
      const messagesQuery = sessionIds.map(id => `session_id.eq.${id}`).join(',');
      messages = await supabaseRequest(`/chat_messages?or=(${messagesQuery})&order=created_at.asc`);
    }

    // Group messages by session
    const messagesBySession = messages.reduce((acc, msg) => {
      if (!acc[msg.session_id]) acc[msg.session_id] = [];
      acc[msg.session_id].push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at,
        model: {
          provider: msg.model_provider,
          model: msg.model_name
        },
        attachments: msg.attachments || []
      });
      return acc;
    }, {});

    // Transform to match frontend format
    const transformedSessions = {};
    const order = [];
    
    sessions.forEach(session => {
      transformedSessions[session.id] = {
        id: session.id,
        title: session.title,
        messages: messagesBySession[session.id] || [],
        model: {
          provider: session.model_provider,
          model: session.model_name
        },
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        userId: session.user_id
      };
      order.push(session.id);
    });

    return Response.json({
      sessions: transformedSessions,
      order,
      contextFiles: contextFiles.map(f => ({
        key: f.key,
        label: f.label,
        content: f.content,
        type: f.type,
        size: f.size,
        createdAt: f.created_at
      })),
      behaviors: behaviors.map(b => ({
        key: b.key,
        label: b.label,
        content: b.content,
        createdAt: b.created_at
      })),
      commands: commands.map(c => ({
        key: c.key,
        label: c.label,
        content: c.content,
        createdAt: c.created_at
      }))
    });

  } catch (error) {
    console.error("Failed to fetch user data:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// POST - Save/update chat data
export async function POST(req) {
  try {
    const userId = await getUserFromRequest(req);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { type, data } = await req.json();

    switch (type) {
      case 'save_session':
        const sessionData = {
          id: data.id,
          user_id: userId,
          title: data.title,
          model_provider: data.model?.provider,
          model_name: data.model?.model,
          updated_at: new Date().toISOString()
        };

        // Upsert session
        await supabaseRequest('/chat_sessions', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(sessionData)
        });

        return Response.json({ success: true });

      case 'save_message':
        const messageData = {
          id: data.id,
          session_id: data.sessionId,
          role: data.role,
          content: data.content,
          model_provider: data.model?.provider,
          model_name: data.model?.model,
          attachments: data.attachments || [],
          created_at: data.timestamp || new Date().toISOString()
        };

        await supabaseRequest('/chat_messages', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(messageData)
        });

        return Response.json({ success: true });

      case 'save_context_file':
        await supabaseRequest('/context_files', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_id: userId,
            key: data.key,
            label: data.label,
            content: data.content,
            type: data.type,
            size: data.size
          })
        });

        return Response.json({ success: true });

      case 'save_behavior':
        await supabaseRequest('/user_behaviors', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_id: userId,
            key: data.key,
            label: data.label,
            content: data.content
          })
        });

        return Response.json({ success: true });

      case 'save_command':
        await supabaseRequest('/user_commands', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_id: userId,
            key: data.key,
            label: data.label,
            content: data.content
          })
        });

        return Response.json({ success: true });


      default:
        return new Response("Invalid type", { status: 400 });
    }

  } catch (error) {
    console.error("Failed to save data:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// DELETE - Delete chat data
export async function DELETE(req) {
  try {
    const userId = await getUserFromRequest(req);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    const key = searchParams.get('key');

    switch (type) {
      case 'session':
        // Delete session (messages will be cascade deleted)
        await supabaseRequest(`/chat_sessions?id=eq.${id}`, {
          method: 'DELETE'
        });
        return Response.json({ success: true });

      case 'context_file':
        await supabaseRequest(`/context_files?user_id=eq.${userId}&key=eq.${key}`, {
          method: 'DELETE'
        });
        return Response.json({ success: true });

      case 'behavior':
        await supabaseRequest(`/user_behaviors?user_id=eq.${userId}&key=eq.${key}`, {
          method: 'DELETE'
        });
        return Response.json({ success: true });

      case 'command':
        await supabaseRequest(`/user_commands?user_id=eq.${userId}&key=eq.${key}`, {
          method: 'DELETE'
        });
        return Response.json({ success: true });


      default:
        return new Response("Invalid type", { status: 400 });
    }

  } catch (error) {
    console.error("Failed to delete data:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}