// lib/database.js - Database utilities for Lynk session and quota management
import { supabase } from './supabase.js';

// User tier management
export async function getUserTier(userId) {
  if (!userId) return 'FREE_GUEST';

  try {
    const { data, error } = await supabase
      .from('user_tiers')
      .select('tier')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user tier:', error);
      return 'FREE_VERIFIED'; // Default for authenticated users
    }

    return data?.tier || 'FREE_VERIFIED';
  } catch (error) {
    console.error('getUserTier error:', error);
    return 'FREE_VERIFIED';
  }
}

export async function setUserTier(userId, tier) {
  if (!userId || !['FREE_GUEST', 'FREE_VERIFIED', 'PRO'].includes(tier)) {
    throw new Error('Invalid userId or tier');
  }

  const { error } = await supabase
    .from('user_tiers')
    .upsert(
      { user_id: userId, tier, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}

// Quota management
export async function getUserQuota(userId, quotaType) {
  if (!userId) return 0;

  try {
    const { data, error } = await supabase
      .rpc('get_user_quota', {
        p_user_id: userId,
        p_quota_type: quotaType
      });

    if (error) throw error;
    return data || 0;
  } catch (error) {
    console.error('getUserQuota error:', error);
    return 0;
  }
}

export async function incrementUserQuota(userId, quotaType, increment = 1) {
  if (!userId) throw new Error('userId required');

  try {
    const { data, error } = await supabase
      .rpc('increment_user_quota', {
        p_user_id: userId,
        p_quota_type: quotaType,
        p_increment: increment
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('incrementUserQuota error:', error);
    throw error;
  }
}

// Session management
export async function getSession(sessionId, userId = null) {
  const { data: sessionData, error: sessionError } = await supabase
    .from('lynk_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (sessionError && sessionError.code !== 'PGRST116') {
    throw sessionError;
  }

  // If session doesn't exist, return null (will be created on first message)
  if (!sessionData) {
    return null;
  }

  // Get turns
  const { data: turns, error: turnsError } = await supabase
    .from('lynk_session_turns')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  if (turnsError) throw turnsError;

  // Get snapshots
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('lynk_session_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (snapshotsError) throw snapshotsError;

  // Get commands
  const { data: commands, error: commandsError } = await supabase
    .from('lynk_session_commands')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (commandsError) throw commandsError;

  return {
    id: sessionData.session_id,
    userId: sessionData.user_id,
    title: sessionData.title,
    tier: sessionData.tier,
    isGuest: sessionData.is_guest,
    modelProvider: sessionData.model_provider,
    modelName: sessionData.model_name,
    topicCounts: sessionData.topic_counts || {},
    lastSnapshotUserCount: sessionData.last_snapshot_user_count || 0,
    createdAt: sessionData.created_at,
    updatedAt: sessionData.updated_at,
    expiresAt: sessionData.expires_at,
    turns: turns || [],
    liveHistory: snapshots?.map(s => ({
      id: s.snapshot_id,
      created_at: s.created_at,
      from_turn: s.from_turn,
      to_turn: s.to_turn,
      key_topics: s.key_topics || [],
      discussion: s.discussion
    })) || [],
    commands: commands?.map(c => ({
      slug: c.slug,
      command: c.command,
      confidence: c.confidence,
      created_at: c.created_at
    })) || []
  };
}

export async function createSession(sessionId, userId = null, tier = 'FREE_GUEST') {
  const isGuest = !userId;
  const expiresAt = isGuest && tier === 'FREE_GUEST'
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours for guests
    : null;

  const { data, error } = await supabase
    .from('lynk_sessions')
    .insert([{
      session_id: sessionId,
      user_id: userId,
      tier,
      is_guest: isGuest,
      expires_at: expiresAt
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.session_id,
    userId: data.user_id,
    title: data.title,
    tier: data.tier,
    isGuest: data.is_guest,
    topicCounts: {},
    lastSnapshotUserCount: 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    expiresAt: data.expires_at,
    turns: [],
    liveHistory: [],
    commands: []
  };
}

export async function updateSession(sessionId, updates) {
  const { error } = await supabase
    .from('lynk_sessions')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('session_id', sessionId);

  if (error) throw error;
}

export async function addSessionTurn(sessionId, role, content, provider = null, model = null) {
  const { error } = await supabase
    .from('lynk_session_turns')
    .insert([{
      session_id: sessionId,
      role,
      content,
      provider,
      model
    }]);

  if (error) throw error;
}

export async function addSessionSnapshot(sessionId, snapshotId, fromTurn, toTurn, keyTopics, discussion) {
  const { error } = await supabase
    .from('lynk_session_snapshots')
    .insert([{
      session_id: sessionId,
      snapshot_id: snapshotId,
      from_turn: fromTurn,
      to_turn: toTurn,
      key_topics: keyTopics,
      discussion
    }]);

  if (error) throw error;
}

export async function addSessionCommand(sessionId, slug, command, confidence = 'high') {
  const { error } = await supabase
    .from('lynk_session_commands')
    .insert([{
      session_id: sessionId,
      slug,
      command,
      confidence
    }]);

  if (error) throw error;
}

export async function getUserSessions(userId, limit = 20) {
  const { data, error } = await supabase
    .from('lynk_sessions')
    .select('session_id, title, model_provider, model_name, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function cleanupExpiredGuestSessions() {
  try {
    const { data, error } = await supabase
      .rpc('cleanup_expired_guest_sessions');

    if (error) throw error;
    return data || 0;
  } catch (error) {
    console.error('cleanupExpiredGuestSessions error:', error);
    return 0;
  }
}

// Observability logging
export async function logRequest(userId, sessionId, provider, model, tier, latencyMs, limitHit = false, error = null) {
  try {
    await supabase
      .from('lynk_request_logs')
      .insert([{
        user_id: userId,
        session_id: sessionId,
        provider,
        model,
        tier,
        latency_ms: latencyMs,
        limit_hit: limitHit,
        error
      }]);
  } catch (logError) {
    console.error('Failed to log request:', logError);
    // Don't throw - logging should not break the main flow
  }
}