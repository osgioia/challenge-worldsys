import { startWatcher } from '@infrastructure/watcher';
import express from 'express';
import routes from '@interfaces/routes';
import { connectDB } from '@infrastructure/db';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '@infrastructure/swagger';

const app = express();
const PORT = process.env.PORT || 3001;

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/', routes);

connectDB().then(() => {
    startWatcher();
  app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
  });
});