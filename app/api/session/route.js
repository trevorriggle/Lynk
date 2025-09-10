// Find this section in your session route (around line 370):

// 4) Background processing: Guests get NONE, Auth users get FULL functionality
if (!s.isGuest) {
  console.log("Running background processing for verified user");
  await updateLiveNotes(s);  // ❌ WRONG - this function doesn't exist
  
  // topic mentions (per-turn de-duped) - auth users only
  trackMessageTopics(s, message);
  
  // Snapshot every 5 messages for auth users (same as original)
  const userTurns = userTurnCount(s.turns);
  if (userTurns > 0 && userTurns % 5 === 0) {
    await consolidateSnapshot(s);  // ❌ WRONG - this function doesn't exist
  }
  
  console.log(`Session state: ${s.snapshots?.length || 0} snapshots, ${s.commands?.length || 0} commands`);
}

// REPLACE IT WITH THIS:

// 4) Background processing: Guests get NONE, Verified users get FULL functionality
if (!s.isGuest) {
  console.log("🔥 VERIFIED USER DETECTED - Starting background processing");
  console.log("🔑 OpenAI key available:", !!process.env.OPENAI_API_KEY);
  
  await updateLiveNotesUltraCheap(s);  // ✅ CORRECT function name
  
  // topic mentions - verified users only
  trackMessageTopics(s, message);
  
  // Snapshot every 5 messages for verified users
  const userTurns = userTurnCount(s.turns);
  console.log(`📊 User message count: ${userTurns} (snapshot triggers at 5, 10, 15...)`);
  
  if (userTurns > 0 && userTurns % 5 === 0) {
    console.log(`📸 SNAPSHOT TRIGGER! Creating snapshot for message ${userTurns}`);
    await consolidateSnapshotUltraCheap(s);  // ✅ CORRECT function name
  }
  
  console.log(`📋 Session state: ${s.snapshots?.length || 0} snapshots, ${s.commands?.length || 0} commands`);
}

// ALSO ADD this debug line at the start of POST function (around line 300):

const body = await req.json().catch(() => ({}));
console.log("🔍 REQUEST RECEIVED:", JSON.stringify(body, null, 2));  // ADD THIS LINE
let message = asText(body?.message ?? "");