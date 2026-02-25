import { queryClient } from "./queryClient";
import type { AuthUser } from "@shared/schema";

export type LoginInput = {
  email: string;
  password: string;
};

export async function login(credentials: LoginInput): Promise<AuthUser> {
  const response = await fetch("/api/auth/callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Login failed");
  }

  const data = await response.json();
  return data.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    return null;
  }
}

export function redirectToLogin(): void {
  window.location.href = "/login";
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  queryClient.clear();
}
