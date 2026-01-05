import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface ConnectedAccount {
  id: string;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  accountType: string | null;
  status: string | null;
  lastSyncedAt: string | null;
  monoAccountId: string;
}

interface UseConnectedAccountsReturn {
  accounts: ConnectedAccount[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  syncAccount: (accountId: string) => Promise<void>;
  syncing: string | null;
}

export function useConnectedAccounts(): UseConnectedAccountsReturn {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: ConnectedAccount[] = (data || []).map((acc) => ({
        id: acc.id,
        bankName: acc.bank_name,
        accountName: acc.account_name,
        accountNumber: acc.account_number,
        accountType: acc.account_type,
        status: acc.status,
        lastSyncedAt: acc.last_synced_at,
        monoAccountId: acc.mono_account_id,
      }));

      setAccounts(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch accounts';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const syncAccount = useCallback(async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    try {
      setSyncing(accountId);

      const { error: syncError } = await supabase.functions.invoke('mono-sync-transactions', {
        body: {
          accountId: account.monoAccountId,
          userId: user?.id,
        },
      });

      if (syncError) throw syncError;

      toast({
        title: 'Sync Started',
        description: `Syncing transactions for ${account.bankName || 'your account'}...`,
      });

      // Refetch to update last_synced_at
      await fetchAccounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync account';
      toast({
        title: 'Sync Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSyncing(null);
    }
  }, [accounts, user?.id, toast, fetchAccounts]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    refetch: fetchAccounts,
    syncAccount,
    syncing,
  };
}
