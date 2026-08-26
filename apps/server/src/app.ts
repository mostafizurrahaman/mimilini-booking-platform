import express, { type Request, type Response } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import configs from './app/configs'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import { notFound } from './app/middlewares/not-found'
import globalErrorHandler from './app/middlewares/global-error-handler'
import { allRoutes } from '@app/routes'
import { logger } from '@app/libs/logger'
import dns from 'node:dns'

dns.setServers(["1.1.1.1"])

const app: express.Application = express()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 munite
  max: 500, // limit each IP to 100 requests per windowMs
  message: 'Too many accounts created from this IP, please try again after a minute',
})

const stream = {
  write: (message: string) => logger.http(message),
}

// application level middlewars:
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream,
  })
)
app.use(helmet())
app.use(express.json())
app.use(cookieParser())
app.use(
  cors({
    origin: configs.corsOrigins?.split(','), // split all the origins
    credentials: true,
  })
)
app.use(limiter)

// root endpoint:
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: `Your server is running now`,
  })
})

// other api endpoints with versions :
app.use('/api/v1', allRoutes)

// not found middleware:
app.use(notFound)

// global error handler
app.use(globalErrorHandler)

export default app
