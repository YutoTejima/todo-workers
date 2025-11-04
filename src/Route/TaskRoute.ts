import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Session } from '@prisma/client';

interface Variables {
	prisma: PrismaClient;
	session?: Session;
}

export const taskRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

taskRoute.use('/*', async (context, next) => {
	// Hyperdrive の接続情報を使用して Prisma を初期化
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

// 認証ミドルウェア
taskRoute.use('/*', async (context, next) => {
	// Authorization: Bearer <accessToken>
	const accessToken = context.req.header('Authorization')?.split(' ').pop();

	if (!accessToken) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	const prisma = context.get('prisma');
	const session = await prisma.session.findUnique({
		where: { id: accessToken },
	});

	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	context.set('session', session);

	await next();
});

taskRoute.get('', async (context) => {
	const prisma = context.get('prisma');

	const tasks = await prisma.task.findMany({
		include: {
			taskTags: {
				include: {
					tag: true,
				},
			},
		},
	});

	return context.json(tasks);
});

taskRoute.get('/:id', async (context) => {
	const id = context.req.param('id');

	const prisma = context.get('prisma');

	const task = await prisma.task.findUnique({
		where: {
			id: Number(id),
		},
		include: {
			taskTags: {
				include: {
					tag: true,
				},
			},
		},
	});

	return context.json(task);
});

taskRoute.post(
	'',
	zValidator(
		'json',
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			tags: z.array(z.string().min(1)).optional(),
			expiresAt: z.coerce.date().optional(),
			completedAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		const body = await context.req.valid('json');

		const prisma = context.get('prisma');

		// タスクをリレーション関係のデータと一度に作成
		const task = await prisma.task.create({
			data: {
				userId: 1,
				title: body.title,
				description: body.description,
				status: 'pending',
				priority: body.priority,
				expiresAt: body.expiresAt,

				// タグをリレーション関係のデータと一度に作成
				taskTags: {
					create: body.tags?.map((tagName) => ({
						tag: {
							connectOrCreate: {
								where: {
									userId_name: {
										userId: 1,
										name: tagName,
									},
								},
								create: {
									userId: 1,
									name: tagName,
									color: '000000',
								},
							},
						},
					})),
				},
			},

			// リレーション関係のデータも取得
			include: {
				taskTags: {
					include: {
						tag: true,
					},
				},
			},
		});

		return context.json(task);
	}
);

taskRoute.patch(
	'/:id',
	zValidator(
		'json',
		z.object({
			title: z.string().min(1).optional(),
			description: z.string().optional(),
			status: z.enum(['pending', 'inProgress', 'completed', 'cancelled']).optional(),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			tags: z.array(z.string().min(1)).optional(),
			expiresAt: z.coerce.date().optional(),
			completedAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		const id = context.req.param('id');
		const body = await context.req.json();

		const prisma = context.get('prisma');

		const existingTask = await prisma.task.findUnique({
			where: {
				id: Number(id),
			},
		});

		if (!existingTask) {
			return context.json({ error: 'Task not found' }, 404);
		}

		const task = await prisma.task.update({
			where: { id: Number(id) },
			data: {
				title: body.title,
				description: body.description,
				status: body.status,
				priority: body.priority,
				expiresAt: body.expiresAt,

				// 既存のタグを全て削除してから新しいタグを設定
				taskTags: (() => {
					if (!body.tags) {
						return undefined;
					}

					return {
						deleteMany: {},
						create: body.tags?.map((tagName: String) => ({
							tag: {
								connectOrCreate: {
									where: {
										userId_name: {
											userId: 1,
											name: tagName,
										},
									},
									create: {
										userId: 1,
										name: tagName,
										color: '000000',
									},
								},
							},
						})),
					};
				})(),
			},

			// リレーション関係のデータも取得
			include: {
				taskTags: {
					include: {
						tag: true,
					},
				},
			},
		});

		return context.json(task);
	}
);

taskRoute.delete('/:id', async (context) => {
	const id = context.req.param('id');

	const prisma = context.get('prisma');

	const task = await prisma.task.findUnique({
		where: {
			id: Number(id),
		},
	});

	if (!task) {
		return context.json({ error: 'Task not found' }, 404);
	}

	await prisma.task.delete({
		where: {
			id: Number(id),
		},
	});

	return context.json({ message: `タスクid:(${id})を削除しました` });
});
