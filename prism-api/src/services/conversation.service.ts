import { redis } from '../config/redis';

export interface ConversationState {
    flow: string;
    step: string;
    data: any;
    businessId?: string;
    currentBusinessName?: string;
    activeProjectId?: string;
    activeProjectName?: string;
    updatedAt: number;
}

export class ConversationService {
    private readonly TTL = 60 * 30; // 30 minutes

    async getState(userId: string): Promise<ConversationState | null> {
        const data = await redis.get(`conversation:${userId}`);
        return data ? JSON.parse(data) : null;
    }

    async setState(userId: string, state: Omit<ConversationState, 'updatedAt'>) {
        const fullState: ConversationState = {
            ...state,
            updatedAt: Date.now()
        };
        await redis.setex(`conversation:${userId}`, this.TTL, JSON.stringify(fullState));
        return fullState;
    }

    async updateState(userId: string, partialState: Partial<ConversationState>) {
        const currentState = await this.getState(userId);
        if (!currentState) return null;

        const newState = {
            ...currentState,
            ...partialState,
            data: { ...currentState.data, ...(partialState.data || {}) },
            updatedAt: Date.now()
        };

        await redis.setex(`conversation:${userId}`, this.TTL, JSON.stringify(newState));
        return newState;
    }

    async clearState(userId: string) {
        await redis.del(`conversation:${userId}`);
    }
}

export const conversationService = new ConversationService();
