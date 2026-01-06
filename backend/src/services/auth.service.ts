import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { z } from 'zod';

const registerSchema = z.object({
  organizationName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const register = async (data: z.infer<typeof registerSchema>) => {
  const { organizationName, email, password } = registerSchema.parse(data);

  const hashedPassword = await bcrypt.hash(password, 10);
  const organizationId = uuidv4();
  const userId = uuidv4();

  return db.transaction(async (trx) => {
    const [organization] = await trx('organizations').insert({ id: organizationId, name: organizationName }).returning('*');
    const [user] = await trx('users').insert({ id: userId, email, password: hashedPassword, organization_id: organization.id }).returning('*');
    return { user, organization };
  });
};

export const login = async (data: z.infer<typeof loginSchema>) => {
  const { email, password } = loginSchema.parse(data);

  const user = await db('users').where({ email }).first();

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  const token = jwt.sign({ userId: user.id, organizationId: user.organization_id }, process.env.JWT_SECRET || 'your_jwt_secret', {
    expiresIn: '1h',
  });

  return { token, user };
};
