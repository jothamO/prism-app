import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface GrowthDataPoint {
  date: string;
  telegram: number;
  whatsapp: number;
  total: number;
}

export function UserGrowthChart() {
  const [data, setData] = useState<GrowthDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserGrowthData();
  }, []);

  async function fetchUserGrowthData() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: users } = await supabase
        .from("users")
        .select("created_at, platform")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      // Group by date and platform
      const grouped: Record<string, { telegram: number; whatsapp: number }> = {};
      
      (users || []).forEach(user => {
        const date = user.created_at?.split("T")[0] || "";
        if (!grouped[date]) {
          grouped[date] = { telegram: 0, whatsapp: 0 };
        }
        if (user.platform === "telegram") {
          grouped[date].telegram++;
        } else if (user.platform === "whatsapp") {
          grouped[date].whatsapp++;
        }
      });

      // Fill in missing dates and format
      const filledData: GrowthDataPoint[] = [];
      const current = new Date(thirtyDaysAgo);
      const today = new Date();
      
      while (current <= today) {
        const dateStr = current.toISOString().split("T")[0];
        const counts = grouped[dateStr] || { telegram: 0, whatsapp: 0 };
        filledData.push({
          date: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          telegram: counts.telegram,
          whatsapp: counts.whatsapp,
          total: counts.telegram + counts.whatsapp
        });
        current.setDate(current.getDate() + 1);
      }

      setData(filledData);
    } catch (error) {
      console.error("Error fetching user growth data:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading chart...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
          dataKey="date" 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickLine={{ stroke: "hsl(var(--border))" }}
          axisLine={{ stroke: "hsl(var(--border))" }}
          interval="preserveStartEnd"
        />
        <YAxis 
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          tickLine={{ stroke: "hsl(var(--border))" }}
          axisLine={{ stroke: "hsl(var(--border))" }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))"
          }}
        />
        <Legend 
          wrapperStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Bar 
          dataKey="telegram" 
          name="Telegram" 
          fill="hsl(199 89% 48%)"
          radius={[4, 4, 0, 0]}
          stackId="a"
        />
        <Bar 
          dataKey="whatsapp" 
          name="WhatsApp" 
          fill="hsl(142 76% 36%)"
          radius={[4, 4, 0, 0]}
          stackId="a"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
