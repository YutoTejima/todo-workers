import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';
import { Variables } from '..';

// タスク系 API をまとめるサブルーター
export const taskRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// タスク一覧取得 API
// - タスク本体に加えて、多対多の中間テーブル taskTags と、その先の tag も同時に取得
taskRoute.get('', async (context) => {
	// Prisma クライアントを取得
	const prisma = context.get('prisma');

	// session を取得
	const session = context.get('session');

	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	// task を全て取得しつつ、中間テーブルから tag の情報も取得
	// 条件に一致する task を取得（今回は条件なし）
	const tasks = await prisma.task.findMany({
		// ログインしているユーザーが所有するタスクのみ表示
		where: {
			userId: session?.userId,
		},
		// 中間テーブルから tag の情報を取得
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

// id が一致するタスク取得 API
taskRoute.get('/:id', async (context) => {
	// パラメーターからタスクの id を取得
	const id = context.req.param('id');

	// Prisma クライアントを取得
	const prisma = context.get('prisma');

	// id が一致するタスクを 1 件取得
	const task = await prisma.task.findUnique({
		where: {
			id: Number(id),
		},
		// ついでに中間テーブルから tag の情報も取得
		include: {
			taskTags: {
				include: {
					tag: true,
				},
			},
		},
	});

	// タスクがなければ 404
	if (!task) {
		return context.json({ error: 'Task not found' }, 404);
	}

	// session を取得
	const session = context.get('session');

	// 閲覧しているタスクの所有者と現在ログインしているユーザーのIDが一致していなければ 403 エラー
	if (session?.userId !== task.userId) {
		return context.json({ error: 'Forbidden' }, 403);
	}

	return context.json(task);
});

// タスク作成 API
taskRoute.post(
	'',
	// 入力を Zod で厳密に定義
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
		// リクエストボディを取得
		const body = await context.req.valid('json');

		// Prisma クライアントを取得
		const prisma = context.get('prisma');
		const session = context.get('session');

		if (!session) {
			return context.json({ error: 'Unauthorized' });
		}

		// タスクをリレーション関係のデータと共に作成
		const task = await prisma.task.create({
			data: {
				userId: session?.userId,
				title: body.title,
				description: body.description,
				status: 'pending',
				priority: body.priority,
				expiresAt: body.expiresAt,

				// タグをリレーション関係のデータと共に一度に作成
				taskTags: {
					// 受け取った tagName ごとに、既存タグがあれば接続・無ければ作成
					create: body.tags?.map((tagName) => ({
						tag: {
							connectOrCreate: {
								where: {
									userId_name: {
										// userId と name の複合ユニークキー（同一ユーザーで同名タグは1つ）
										userId: session.userId,
										name: tagName,
									},
								},
								create: {
									userId: session.userId,
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

// タスク変更 API
// - 部分更新（渡されたフィールドだけ更新）
// - タグは「全削除→新規作成」で完全置き換え
taskRoute.patch(
	'/:id',
	// 入力を Zod で厳密に定義
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
		// パラメーターから id を取得
		const id = context.req.param('id');
		// リクエストボディを検証
		const body = await context.req.json();
		// Prisma クライアントを取得
		const prisma = context.get('prisma');

		// 既存タスクの存在をチェック
		const existingTask = await prisma.task.findUnique({
			where: {
				id: Number(id),
			},
		});

		// id に一致するタスクが無ければ 404 エラー
		if (!existingTask) {
			return context.json({ error: 'Task not found' }, 404);
		}

		// session を取得
		const session = context.get('session');

		// 変更しているタスクの所有者と現在ログインしているユーザーのIDが一致していなければ 403 エラー
		if (session?.userId !== existingTask.userId) {
			return context.json({ error: 'Forbidden' }, 403);
		}

		// id に一致するタスクを更新
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
					// tags が未指定なら触らない
					if (!body.tags) {
						return undefined;
					}

					return {
						// このタスクに紐づく中間テーブルを全削除
						deleteMany: {},
						// 新しいタグセットを作成
						create: body.tags?.map((tagName: String) => ({
							tag: {
								// tagName がすでにあれば接続、無ければ tag を新しく作成
								connectOrCreate: {
									// ユーザーごとの 同名タグが存在するかを複合ユニークキーで判定
									where: {
										userId_name: {
											userId: session.userId,
											name: tagName,
										},
									},
									// 無ければ tag を新しく作成
									create: {
										userId: session.userId,
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

// タスク削除 API
taskRoute.delete('/:id', async (context) => {
	// パラメーターから id を取得
	const id = context.req.param('id');

	// Prisma クライアントを取得
	const prisma = context.get('prisma');

	// id が一致するタスクを確認
	const task = await prisma.task.findUnique({
		where: {
			id: Number(id),
		},
	});

	// id が一致するタスクが無ければ 404 エラー
	if (!task) {
		return context.json({ error: 'Task not found' }, 404);
	}

	// session を取得
	const session = context.get('session');

	// 消そうとしているタスクの所有者と現在ログインしているユーザーのIDが一致していなければ 403 エラー
	if (session?.userId !== task.userId) {
		return context.json({ error: 'Forbidden' }, 403);
	}

	// id が一致するタスクを削除
	await prisma.task.delete({
		where: {
			id: Number(id),
		},
	});

	// 削除成功のメッセージを出す
	return context.json({ message: `タスクid:(${id})を削除しました` });
});
