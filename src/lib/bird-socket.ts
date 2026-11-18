import { io, type Socket } from 'socket.io-client'
import { SERVER_URL, type BirdMessage } from './bird-api'

export type BirdSocket = Socket

export function createBirdSocket(token: string) {
  return io(SERVER_URL, { auth: { token }, reconnection: true, timeout: 10000 })
}

export function sendBirdMessage(socket: Socket, payload: { to: number; text: string }, onResult: (result: { message?: BirdMessage; error?: string }) => void) {
  socket.timeout(20000).emit('message:send', payload, (error: Error | null, response: { message?: BirdMessage; error?: string }) => {
    if (error) return onResult({ error: 'انتهت مهلة إرسال الرسالة.' })
    onResult(response || { error: 'لم تصل استجابة الخادم.' })
  })
}
