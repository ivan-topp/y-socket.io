import http from 'http';
import express from 'express';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { YSocketIO } from '../y-socket-io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const PORT = 3001;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (_, res) => {
    res.send({ok: true});
    // res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Create the YSocketIO instance
// NOTE: This uses the socket namespaces that match the regular expression /^\/yjs\|.*$/, make sure that when using namespaces
//       for other logic, these do not match the regular expression, this could cause unwanted problems.
// TIP: You can export a new instance from another file to manage as singleton and access documents from all app.
const ysocketio = new YSocketIO(io, {
    // authenticate: (auth) => auth.token === 'valid-token',
    // levelPersistenceDir: './storage-location',
});
// Execute initialize method
ysocketio.initialize();

// Handling another socket namespace
io.on('connection', (socket: Socket) => {
    console.log(`[connection] Connected with user: ${socket.id}`);

    // You can add another socket logic here...
    socket.on('disconnect', () => {
        console.log(`[disconnect] Disconnected with user: ${socket.id}`);
    });
});

// Http server listen
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));