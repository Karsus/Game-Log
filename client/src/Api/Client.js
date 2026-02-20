import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL

function successInterceptor(response) {
  return response
}

function errorInterceptor(error) {
  console.log('ERROR INTERCEPTOR ', error)

  if (!error.response || error.response.status === 503) {
    console.log('SERVER ERROR')
    return Promise.reject({ error: 'Server is not responding' })
  }

  return Promise.reject(error.response.data ? error.response.data : { error: 'There was an error with your request' })
}

let client = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.response.use(successInterceptor, errorInterceptor)

export default client
