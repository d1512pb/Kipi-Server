export interface Parent {
  id: string;
  email: string;
  name?: string;
  safe_days_streak?: number;
  completed_missions?: string[];
  created_at?: string;
}
