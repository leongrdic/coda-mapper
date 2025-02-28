export const parseJson = async <T>(
  fetchPromise: Promise<Response>
): Promise<T> => {
  const response = await fetchPromise;
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  try {
    return response.json();
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}`);
  }
};
