import { Hono } from 'hono';
import { taskRoute } from './Route/TaskRoute';
import { cors } from 'hono/cors';
import { userRoute } from './Route/UserRoute';
import { authRoute } from './Route/AuthRoute';

const app = new Hono<{ Bindings: Env }>();
app
	.use(
		'/api/*',
		cors({
			origin: ['http://localhost:5173'],
		})
	)
	.route('/api/v1/auth', authRoute)
	.route('/api/v1/tasks', taskRoute)
	.route('/api/v1/users', userRoute);

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
