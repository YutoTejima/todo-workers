import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

// Hono のコンテキストで使用する変数の型定義
// - context.set('prisma', ...) / context.get('prisma') で受け渡すキーと型を定義
// - これにより context.get('prisma') の戻り値が PrismaClient 型として保証される
interface Variables {
	prisma: PrismaClient;
}

// 認証系 API をまとめるためのサブルーター
// - Bindings: Env は Cloudflare Workers の環境変数・バインディングの型
// - Variables は上で定義した context.set/get 用の型（今回 prisma を共有）
export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// authRoute で共通して実行するミドルウェア
authRoute.use('/*', async (context, next) => {
	// Hyperdrive の接続情報を使用して Prisma を初期化
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	// 初期化した Prisma を context に格納して使えるようにする
	context.set('prisma', prisma);

	await next();
});

// ログイン API
// - 入力（email, password）を Zod で検証（不正なら自動で 400）
// - メールアドレスとパスワードでユーザーを照合（見つからなければ 401）
// - 成功時は 24 時間有効のセッションを作成し、アクセストークンとして session.id を返す
authRoute.post(
	'/login',
	// 入力を Zod で厳密に定義
	zValidator(
		'json',
		z.object({
			email: z.string().max(255),
			password: z.string().max(255),
		})
	),
	async (context) => {
		// リクエストボディを検証
		const body = await context.req.valid('json');

		// Prisma クライアントを取得
		const prisma = context.get('prisma');

		// メールアドレスとパスワードの一致でユーザーを検索
		const user = await prisma.user.findUnique({
			where: {
				email: body.email,
				password: body.password,
			},
		});

		// ユーザーが存在しない場合は401エラーを返却
		if (!user) {
			return context.json({ error: 'Invalid email or password' }, 401);
		}

		// 24 時間有効のセッションを作成
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

// ログアウト API
// - Authorization ヘッダー（例: "Bearer <accessToken>"）からアクセストークンを抽出
// - 対応するセッションがなければ 401、あれば削除して「ログアウト完了」を返す
authRoute.delete('/logout', async (context) => {
	// Authorization ヘッダーからアクセストークンを作成
	const accessToken = context.req.header('Authorization')?.split(' ').pop();

	// アクセストークンが無ければ401エラーを返す
	if (!accessToken) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	// Prisma クライアントを取得
	const prisma = context.get('prisma');

	// アクセストークンに対応するセッションを検索
	const session = await prisma.session.findUnique({
		where: {
			id: accessToken,
		},
	});

	// セッションが無ければ401エラーを返す
	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	// セッションを削除してログアウト
	await prisma.session.delete({
		where: {
			id: accessToken,
		},
	});

	// ログアウト成功のメッセージを返す
	return context.json({ message: 'Logged out succesfully' });
});
