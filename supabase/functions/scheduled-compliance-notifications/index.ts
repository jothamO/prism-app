import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


interface ScheduledTask {
  type: 'deadline_reminder' | 'effective_soon' | 'expiring_exemption';
  daysBefore: number;
  severity: 'low' | 'medium' | 'high';
}

const SCHEDULED_TASKS: ScheduledTask[] = [
  { type: 'deadline_reminder', daysBefore: 7, severity: 'medium' },
  { type: 'deadline_reminder', daysBefore: 3, severity: 'high' },
  { type: 'deadline_reminder', daysBefore: 1, severity: 'high' },
  { type: 'effective_soon', daysBefore: 14, severity: 'low' },
  { type: 'effective_soon', daysBefore: 7, severity: 'medium' },
  { type: 'expiring_exemption', daysBefore: 30, severity: 'medium' },
];

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function generateNotificationKey(type: string, referenceId: string, daysBefore: number): string {
  return `${type}_${referenceId}_${daysBefore}days`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const today = new Date();
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      tasks: [] as { type: string; notifications: number }[],
    };

    // Process each scheduled task
    for (const task of SCHEDULED_TASKS) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + task.daysBefore);
      const targetDateStr = formatDate(targetDate);

      let notificationsCreated = 0;

      if (task.type === 'deadline_reminder') {
        // Find deadlines occurring on the target date
        const { data: deadlines, error: deadlineError } = await supabase
          .from('tax_deadlines')
          .select('id, title, description, deadline_type, day_of_month, month_of_year, specific_date')
          .eq('is_active', true);

        if (deadlineError) {
          console.error('Error fetching deadlines:', deadlineError);
          results.errors++;
          continue;
        }

        // Check each deadline to see if it matches target date
        for (const deadline of deadlines || []) {
          let matches = false;
          
          if (deadline.specific_date) {
            matches = deadline.specific_date === targetDateStr;
          } else if (deadline.day_of_month && deadline.month_of_year) {
            const targetMonth = targetDate.getMonth() + 1;
            const targetDay = targetDate.getDate();
            matches = deadline.day_of_month === targetDay && deadline.month_of_year === targetMonth;
          } else if (deadline.day_of_month) {
            // Monthly recurrence
            matches = deadline.day_of_month === targetDate.getDate();
          }

          if (!matches) continue;

          const notificationKey = generateNotificationKey('deadline', deadline.id, task.daysBefore);

          // Check if already sent
          const { data: existing } = await supabase
            .from('notification_history')
            .select('id')
            .eq('notification_key', notificationKey)
            .single();

          if (existing) {
            results.skipped++;
            continue;
          }

          // Get users with deadline notification preferences
          const { data: users } = await supabase
            .from('user_compliance_preferences')
            .select('user_id')
            .eq('notify_deadline_reminders', true);

          if (!users || users.length === 0) continue;

          // Create notifications for each user
          const notifications = users.map(user => ({
            user_id: user.user_id,
            notification_type: 'deadline_reminder',
            title: `${task.daysBefore === 1 ? 'Tomorrow' : `${task.daysBefore} days`}: ${deadline.title}`,
            message: deadline.description || `Don't forget: ${deadline.title} is due ${task.daysBefore === 1 ? 'tomorrow' : `in ${task.daysBefore} days`}.`,
            severity: task.severity,
            metadata: {
              deadline_id: deadline.id,
              deadline_type: deadline.deadline_type,
              days_before: task.daysBefore,
              due_date: targetDateStr,
            },
            action_url: '/tax-calendar',
          }));

          const { error: insertError } = await supabase
            .from('compliance_notifications')
            .insert(notifications);

          if (insertError) {
            console.error('Error inserting notifications:', insertError);
            results.errors++;
            continue;
          }

          // Record in history
          await supabase.from('notification_history').insert({
            notification_key: notificationKey,
            notification_type: 'deadline_reminder',
            reference_id: deadline.id,
            reference_date: targetDateStr,
            recipients_count: users.length,
            metadata: { task_days_before: task.daysBefore },
          });

          notificationsCreated += users.length;
          results.processed++;
        }
      }

      if (task.type === 'effective_soon') {
        // Find rules becoming effective on target date
        const { data: upcomingRules, error: rulesError } = await supabase
          .from('upcoming_tax_rules')
          .select('id, rule_name, rule_type, description, effective_from')
          .eq('effective_from', targetDateStr);

        if (rulesError) {
          console.error('Error fetching upcoming rules:', rulesError);
          results.errors++;
          continue;
        }

        for (const rule of upcomingRules || []) {
          const notificationKey = generateNotificationKey('effective', rule.id, task.daysBefore);

          // Check if already sent
          const { data: existing } = await supabase
            .from('notification_history')
            .select('id')
            .eq('notification_key', notificationKey)
            .single();

          if (existing) {
            results.skipped++;
            continue;
          }

          // Get users with rule change preferences
          const { data: users } = await supabase
            .from('user_compliance_preferences')
            .select('user_id')
            .eq('notify_rule_changes', true);

          if (!users || users.length === 0) continue;

          const notifications = users.map(user => ({
            user_id: user.user_id,
            notification_type: 'rule_effective_soon',
            title: `New Rule: ${rule.rule_name} (Effective ${rule.effective_from})`,
            message: rule.description || `A new ${rule.rule_type} rule will take effect ${task.daysBefore === 7 ? 'next week' : `in ${task.daysBefore} days`}.`,
            severity: task.severity,
            rule_id: rule.id,
            metadata: {
              rule_type: rule.rule_type,
              days_before: task.daysBefore,
              effective_date: rule.effective_from,
            },
            action_url: '/admin/compliance/rules',
          }));

          const { error: insertError } = await supabase
            .from('compliance_notifications')
            .insert(notifications);

          if (insertError) {
            console.error('Error inserting rule notifications:', insertError);
            results.errors++;
            continue;
          }

          await supabase.from('notification_history').insert({
            notification_key: notificationKey,
            notification_type: 'rule_effective_soon',
            reference_id: rule.id,
            reference_date: rule.effective_from,
            recipients_count: users.length,
            metadata: { task_days_before: task.daysBefore },
          });

          notificationsCreated += users.length;
          results.processed++;
        }
      }

      if (task.type === 'expiring_exemption') {
        // Find rules expiring on target date
        const { data: expiringRules, error: rulesError } = await supabase
          .from('compliance_rules')
          .select('id, rule_name, rule_type, description, effective_to')
          .eq('is_active', true)
          .eq('effective_to', targetDateStr)
          .in('rule_type', ['relief', 'exemption', 'threshold']);

        if (rulesError) {
          console.error('Error fetching expiring rules:', rulesError);
          results.errors++;
          continue;
        }

        for (const rule of expiringRules || []) {
          const notificationKey = generateNotificationKey('expiring', rule.id, task.daysBefore);

          const { data: existing } = await supabase
            .from('notification_history')
            .select('id')
            .eq('notification_key', notificationKey)
            .single();

          if (existing) {
            results.skipped++;
            continue;
          }

          // Get users with exemption preferences
          const { data: users } = await supabase
            .from('user_compliance_preferences')
            .select('user_id')
            .eq('notify_rule_changes', true);

          if (!users || users.length === 0) continue;

          const notifications = users.map(user => ({
            user_id: user.user_id,
            notification_type: 'exemption_expiring',
            title: `Expiring: ${rule.rule_name}`,
            message: `The ${rule.rule_type} "${rule.rule_name}" will expire in ${task.daysBefore} days. Review your tax planning.`,
            severity: task.severity,
            rule_id: rule.id,
            metadata: {
              rule_type: rule.rule_type,
              days_before: task.daysBefore,
              expiry_date: rule.effective_to,
            },
            action_url: '/admin/compliance/rules',
          }));

          const { error: insertError } = await supabase
            .from('compliance_notifications')
            .insert(notifications);

          if (insertError) {
            console.error('Error inserting expiring notifications:', insertError);
            results.errors++;
            continue;
          }

          await supabase.from('notification_history').insert({
            notification_key: notificationKey,
            notification_type: 'exemption_expiring',
            reference_id: rule.id,
            reference_date: rule.effective_to,
            recipients_count: users.length,
            metadata: { task_days_before: task.daysBefore },
          });

          notificationsCreated += users.length;
          results.processed++;
        }
      }

      results.tasks.push({ type: `${task.type}_${task.daysBefore}d`, notifications: notificationsCreated });
    }

    console.log('[scheduled-compliance-notifications] Results:', results);

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[scheduled-compliance-notifications] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
