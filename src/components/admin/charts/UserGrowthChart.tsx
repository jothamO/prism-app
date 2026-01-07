import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface GrowthDataPoint {
  date: string;
  users: number;
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
      
      // Query profiles table (single source of truth for web registrations)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      // Group by date
      const grouped: Record<string, number> = {};
      
      (profiles || []).forEach(profile => {
        const date = profile.created_at?.split("T")[0] || "";
        if (!grouped[date]) {
          grouped[date] = 0;
        }
        grouped[date]++;
      });

      // Fill in missing dates and format
      const filledData: GrowthDataPoint[] = [];
      const current = new Date(thirtyDaysAgo);
      const today = new Date();
      
      while (current <= today) {
        const dateStr = current.toISOString().split("T")[0];
        filledData.push({
          date: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          users: grouped[dateStr] || 0
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
        <Bar 
          dataKey="users" 
          name="New Users" 
          fill="hsl(199 89% 48%)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
