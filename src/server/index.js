import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BDIX IPTV server running on http://localhost:${PORT}`);
});
