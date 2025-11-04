import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

interface Variables {
	prisma: PrismaClient;
}

export const userRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

userRoute.use('/*', async (context, next) => {
	// Hyperdrive の接続情報を使用して Prisma を初期化
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

userRoute.post(
	'/',
	zValidator(
		'json',
		z.object({
			email: z.string().min(1).max(255),
			password: z.string().min(8).max(255),
		})
	),
	async (context) => {
		const body = await context.req.valid('json');

		const prisma = context.get('prisma');

		// ユーザーを作成
		const user = await prisma.user.create({
			data: {
				email: body.email,
				password: body.password,
			},
		});

		// ユーザーを HTTPレスポンスで返却
		return context.json(user);
	}
);
