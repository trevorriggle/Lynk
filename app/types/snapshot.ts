export interface Snapshot {
  id: string;
  user_id: string;
  session_id: string;
  turn_index: number;
  summary_text: string;
  message_ids: string[];
  model: string;
  created_at: string;
}

export interface CreateSnapshotData {
  user_id: string;
  session_id: string;
  turn_index: number;
  summary_text: string;
  message_ids: string[];
  model: string;
}