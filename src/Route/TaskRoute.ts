import { Hono } from 'hono';
import { TaskEntity } from '../Entity/TaskEntity';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export const taskRoute = new Hono<{ Bindings: Env }>();

taskRoute.get('', async (context) => {
	const list = await context.env.KV_TASKS.list();
	const tasks: TaskEntity[] = [];

	for (const key of list.keys) {
		console.log(key.name);
		const task = await context.env.KV_TASKS.get<TaskEntity>(key.name, 'json');

		if (!task) {
			continue;
		}
		tasks.push(task);
	}
	return context.json(tasks);
});

taskRoute.get('/:id', async (context) => {
	const id = context.req.param('id');
	const task = await context.env.KV_TASKS.get(id, 'json');

	if (!task) {
		return context.json({ message: 'タスクが見つかりません' }, 404);
	}
	console.log(task);
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

		// Hyperdrive の接続情報を使用して Prisma を初期化
		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

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

taskRoute.put(
	'/:id',
	zValidator(
		'json',
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			tags: z.array(z.string().min(1)).optional(),
			expiresAt: z.coerce.date().optional(),
			completedAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		const id = context.req.param('id');
		const body = await context.req.json();
		const task = { id, ...body };

		await context.env.KV_TASKS.put(id, JSON.stringify(task));

		return context.json(task);
	}
);

taskRoute.delete('/:id', async (context) => {
	const id = context.req.param('id');
	await context.env.KV_TASKS.delete(id);

	return context.json({ message: `タスクid:(${id})を削除しました` });
});
