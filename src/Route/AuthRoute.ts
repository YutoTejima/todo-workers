import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import z, { email } from 'zod';
import { stretchHash } from '../hash';
import { Variables } from '..';

// Hono のコンテキストで使用する変数の型定義
// - context.set('prisma', ...) / context.get('prisma') で受け渡すキーと型を定義
// - これにより context.get('prisma') の戻り値が PrismaClient 型として保証される

// 認証系 API をまとめるためのサブルーター
// - Bindings: Env は Cloudflare Workers の環境変数・バインディングの型
// - Variables は上で定義した context.set/get 用の型（今回 prisma を共有）
export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

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

		// 1秒待つ
		// await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 1000)));

		// だいたい1秒待つ
		const randomNumber = crypto.getRandomValues(new Uint32Array(1))[0];
		await new Promise((resolve) => setTimeout(resolve, Math.floor(randomNumber / 4_000_000)));

		// メールアドレスとパスワードの一致でユーザーを検索
		const user = await prisma.user.findUnique({
			where: {
				email: body.email,
			},
		});

		// ユーザーが存在しない場合は401エラーを返却
		if (!user) {
			return context.json({ error: 'Invalid email or password' }, 401);
		}

		// パスワードをハッシュとソルトに分解
		const [hashedPassword, salt] = user.password.split('.');
		const hashedInputPassword = await stretchHash(body.password + '.' + salt, 100);

		// ハッシュ化したパスワードが一致しない場合はエラーを返却
		if (hashedPassword !== hashedInputPassword) {
			return context.json({ error: 'Invalid email or password' });
		}

		// 24 時間有効のセッションを作成
		const session = await prisma.session.create({
			data: {
				userId: user.id,
				// expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
				expiresAt: new Date(Date.now() + 10 * 1000), // 10 seconds
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

// 認可されているユーザーの情報を取得する API
authRoute.get('/me', async (context) => {
	// セッションを取得
	const session = context.get('session');

	// セッションがなければ 401
	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	// ｐrisma を取得
	const prisma = context.get('prisma');

	// ユーザーを取得
	const user = await prisma.user.findUnique({
		where: {
			id: session.userId,
		},
	});

	// ユーザーがなければ 401
	if (!user) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	return context.json({
		id: user.id,
		email: user.email,
		createdAt: user.createdAt,
	});
});
