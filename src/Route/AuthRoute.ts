import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

interface Variables {
	prisma: PrismaClient;
}

export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoute.use('/*', async (context, next) => {
	// Hyperdrive の接続情報を使用して Prisma を初期化
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

authRoute.post(
	'/login',
	zValidator(
		'json',
		z.object({
			email: z.string().max(255),
			password: z.string().max(255),
		})
	),
	async (context) => {
		const body = await context.req.valid('json');

		const prisma = context.get('prisma');

		// 送られてきた内容と一致するユーザーがデータベース常にあるかどうかで確認
		const user = await prisma.user.findUnique({
			where: {
				email: body.email,
				password: body.password,
			},
		});

		if (!user) {
			return context.json({ error: 'Invalid email or password' }, 401);
		}

		const session = await prisma.session.create({
			data: {
				userId: user.id,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
			},
		});

		// ユーザーを HTTPレスポンスで返却(パスワードは返却しない)
		return context.json({
			id: user.id,
			email: user.email,
			accessToken: session.id,
		});
	}
);

// ログアウト
authRoute.delete('/logout', async (context) => {
	const accessToken = context.req.header('Authorization')?.split(' ').pop();

	if (!accessToken) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	const prisma = context.get('prisma');

	const session = await prisma.session.findUnique({
		where: {
			id: accessToken,
		},
	});

	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	await prisma.session.delete({
		where: {
			id: accessToken,
		},
	});

	return context.json({ message: 'Logged out succesfully' });
});
