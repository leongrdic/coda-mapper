import { parseJson } from "./utils";

export class CodaMapper {
  constructor(private readonly apiKey: string) {}
  private readonly fetch = (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    return fetch(url, { ...options, headers });
  };
  private readonly api = {
    get: <T>(
      url: string,
      params: Record<string, string> = {},
      options: RequestInit = {}
    ) =>
      parseJson<T>(
        this.fetch(`${url}?${new URLSearchParams(params).toString()}`, {
          method: "GET",
          ...options,
        })
      ),
    post: <T>(
      url: string,
      body: Record<string, unknown> = {},
      options: RequestInit = {}
    ) =>
      parseJson<T>(
        this.fetch(url, {
          method: "POST",
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
          },
          ...options,
        })
      ),
  };
}
