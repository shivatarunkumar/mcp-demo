const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authFetch(path: string, options: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({ detail: res.statusText }));
  if (!res.ok) throw new Error(data.detail || `Request failed: ${res.status}`);
  return data;
}

export async function registerUser(email: string, password: string) {
  return authFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginUser(email: string, password: string) {
  return authFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getPendingUsers(token: string) {
  return authFetch('/admin/users/pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function approveUser(token: string, userId: string) {
  return authFetch(`/admin/users/${userId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function rejectUser(token: string, userId: string) {
  return authFetch(`/admin/users/${userId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatPayload {
  messages: { role: string; content: string }[];
}

export async function sendChat(messages: Message[]): Promise<string> {
  // Build a single prompt from the conversation history
  const prompt = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n') + '\nAssistant:';

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, stream: false }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }

  const data = await res.json();
  return data.response ?? JSON.stringify(data);
}
