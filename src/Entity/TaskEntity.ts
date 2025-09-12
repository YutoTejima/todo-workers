export interface TaskEntity {
	id: string;
	title: string;
	description?: string;
	states: 'pending' | 'in_progress' | 'completed' | 'cancelled';
	priority?: 'low' | 'medium' | 'high' | 'urgent';
	tags: string[];
	startedAt?: string;
	expiresAt?: string;
	completedAt?: string;
}
