import { CreateSnapshotData } from '../types/snapshot';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-only helper function to save snapshots
export async function saveSnapshot(data: CreateSnapshotData): Promise<boolean> {
  if (!SUPA_URL || !SERVICE_KEY) {
    console.error('Missing Supabase configuration for snapshots');
    return false;
  }

  try {
    const response = await fetch(`${SUPA_URL}/rest/v1/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`Failed to save snapshot: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error saving snapshot:', error);
    return false;
  }
}