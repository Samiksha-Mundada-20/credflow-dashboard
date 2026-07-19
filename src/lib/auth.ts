// src/lib/auth.ts
// All authentication logic lives here.
// Components call these functions — they never call supabase.auth directly.

import { supabase } from './supabase'

export type AuthResult =
  | { success: true; userId: string; email: string }
  | { success: false; error: string }

export type SimpleResult =
  | { success: true }
  | { success: false; error: string }

// Creates a new account. Email confirmation is OFF in Supabase dashboard —
// user is logged in immediately. The on_auth_user_created trigger
// auto-creates user_settings + extension_health rows.
export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data.user) {
    return { success: false, error: 'Sign up failed. Please try again.' }
  }

  return {
    success: true,
    userId: data.user.id,
    email: data.user.email ?? email,
  }
}

// Signs in with email + password.
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

// Signs the user out. Clears the Supabase session from localStorage.
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Returns the current session, or null if the user is not logged in.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()

  if (error || !data.session) {
    return null
  }

  return data.session
}

// Returns the currently logged-in user, or null.
export async function getUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return data.user
}

// Sends a password-reset email via Supabase. The link in that email
// redirects to redirectTo, which must be added to Supabase's Auth →
// URL Configuration → Redirect URLs allow-list or the redirect is
// rejected. Supabase returns success even for unregistered emails
// (avoids leaking which emails have accounts) — callers should show a
// generic "if an account exists" message rather than confirming the
// email was found.
export async function requestPasswordReset(email: string): Promise<SimpleResult> {
  const redirectTo = `${window.location.origin}/reset-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Sets a new password for the user. Only works when called from the
// /reset-password page after following the emailed link — that link
// puts a temporary recovery session in the URL, which the Supabase
// client picks up automatically (detectSessionInUrl is on by default),
// and this call operates against that session.
export async function updatePassword(newPassword: string): Promise<SimpleResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
