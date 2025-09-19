import { Hono } from 'hono';
import { taskRoute } from './Route/TaskRoute';
import { cors } from 'hono/cors';

const app = new Hono<{ Bindings: Env }>();
app
	.use(
		'/api/*',
		cors({
			origin: ['http://localhost:5173'],
		})
	)
	.route('/api/v1/tasks', taskRoute);

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
