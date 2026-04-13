const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8081';

export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'API 요청에 실패했습니다' }));
    throw new Error(error.message);
  }

  const json = await res.json();
  return json.data;
}
