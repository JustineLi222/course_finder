import express from 'express';
import { processData } from './processData.mjs';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Middleware to parse JSON bodies
app.use(express.json());



// Welcome route
app.get('/', (req, res) => {
  res.send('Welcome to the Express API!');
});

// API endpoint to get items
app.get('/api/courses/', processData);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
