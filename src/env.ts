export {};

declare global {
	interface Env {
		KV_TASKS: KVNamespace;
	}
}
