/**
 * Small fetch wrapper for the Claro API.
 *  - sends the session cookie (same-origin)
 *  - parses JSON and throws an ApiError with the server message on failure
 *  - broadcasts "claro:unauthorized" when the session is missing/expired so the app can show the login screen
 */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, formData } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(path, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('claro:unauthorized'));
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Erreur ${res.status}`, data);
  }
  return data;
}
