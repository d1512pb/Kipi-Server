import type { Parent } from '../entities/parent.js';

export interface AuthPort {
  getCurrentParent(): Promise<Parent | null>;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  // For magic links or OTP verification depending on the implementation
  verifyOtp?(email: string, otp: string): Promise<boolean>;
}
