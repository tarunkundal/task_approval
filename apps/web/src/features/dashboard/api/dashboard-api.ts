import type { DashboardSummaryDto } from '@workspace/shared';
import { api } from '@/lib/api/client';

/** `GET /dashboard/summary`: counts over the caller's scope, independent of list pagination. */
export function getDashboardSummary(): Promise<DashboardSummaryDto> {
  return api.get<DashboardSummaryDto>('/dashboard/summary');
}
