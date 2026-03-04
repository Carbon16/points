import { Server } from 'socket.io';

export const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: any) {
		if (!server.httpServer) return;

		const io = new Server(server.httpServer);
		
		io.on('connection', (socket) => {
			console.log(`[Socket.IO Plugin] Client connected: ${socket.id}`);
			
			socket.on('disconnect', () => {
				console.log(`[Socket.IO Plugin] Client disconnected: ${socket.id}`);
			});
		});

		//@ts-ignore
		globalThis.io = io;
	}
};
