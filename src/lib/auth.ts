// src/lib/auth.ts
// All authentication logic lives here.
// Components call these functions — they never call supabase.auth directly.
// This keeps auth logic in one place and easy to change.

import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthResult =
  | { success: true; userId: string; email: string }
  | { success: false; error: string }

// ─── Sign Up ──────────────────────────────────────────────────────────────────

// Creates a new account.
// Email confirmation is OFF in Supabase dashboard — user is logged in immediately.
// The on_auth_user_created trigger auto-creates user_settings + extension_health rows.
export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { success: false, error: error.message }
  }

  // signUp returns a session immediately because email confirmation is disabled
  if (!data.user) {
    return { success: false, error: 'Sign up failed. Please try again.' }
  }

  return {
    success: true,
    userId: data.user.id,
    email: data.user.email ?? email,
  }
}

// ─── Sign In ──────────────────────────────────────────────────────────────────

// Signs in with email + password.
// Returns the user's ID and email on success.
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data.user) {
    return { success: false, error: 'Sign in failed. Please try again.' }
  }

  return {
    success: true,
    userId: data.user.id,
    email: data.user.email ?? email,
  }
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

// Signs the user out. Clears the Supabase session from localStorage.
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ─── Get Session ──────────────────────────────────────────────────────────────

// Returns the current session, or null if the user is not logged in.
// Call this in protected pages to check if the user is authenticated.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()

  if (error || !data.session) {
    return null
  }

  return data.session
}

// ─── Get User ─────────────────────────────────────────────────────────────────

// Returns the currently logged-in user, or null.
export async function getUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return data.user
}
