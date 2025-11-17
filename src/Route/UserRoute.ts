import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';
import { stretchHash } from '../hash';

// Hono のコンテキストで使用する変数の型定義
// - context.set('prisma', ...) / context.get('prisma') で受け渡すための型を定義
interface Variables {
	prisma: PrismaClient;
}

// ユーザー作成 API をまとめるためのサブルーター

export const userRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// userRoute で共通して実行するミドルウェア
userRoute.use('/*', async (context, next) => {
	// Hyperdrive の接続情報を使用して Prisma を初期化
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	// 初期化した Prisma を context に格納して使えるようにする
	context.set('prisma', prisma);

	await next();
});

// ユーザー登録API
userRoute.post(
	'/',
	// 入力チェック（email と password の形式/長さを検証）
	zValidator(
		'json',
		z.object({
			email: z.string().min(1).max(255),
			password: z.string().min(8).max(255),
		})
	),
	async (context) => {
		// リクエストボディを検証
		const body = await context.req.valid('json');

		// Prisma クライアントを取得
		const prisma = context.get('prisma');

		// 同じアドレスのユーザーが既に存在していないかの確認
		const existingUser = await prisma.user.findUnique({
			where: {
				email: body.email,
			},
		});

		// 存在していたらメッセージを出す
		if (existingUser) {
			return context.json({ error: 'User already exists' }, 400);
		}

		// ランダムなソルトを生成
		const salt = crypto.randomUUID();
		const hashedPassword = await stretchHash(body.password + '.' + salt, 100);

		// ユーザーを作成（DB のユニーク制約に違反した場合はエラーになる）
		const user = await prisma.user.create({
			data: {
				email: body.email,
				password: hashedPassword + '.' + salt,
			},
		});

		// ユーザーを HTTPレスポンスで返却
		return context.json(user);
	}
);
