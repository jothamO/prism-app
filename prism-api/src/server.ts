// Initialize Sentry first (must be before other imports)
import { initSentry } from './config/sentry.config';
initSentry();

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import apiRoutes from './routes/api.routes';
import { scheduleMonthlyFilings } from './workers/auto-filing.worker';
import { scheduleNotifications } from './workers/notifications.worker';
import { websocketService } from './services/websocket.service';
import { startTelegramBot } from './bot';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server for WebSocket
const httpServer = createServer(app);

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));
app.use(express.json());

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.send('PRISM API is running');
});

// Start the server
httpServer.listen(port, async () => {
    console.log(`Server is running on port ${port}`);

    // Initialize WebSocket
    websocketService.init(httpServer);

    // Initialize Telegram Bot
    startTelegramBot();

    // Initialize BullMQ schedulers
    await scheduleMonthlyFilings();
    await scheduleNotifications();
});
