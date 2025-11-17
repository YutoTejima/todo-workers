// (async () => {
// 	const message = 'Hello';
// 	const encodeMessage = new TextEncoder().encode(message);
// 	const hash = await crypto.subtle.digest('sha-256', encodeMessage).then((buffer) => {
// 		return Array.from(new Uint8Array(buffer))
// 			.map((b) => b.toString(16).padStart(2, '0'))
// 			.join('');
// 	});
// 	console.log(hash);
// })();

// hash とは？
/*
	1.逆算が困難であること
	2.同じ入力に対して同じ出力が得られること
	3.少しでも入力がかわれば出力が大きく変わること
	4.桁数が一定であること
*/

export async function hash(message: string): Promise<string> {
	// ハッシュ計算するために数値に変換する
	const encodeMessage = new TextEncoder().encode(message);
	const digest = await crypto.subtle.digest('sha-256', encodeMessage);
	const hash = Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return hash;
}

// 伸長攻撃対策のためにハッシュを複数回計算する
export async function stretchHash(message: string, iterations: number): Promise<string> {
	let hashedMessage = message;

	for (let i = 0; i < iterations; i++) {
		hashedMessage = await hash(hashedMessage);
	}

	return hashedMessage;
}
