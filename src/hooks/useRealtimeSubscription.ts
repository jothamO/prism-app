import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableName = 
  | 'code_change_proposals'
  | 'code_proposal_queue'
  | 'compliance_rules'
  | 'legal_documents'
  | 'legal_provisions'
  | 'chat_messages'
  | 'compliance_notifications'
  | 'review_queue';

interface UseRealtimeSubscriptionOptions {
  /** The table to subscribe to */
  table: TableName;
  /** Query keys to invalidate when changes occur */
  queryKeys: string[][];
  /** Optional filter - only trigger on changes matching this filter */
  filter?: {
    column: string;
    value: string | number | boolean;
  };
  /** Optional callback when a change is received */
  onInsert?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  /** Whether the subscription is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook to subscribe to realtime changes on a Supabase table
 * Automatically invalidates specified query keys when changes occur
 */
export function useRealtimeSubscription({
  table,
  queryKeys,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeSubscriptionOptions) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Create a unique channel name
    const channelName = filter 
      ? `realtime-${table}-${filter.column}-${filter.value}`
      : `realtime-${table}`;

    // Build the filter string for Supabase
    const filterStr = filter ? `${filter.column}=eq.${filter.value}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filterStr,
        },
        (payload) => {
          // Invalidate all specified query keys
          queryKeys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });

          // Call specific callbacks if provided
          if (payload.eventType === 'INSERT' && onInsert) {
            onInsert(payload);
          } else if (payload.eventType === 'UPDATE' && onUpdate) {
            onUpdate(payload);
          } else if (payload.eventType === 'DELETE' && onDelete) {
            onDelete(payload);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, JSON.stringify(queryKeys), filter?.column, filter?.value, enabled, queryClient]);

  return channelRef.current;
}

/**
 * Hook to subscribe to multiple tables at once
 */
export function useMultiTableRealtimeSubscription(
  subscriptions: Array<{
    table: TableName;
    queryKeys: string[][];
    filter?: { column: string; value: string | number | boolean };
  }>,
  enabled = true
) {
  const queryClient = useQueryClient();
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    if (!enabled) return;

    // Clean up previous channels
    channelsRef.current.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Create new channels
    subscriptions.forEach(({ table, queryKeys, filter }) => {
      const channelName = filter 
        ? `multi-realtime-${table}-${filter.column}-${filter.value}-${Date.now()}`
        : `multi-realtime-${table}-${Date.now()}`;

      const filterStr = filter ? `${filter.column}=eq.${filter.value}` : undefined;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            filter: filterStr,
          },
          () => {
            queryKeys.forEach((key) => {
              queryClient.invalidateQueries({ queryKey: key });
            });
          }
        )
        .subscribe();

      channelsRef.current.push(channel);
    });

    // Cleanup on unmount
    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [JSON.stringify(subscriptions), enabled, queryClient]);

  return channelsRef.current;
}
