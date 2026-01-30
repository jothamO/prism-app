import { useState } from "react";
import {
  BarChart3,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Smartphone,
  CreditCard,
  Wallet,
  Globe,
  Building2,
  Zap,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { useTransactionAnalytics } from "@/hooks/useTransactionAnalytics";
import { useCBNRates } from "@/hooks/useCBNRates";

export default function AdminAnalytics() {
  const [dateRange, setDateRange] = useState(30);
  const { transactionBreakdown, vatSummary, classificationBreakdown, mobileMoneyProviders, dailyTrends, isLoading } = useTransactionAnalytics(dateRange);
  const { currentRates, rateHistory, rateLogs, triggerFetch, getFreshness } = useCBNRates();

  const freshness = getFreshness();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-NG').format(num);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const breakdown = transactionBreakdown.data;
  const vat = vatSummary.data;
  const classification = classificationBreakdown.data;
  const providers = mobileMoneyProviders.data || [];
  const usdRate = currentRates.data?.find(r => r.currency === 'USD');

  // Calculate percentages for pie chart visualization
  const totalTx = breakdown?.total_count || 1;
  const txTypes = [
    { name: 'Standard', count: breakdown?.standard_count || 0, color: 'bg-blue-500' },
    { name: 'USSD', count: breakdown?.ussd_count || 0, color: 'bg-purple-500' },
    { name: 'POS', count: breakdown?.pos_count || 0, color: 'bg-green-500' },
    { name: 'Mobile Money', count: breakdown?.mobile_money_count || 0, color: 'bg-orange-500' },
    { name: 'Foreign Currency', count: breakdown?.foreign_currency_count || 0, color: 'bg-cyan-500' },
  ].filter(t => t.count > 0);

  // Calculate USD trend
  const usdTrend = rateHistory.data && rateHistory.data.length >= 2
    ? ((rateHistory.data[rateHistory.data.length - 1].rate - rateHistory.data[rateHistory.data.length - 2].rate) / rateHistory.data[rateHistory.data.length - 2].rate * 100).toFixed(2)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Nigerian transaction breakdown with VAT implications</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <BarChart3 className="w-4 h-4" />
            Total Transactions
          </div>
          <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.total_count || 0)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <TrendingUp className="w-4 h-4" />
            Total VAT
          </div>
          <p className="text-2xl font-bold text-green-500">{formatCurrency(vat?.total_vat || 0)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <ArrowUpRight className="w-4 h-4" />
            Total Credits
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(vat?.total_credits || 0)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <ArrowDownRight className="w-4 h-4" />
            Total Debits
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(vat?.total_debits || 0)}</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Nigerian Transaction Breakdown */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Nigerian Transaction Types</h2>
          </div>

          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-muted/30 rounded-lg p-4 text-center">
                <Zap className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.ussd_count || 0)}</p>
                <p className="text-sm text-muted-foreground">USSD Transactions</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((breakdown?.ussd_count || 0) / totalTx * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-center">
                <CreditCard className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.pos_count || 0)}</p>
                <p className="text-sm text-muted-foreground">POS Transactions</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((breakdown?.pos_count || 0) / totalTx * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-center">
                <Smartphone className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.mobile_money_count || 0)}</p>
                <p className="text-sm text-muted-foreground">Mobile Money</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((breakdown?.mobile_money_count || 0) / totalTx * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-center">
                <Globe className="w-8 h-8 text-cyan-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.foreign_currency_count || 0)}</p>
                <p className="text-sm text-muted-foreground">Foreign Currency</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((breakdown?.foreign_currency_count || 0) / totalTx * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-center">
                <Building2 className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.bank_charge_count || 0)}</p>
                <p className="text-sm text-muted-foreground">Bank Charges</p>
                <p className="text-xs text-muted-foreground mt-1">
                  EMTL: {formatNumber(breakdown?.emtl_count || 0)}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-center">
                <Wallet className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{formatNumber(breakdown?.standard_count || 0)}</p>
                <p className="text-sm text-muted-foreground">Standard</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((breakdown?.standard_count || 0) / totalTx * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}

          {/* Mobile Money Providers */}
          {providers.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Mobile Money Providers</h3>
              <div className="flex flex-wrap gap-2">
                {providers.slice(0, 5).map(p => (
                  <span key={p.provider} className="bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full text-sm">
                    {p.provider}: {formatNumber(p.count)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CBN Exchange Rates */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">CBN Rates</h2>
            </div>
            <button
              onClick={() => triggerFetch.mutate()}
              disabled={triggerFetch.isPending}
              className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${triggerFetch.isPending ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* USD Rate */}
          {usdRate ? (
            <div className="bg-muted/30 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">USD/NGN</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${freshness.status === 'fresh' ? 'bg-green-500/10 text-green-500' :
                    freshness.status === 'recent' ? 'bg-yellow-500/10 text-yellow-500' :
                      'bg-red-500/10 text-red-500'
                  }`}>
                  {freshness.message}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-foreground">₦{formatNumber(usdRate.rate)}</p>
                {usdTrend && (
                  <div className={`flex items-center text-xs mb-1 ${Number(usdTrend) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {Number(usdTrend) > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                    {Math.abs(Number(usdTrend))}%
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Source: {usdRate.source} • {new Date(usdRate.rate_date).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-lg p-4 mb-4 text-center">
              <p className="text-muted-foreground">No rates available</p>
              <button
                onClick={() => triggerFetch.mutate()}
                className="mt-2 text-primary text-sm hover:underline"
              >
                Fetch rates now
              </button>
            </div>
          )}

          {/* Other Currencies */}
          <div className="space-y-2">
            {currentRates.data?.filter(r => r.currency !== 'USD').slice(0, 8).map(rate => (
              <div key={rate.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/30 px-1 rounded transition-colors">
                <span className="text-sm font-medium text-foreground">{rate.currency}/NGN</span>
                <span className="text-sm text-muted-foreground">₦{formatNumber(rate.rate)}</span>
              </div>
            ))}
          </div>

          {/* Rate Logs */}
          {rateLogs.data && rateLogs.data.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Recent Fetch Logs</h3>
              <div className="space-y-1">
                {rateLogs.data.slice(0, 3).map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-xs">
                    {log.success ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-red-500" />
                    )}
                    <span className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()} - {log.currencies_updated} updated
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VAT & Classification Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* VAT Summary */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">VAT Implications</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">VAT Collected</p>
              <p className="text-2xl font-bold text-green-500">{formatCurrency(vat?.total_vat || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">VAT-Applicable</p>
              <p className="text-2xl font-bold text-foreground">{formatNumber(vat?.vat_applicable_count || 0)}</p>
              <p className="text-xs text-muted-foreground">
                of {formatNumber(vat?.total_transactions || 0)} transactions
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">VAT Rate</span>
              <span className="text-sm font-medium text-foreground">7.5%</span>
            </div>
            <div className="mt-2 bg-muted/30 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${((vat?.vat_applicable_count || 0) / (vat?.total_transactions || 1) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((vat?.vat_applicable_count || 0) / (vat?.total_transactions || 1) * 100).toFixed(1)}% of transactions have VAT
            </p>
          </div>
        </div>

        {/* Classification Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Classification Sources</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-foreground">AI Classified</span>
              </div>
              <span className="text-sm font-medium">{formatNumber(classification?.ai_count || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-sm text-foreground">Rule-Based</span>
              </div>
              <span className="text-sm font-medium">{formatNumber(classification?.rule_based_count || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-foreground">Pattern Match</span>
              </div>
              <span className="text-sm font-medium">{formatNumber(classification?.pattern_count || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500" />
                <span className="text-sm text-foreground">Unclassified</span>
              </div>
              <span className="text-sm font-medium">{formatNumber(classification?.unclassified_count || 0)}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg Confidence</span>
              <span className={`text-sm font-medium ${getConfidenceColor(classification?.avg_confidence || 0)}`}>
                {((classification?.avg_confidence || 0) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}