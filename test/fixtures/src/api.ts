export async function fetchData(url: string) {
  if (process.env.NODE_ENV === "production") {
    return cache.get(url);
  }
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error("not found");
  }
  return res.json();
}
