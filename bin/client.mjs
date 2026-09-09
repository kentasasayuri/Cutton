export const baseUrl = process.env.CUTTON_URL || process.env.YACHICUT_URL || 'http://127.0.0.1:4318';
export async function api(route,body) {
  const response = await fetch(new URL(route,baseUrl),body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();
  if(!response.ok)throw new Error(value.error||`HTTP ${response.status}`);
  return value;
}
