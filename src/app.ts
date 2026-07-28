import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';
import pino from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { Request } from 'express';
import { adminRouter } from './routes/admin.routes';
import { authRouter } from './routes/auth.routes';
import { bookingsRouter } from './routes/bookings.routes';
import { hostRouter } from './routes/host.routes';
import { propertiesRouter } from './routes/properties.routes';
import { unitsRouter } from './routes/units.routes';
import { uploadsRouter } from './routes/uploads.routes';
import { webhooksRouter } from './routes/webhooks.routes';
import { errorHandler } from './middleware/errorHandler.middleware';
import { logger } from './utils/logger';
import { swaggerSpec } from './docs/swagger';

export const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }

      if (res.statusCode >= 400) {
        return 'warn';
      }

      return 'info';
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
      err: pino.stdSerializers.err,
    },
  }),
);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use('/auth', authRouter);
app.use('/properties', propertiesRouter);
app.use('/units', unitsRouter);
app.use('/uploads', uploadsRouter);
app.use('/bookings', bookingsRouter);
app.use('/host', hostRouter);
app.use('/webhooks', webhooksRouter);
app.use('/admin', adminRouter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);
