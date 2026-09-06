import { getPostgresAggregatedSummary } from '../services/telemetryDbService.js';

async function main() {
  console.log('=== Starting 7-day Telemetry Ingest & PostgreSQL Aggregation ===');
  const t0 = Date.now();
  const summary = await getPostgresAggregatedSummary(7, '2026-09-06', true);
  const elapsed = Date.now() - t0;
  console.log('=== Ingestion & PostgreSQL Aggregation Completed ===');
  console.log(`Total time elapsed: ${(elapsed / 1000).toFixed(1)}s`);
  console.log('Date range:', summary.dateRange);
  console.log('PostgreSQL KPIs:', summary.kpis);
  console.log('Gateways found:', summary.gateways.length);
  console.log('Top 3 Gateways:', summary.gateways.slice(0, 3));
  console.log('Recent frames sample length:', summary.recentFrames.length);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in 7-day ingest:', err);
  process.exit(1);
});
