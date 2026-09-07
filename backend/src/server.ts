import { createApp } from './app';
import { env } from './utils/env';

const app = createApp();

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
