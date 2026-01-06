import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { register, login } from '../../services/auth.service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

const registerSchema = z.object({
  organizationName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const { user, organization } = await register(data);
  res.status(201).json({ user, organization });
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  const { token, user } = await login(data);
  res.status(200).json({ token, user });
}));

export default router;
