export type AlertLevel = "high" | "medium" | "info";

export type AlertItem = {
  id: string | number;
  level: AlertLevel;
  category: string;
  platform: string;
  timestamp: string;
  summary: string;
  intervention: string;
  read: boolean;
  patternCount: number;
  riskScore: number;
};

export type ChildProfile = {
  id: string | number;
  name: string;
  age: number;
  initial: string;
  grade?: string;
  school?: string;
  color: string; // "hsl(...)"
  device_model?: string;
};

