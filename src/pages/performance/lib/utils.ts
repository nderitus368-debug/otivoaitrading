import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';


/**
 * Merges class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the active Deriv API token
 */
export function getActiveToken() {
  const accounts = JSON.parse(localStorage.getItem('accountsList') || '{}');
  const activeLoginId = localStorage.getItem('active_loginid');
  return accounts[activeLoginId || '']?.token || '';
}

/**
 * Returns the user's identity (name or email)
 */
export function getUserIdentity() {
  return localStorage.getItem('user_first_name') || 'Trader';
}

/**
 * Returns a greeting based on the current time
 */
export function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Returns the active account type (Demo or Real)
 */
export function getActiveAccountType() {
  const activeLoginId = localStorage.getItem('active_loginid') || '';
  return activeLoginId.startsWith('VRTC') ? 'Demo' : 'Real';
}
