import { handler } from './build/handler.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
	console.log(`[Socket.IO Production] Client connected: ${socket.id}`);
	
	socket.on('disconnect', () => {
		console.log(`[Socket.IO Production] Client disconnected: ${socket.id}`);
	});
});

// Provide io instance globally for the API routes
globalThis.io = io;

app.use(handler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Listening on host:http://localhost:${PORT}`);
});
