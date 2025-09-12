import { TaskEntity } from './Entity/TaskEntity';
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/tasks', async (context) => {
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

app.get('api/tasks/:id', async (context) => {
	const id = context.req.param('id');
	const task = await context.env.KV_TASKS.get(id, 'json');

	if (!task) {
		return context.json({ message: 'タスクが見つかりません' }, 404);
	}
	console.log(task);
	return context.json(task);
});

app.post('/api/tasks', async (context) => {
	const id = crypto.randomUUID();
	const body = await context.req.json();

	const task: TaskEntity = { id, ...body };

	console.log(task);
	await context.env.KV_TASKS.put(id, JSON.stringify(task));

	return context.json(task);
});

app.put('/api/tasks/:id', async (context) => {
	const id = context.req.param('id');
	const body = await context.req.json();
	const task = { id, ...body };

	await context.env.KV_TASKS.put(id, JSON.stringify(task));

	return context.json(task);
});

app.delete('/api/tasks/:id', async (context) => {
	const id = context.req.param('id');
	await context.env.KV_TASKS.delete(id);

	return context.json({ message: `タスクid:(${id})を削除しました` });
});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
