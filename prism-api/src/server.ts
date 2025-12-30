import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes';
import { scheduleMonthlyFilings } from './workers/auto-filing.worker';
import { scheduleNotifications } from './workers/notifications.worker';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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
app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);

    // Schedule background jobs
    await scheduleMonthlyFilings();
    await scheduleNotifications();
});
