import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

interface CountResult { count: number }
interface AvgResult { avg: number | null }
interface SumResult { total: number | null }

export async function GET() {
  const db = getDb();

  const totalDeals = (db.prepare('SELECT COUNT(*) as count FROM deals').get() as CountResult).count;
  const activeDeals = (db.prepare("SELECT COUNT(*) as count FROM deals WHERE status NOT IN ('closed', 'passed')").get() as CountResult).count;
  const closedThisMonth = (db.prepare(
    "SELECT COUNT(*) as count FROM deals WHERE status = 'closed' AND updated_at >= date('now', 'start of month')"
  ).get() as CountResult).count;
  const avgArv = (db.prepare('SELECT AVG(arv_adjusted) as avg FROM deals WHERE arv_adjusted IS NOT NULL').get() as AvgResult).avg;
  const pipelineValue = (db.prepare(
    "SELECT SUM(mao) as total FROM deals WHERE status NOT IN ('closed', 'passed') AND mao IS NOT NULL"
  ).get() as SumResult).total;

  const goCount = (db.prepare("SELECT COUNT(*) as count FROM deals WHERE recommendation = 'go'").get() as CountResult).count;
  const negotiateCount = (db.prepare("SELECT COUNT(*) as count FROM deals WHERE recommendation = 'negotiate'").get() as CountResult).count;
  const passCount = (db.prepare("SELECT COUNT(*) as count FROM deals WHERE recommendation = 'pass'").get() as CountResult).count;

  return NextResponse.json({
    total_deals: totalDeals,
    active_deals: activeDeals,
    closed_this_month: closedThisMonth,
    avg_arv: avgArv || 0,
    pipeline_value: pipelineValue || 0,
    recommendations: {
      go: goCount,
      negotiate: negotiateCount,
      pass: passCount,
    },
  });
}
