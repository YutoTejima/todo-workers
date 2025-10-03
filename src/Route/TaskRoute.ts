import { Hono } from 'hono';
import { TaskEntity } from '../Entity/TaskEntity';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';

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
			status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			tags: z.array(z.string().min(1)).optional(),
			expiresAt: z.coerce.date().optional(),
			completedAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		const id = crypto.randomUUID();
		const body = await context.req.json();

		const task: TaskEntity = { id, ...body };

		console.log(task);
		await context.env.KV_TASKS.put(id, JSON.stringify(task));

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
