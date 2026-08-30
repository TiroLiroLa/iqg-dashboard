import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  process.stdout.write(`IQG API disponível em http://localhost:${port}\n`);
});
