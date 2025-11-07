import { Hono } from 'hono';
import { taskRoute } from './Route/TaskRoute';
import { cors } from 'hono/cors';
import { userRoute } from './Route/UserRoute';
import { authRoute } from './Route/AuthRoute';

// Cloudflare Workers の Env をバインドに指定した Hono アプリを検証
const app = new Hono<{ Bindings: Env }>();
app
	// /api 配下に対して CORS を有効化して origin からのアクセスを許可
	// - CORS は「他オリジン（例: http://localhost:5173）からのブラウザアクセスを許可する仕組み」
	// - ここではフロントエンド開発サーバーからのアクセスを許可している
	.use(
		'/api/*',
		cors({
			origin: ['http://localhost:5173'], // 許可するオリジン（必要に応じて追加）
		})
	)
	// サブルーターをパスにマウント
	// 実際のエンドポイント例:
	// - POST /api/v1/auth/login
	// - GET  /api/v1/tasks
	// - GET  /api/v1/users
	.route('/api/v1/auth', authRoute)
	.route('/api/v1/tasks', taskRoute)
	.route('/api/v1/users', userRoute);

// Cloudflare Worker の fetch ハンドラをエクスポート
// 受け取った request/env/ctx を Hono アプリに渡し、ルーティング→処理→レスポンス生成を行う
export default {
	// Cloudflare Workers のエントリポイント（HTTP リクエストごとに呼ばれる）
	// - request: 入ってきた HTTP リクエスト
	// - env: wrangler で定義したバインディング（DB 接続情報・KV・Secrets など）
	// - ctx: 後処理用のコンテキスト（ctx.waitUntil(...) でバックグラウンド実行が可能）
	async fetch(request, env, ctx): Promise<Response> {
		// 受け取った値を Hono アプリに渡して処理を委譲
		// ここでルーティングやミドルウェアが実行され、最終的な Response が返る
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>; // 型レベルで「Workers の fetch ハンドラ」を満たしていることを保証
