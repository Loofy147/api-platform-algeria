import request from 'supertest';
import express from 'express';
import authRouter from '../src/routes/v1/auth.routes';

// Mock the database module
jest.mock('../src/config/database', () => {
  const queryBuilder = {
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 'mock-org-id', name: 'Test Corp', email: 'test@test.com' }]),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ id: 'mock-user-id', email: 'login@test.com', password: 'hashed_password', organization_id: 'mock-org-id' }),
  };
  const tableSelect = jest.fn(() => queryBuilder);
  (tableSelect as any).transaction = jest.fn().mockImplementation(async (callback) => callback(tableSelect));
  return tableSelect;
});

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_jwt_token'),
}));

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const db = require('../src/config/database');
    const queryBuilder = db();
    queryBuilder.returning
      .mockResolvedValueOnce([{ id: 'mock-org-id', name: 'Test Corp' }])
      .mockResolvedValueOnce([{ id: 'mock-user-id', email: 'test@test.com' }]);
  });

  it('should register a new user and organization', async () => {
    const res = await request(app).post('/auth/register').send({
      organizationName: 'Test Corp',
      email: 'test@test.com',
      password: 'password123',
    });

    expect(res.statusCode).toEqual(201);
    expect(res.body.user).toHaveProperty('email', 'test@test.com');
    expect(res.body.organization).toHaveProperty('name', 'Test Corp');
  });

  it('should log in a user and return a token', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'login@test.com',
      password: 'password123',
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token', 'mock_jwt_token');
    expect(res.body.user).toHaveProperty('email', 'login@test.com');
  });
});
