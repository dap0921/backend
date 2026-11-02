import net from 'net'
import 'dotenv/config'

const LISTEN_PORT = 1080
const UPSTREAM_PROXY_HOST = '192.168.0.2'   // your network's proxy IP
const UPSTREAM_PROXY_PORT = 808             // your network's proxy port

function connectThroughHttpProxy(targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(UPSTREAM_PROXY_PORT, UPSTREAM_PROXY_HOST, () => {
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n\r\n`
      )
    })
    socket.once('data', (chunk) => {
      if (/^HTTP\/1\.[01] 200/.test(chunk.toString())) resolve(socket)
      else reject(new Error('Upstream proxy refused CONNECT'))
    })
    socket.once('error', reject)
  })
}

// Minimal SOCKS5 server (RFC 1928): no-auth only, CONNECT command only.
// Every accepted connection is tunnelled through connectThroughHttpProxy()
// above, then the two sockets are piped together transparently.
function parseConnectRequest(buf) {
  // [VER, CMD, RSV, ATYP, DST.ADDR..., DST.PORT(2)]
  const atyp = buf[3]
  let host, offset

  if (atyp === 0x01) { // IPv4
    host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`
    offset = 8
  } else if (atyp === 0x03) { // domain name
    const len = buf[4]
    host = buf.subarray(5, 5 + len).toString('ascii')
    offset = 5 + len
  } else if (atyp === 0x04) { // IPv6
    const parts = []
    for (let i = 0; i < 8; i++) parts.push(buf.readUInt16BE(4 + i * 2).toString(16))
    host = parts.join(':')
    offset = 20
  } else {
    return null
  }

  const port = buf.readUInt16BE(offset)
  return { host, port }
}

const server = net.createServer((client) => {
  client.once('data', (greeting) => {
    if (greeting[0] !== 0x05) return client.destroy()
    // No-auth accepted
    client.write(Buffer.from([0x05, 0x00]))

    client.once('data', async (request) => {
      if (request[0] !== 0x05 || request[1] !== 0x01) {
        // Only CONNECT (0x01) is supported
        client.end(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        return
      }

      const target = parseConnectRequest(request)
      if (!target) {
        client.end(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        return
      }

      try {
        const upstream = await connectThroughHttpProxy(target.host, target.port)
        client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        upstream.pipe(client)
        client.pipe(upstream)
        upstream.on('error', () => client.destroy())
        client.on('error', () => upstream.destroy())
      } catch (err) {
        console.error(`[proxy-bridge] failed to reach ${target.host}:${target.port} - ${err.message}`)
        client.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      }
    })
  })

  client.on('error', () => client.destroy())
})

server.listen(LISTEN_PORT, () => {
  console.log(`[proxy-bridge] SOCKS5 listening on 127.0.0.1:${LISTEN_PORT}, forwarding via ${UPSTREAM_PROXY_HOST}:${UPSTREAM_PROXY_PORT}`)
})
