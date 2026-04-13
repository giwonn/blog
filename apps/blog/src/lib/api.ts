const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";

export async function apiClient<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("API 요청에 실패했습니다");
  }
  const json = await res.json();
  return json.data;
}
