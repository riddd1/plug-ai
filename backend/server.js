const express = require('express');
const path = require('path');

const aiRoute = require('./routes/ai');
const videoRoute = require('./routes/video');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '150mb' }));

// API routes
app.use('/ai', aiRoute);
app.use('/api', videoRoute);

// Serve static frontend files
const staticDir = path.join(__dirname, '../');
app.use(express.static(staticDir, { index: false }));

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
app.get('/scriptmaker', (req, res) => res.sendFile(path.join(staticDir, 'scriptmaker.html')));

app.listen(PORT, () => console.log(`DM Studio running on port ${PORT}`));
