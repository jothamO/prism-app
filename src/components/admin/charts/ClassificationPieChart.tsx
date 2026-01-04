import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface ClassificationData {
  name: string;
  value: number;
  color: string;
}

export function ClassificationPieChart() {
  const [data, setData] = useState<ClassificationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClassificationData();
  }, []);

  async function fetchClassificationData() {
    try {
      const { data: transactions } = await supabase
        .from("bank_transactions")
        .select("classification_source")
        .not("classification_source", "is", null)
        .limit(1000);

      // Count by classification source
      const counts: Record<string, number> = {
        ai: 0,
        rule: 0,
        pattern: 0,
        user: 0,
        other: 0
      };

      (transactions || []).forEach(t => {
        const source = (t.classification_source || "").toLowerCase();
        if (source.includes("ai") || source.includes("openai") || source.includes("gpt")) {
          counts.ai++;
        } else if (source.includes("rule")) {
          counts.rule++;
        } else if (source.includes("pattern")) {
          counts.pattern++;
        } else if (source.includes("user") || source.includes("manual")) {
          counts.user++;
        } else {
          counts.other++;
        }
      });

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      setData([
        { name: "AI Classification", value: counts.ai, color: "hsl(262 83% 58%)" },
        { name: "Rule-Based", value: counts.rule, color: "hsl(199 89% 48%)" },
        { name: "Pattern Match", value: counts.pattern, color: "hsl(142 76% 36%)" },
        { name: "User Corrected", value: counts.user, color: "hsl(38 92% 50%)" },
        { name: "Other", value: counts.other, color: "hsl(var(--muted-foreground))" },
      ].filter(d => d.value > 0));
    } catch (error) {
      console.error("Error fetching classification data:", error);
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

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No classification data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))"
          }}
          formatter={(value: number) => [`${value} (${((value / total) * 100).toFixed(1)}%)`, ""]}
        />
        <Legend 
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
