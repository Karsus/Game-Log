import client from './Client'

export async function healthCheck() {
  const { data } = await client.get('/health')
  return data
}
