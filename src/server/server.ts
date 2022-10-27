#!/usr/bin/env node

import http from 'http'
import { Server, Socket } from 'socket.io'
// import { Document } from './document'
import { YSocketIO } from './y-socket-io'

const host = process.env.HOST ?? 'localhost'
const port = parseInt(`${process.env.PORT ?? 1234}`)

// Create the http server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})
// Create an io instance
const io = new Server(server)

// Create the YSocketIO instance
// NOTE: This uses the socket namespaces that match the regular expression /^\/yjs\|.*$/, make sure that when using namespaces
//       for other logic, these do not match the regular expression, this could cause unwanted problems.
// TIP: You can export a new instance from another file to manage as singleton and access documents from all app.
const ysocketio = new YSocketIO(io, {
  // authenticate: (handshake) => handshake.auth.token === 'valid-token',
  // OR
  // authenticate: (handshake) => {
  //   return new Promise<boolean>(resolve => {
  //     setTimeout(() => resolve(handshake.auth.token === 'valid-token'), 2000)
  //   })
  // },

  // levelPersistenceDir: './storage-location',
  // gcEnabled: true,
})

// ysocketio.on('document-loaded', (doc: Document) => console.log(`The document ${doc.name} was loaded`))
// ysocketio.on('document-update', (doc: Document, update: Uint8Array) => console.log(`The document ${doc.name} is updated`))
// ysocketio.on('awareness-update', (doc: Document, update: Uint8Array) => console.log(`The awareness of the document ${doc.name} is updated`))
// ysocketio.on('document-destroy', async (doc: Document) => console.log(`The document ${doc.name} is being destroyed`))
// ysocketio.on('all-document-connections-closed', async (doc: Document) => console.log(`All clients of document ${doc.name} are disconected`))

// Execute initialize method
ysocketio.initialize()

// Handling another socket namespace
io.on('connection', (socket: Socket) => {
  console.log(`[connection] Connected with user: ${socket.id}`)

  // You can add another socket logic here...
  socket.on('disconnect', () => {
    console.log(`[disconnect] Disconnected with user: ${socket.id}`)
  })
})

// Http server listen
server.listen(port, host, undefined, () => console.log(`Server running on port ${port}`))
