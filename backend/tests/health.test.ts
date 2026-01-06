import request from 'supertest';
import express from 'express';
import healthRouter from '../src/routes/v1/health.routes';

jest.mock('../src/config/database', () => ({
  checkDatabaseConnection: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../src/config/cache', () => ({
  checkRedisConnection: jest.fn(() => Promise.resolve(true)),
}));

const app = express();
app.use('/health', healthRouter);

describe('Health Check Route', () => {
  it('should return 200 OK for GET /health/live', async () => {
    const res = await request(app).get('/health/live');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'alive');
  });

  it('should return 200 OK for GET /health/ready', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'ready');
  });
});
